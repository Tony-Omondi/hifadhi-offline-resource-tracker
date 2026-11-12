#!/usr/bin/env python3
"""Functional check of a deployed Hifadhi instance (standard library only).

Step 1, after deploying:
    python3 scripts/hosted_check.py https://<your-app-url> --save hosted-state.json

Step 2, after a restart or redeploy on PrimeCloud:
    python3 scripts/hosted_check.py https://<your-app-url> --after-restart hosted-state.json

Step 1 checks /healthz, the app shell, ordered sync, op-ID dedup, two-device conflict
resolution, deletes, and a dropped reply followed by a retry. Step 2 proves that records
AND the server's operation-ID set survived the restart: old ops come back as "duplicate".

Add --report <file.md> to write the results as Markdown for the submission evidence.
Test records are named "HOSTED-CHECK ..." so they are easy to tell apart from real stock.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{f'  ({detail})' if detail else ''}")
    return ok


def request(base, path, body=None, headers=None, timeout=15):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method="POST" if data else "GET")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "hifadhi-hosted-check")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            status = res.status
    except urllib.error.HTTPError as err:
        raw, status = err.read(), err.code
    elapsed = time.monotonic() - start
    try:
        payload = json.loads(raw)
    except ValueError:
        payload = raw.decode(errors="replace")
    return status, payload, elapsed


def now_ms():
    return int(time.time() * 1000)


def op(type_, record_id, data=None, base_version=0, device="hosted-check-a", ts=None):
    return {
        "op_id": str(uuid.uuid4()),
        "type": type_,
        "record_id": record_id,
        "base_version": base_version,
        "ts": ts or now_ms(),
        "device_id": device,
        "data": data or {},
    }


def sync(base, ops, headers=None):
    return request(base, "/api/sync", {"device_id": "hosted-check", "cursor": 0, "ops": ops}, headers)


def live_record(base, rid):
    status, body, _ = request(base, "/api/records")
    return next((r for r in body.get("records", []) if r["id"] == rid), None) if status == 200 else None


def first_run(base, save_path):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    print(f"Checking {base}")

    status, body, elapsed = request(base, "/healthz", timeout=5)
    check("GET /healthz answers 200 within 5 s", status == 200 and elapsed < 5, f"{status}, {elapsed * 1000:.0f} ms, database={body.get('database') if isinstance(body, dict) else '?'}")
    status, page, _ = request(base, "/")
    check("App shell is served at /", status == 200 and 'id="root"' in str(page))
    status, sw, _ = request(base, "/sw.js")
    check("Service worker is served at /sw.js", status == 200 and "caches" in str(sw))

    keep, gone = str(uuid.uuid4()), str(uuid.uuid4())
    batch = [
        op("create", keep, {"name": f"HOSTED-CHECK ORS {stamp}", "category": "medicine", "unit": "sachets", "quantity": 100}),
        op("adjust", keep, {"delta": -30, "reason": "dispensed"}),
        op("adjust", keep, {"delta": 12, "reason": "received"}),
        op("create", gone, {"name": f"HOSTED-CHECK to delete {stamp}", "quantity": 1}),
    ]
    status, body, _ = sync(base, batch)
    statuses = [r["status"] for r in body.get("results", [])] if status == 200 else []
    check("Batch of 4 ops applied in queue order", statuses == ["applied"] * 4 and [r["op_id"] for r in body["results"]] == [o["op_id"] for o in batch], ", ".join(statuses))
    rec = live_record(base, keep)
    check("Server state after ordered ops: 100 - 30 + 12 = 82", rec and rec["quantity"] == 82, f"quantity={rec and rec['quantity']}")

    status, body, _ = sync(base, batch)
    statuses = [r["status"] for r in body.get("results", [])]
    rec = live_record(base, keep)
    check("Resending the same batch: every op answered 'duplicate', nothing applied twice", statuses == ["duplicate"] * 4 and rec["quantity"] == 82, f"{', '.join(statuses)}; quantity={rec['quantity']}")

    lost = op("adjust", keep, {"delta": -2, "reason": "dispensed"})
    status, _, _ = sync(base, [lost], headers={"X-Simulate-Failure": "drop-response"})
    applied_once = live_record(base, keep)["quantity"] == 80
    status2, body2, _ = sync(base, [lost])
    rec = live_record(base, keep)
    check("Lost reply then retry: applied once, retry answered 'duplicate'", status == 503 and applied_once and body2["results"][0]["status"] == "duplicate" and rec["quantity"] == 80, f"first reply {status}, retry {body2['results'][0]['status']}, quantity={rec['quantity']}")

    version = rec["version"]
    t = now_ms()
    edit_a = op("update", keep, {"location": "Cold room"}, base_version=version, device="hosted-check-a", ts=t)
    edit_b = op("update", keep, {"location": "Shelf 4"}, base_version=version, device="hosted-check-b", ts=t + 50)
    status, body, _ = sync(base, [edit_b, edit_a])  # later edit arrives first
    second = body["results"][1]
    rec = live_record(base, keep)
    check("Concurrent edits: later write wins whatever the arrival order", rec["location"] == "Shelf 4" and second["status"] == "merged" and second["conflicts"][0]["winner"] == "theirs", f"location={rec['location']}, older edit -> {second['status']}/{second['conflicts'][0]['winner'] if second['conflicts'] else '-'}")

    delete = op("delete", gone, base_version=1)
    status, body, _ = sync(base, [delete])
    check("Delete is applied as a tombstone and leaves the live list", body["results"][0]["status"] == "applied" and live_record(base, gone) is None)

    status, body, _ = sync(base, [op("adjust", keep, {"delta": 0})])
    check("Invalid op is rejected with a reason", body["results"][0]["status"] == "rejected", body["results"][0].get("error"))

    all_ops = batch + [lost, edit_a, edit_b, delete]
    if save_path:
        with open(save_path, "w") as fh:
            json.dump({"base": base, "keep": keep, "gone": gone, "quantity": 80, "location": "Shelf 4", "ops": all_ops}, fh, indent=2)
        print(f"\nSaved state to {save_path}. Restart or redeploy the app, then run with --after-restart {save_path}")


def after_restart(base, state_path):
    state = json.load(open(state_path))
    print(f"Checking {base} after a restart/redeploy")
    status, body, elapsed = request(base, "/healthz", timeout=5)
    check("GET /healthz answers 200 within 5 s", status == 200 and elapsed < 5, f"{status}, {elapsed * 1000:.0f} ms")
    rec = live_record(base, state["keep"])
    check("Synced record survived the restart", rec and rec["quantity"] == state["quantity"] and rec["location"] == state["location"], f"quantity={rec and rec['quantity']}, location={rec and rec['location']}")
    check("Deleted record is still deleted", live_record(base, state["gone"]) is None)
    status, body, _ = sync(base, state["ops"])
    statuses = {r["status"] for r in body.get("results", [])}
    rec = live_record(base, state["keep"])
    check("Operation-ID set survived: every old op answered 'duplicate'", statuses == {"duplicate"} and rec["quantity"] == state["quantity"], f"{len(state['ops'])} ops -> {sorted(statuses)}; quantity={rec['quantity']}")


def write_report(path, base, mode):
    passed = sum(ok for _, ok, _ in results)
    lines = [
        f"# Hosted check: {mode}",
        "",
        f"- URL: {base}",
        f"- Run at: {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        f"- Result: {passed}/{len(results)} passed",
        "",
        "| Check | Result | Detail |",
        "|---|---|---|",
    ]
    lines += [f"| {name} | {'PASS' if ok else 'FAIL'} | {detail} |" for name, ok, detail in results]
    with open(path, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"Report written to {path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("url")
    parser.add_argument("--save", help="write state for the after-restart check")
    parser.add_argument("--after-restart", help="state file from a previous --save run")
    parser.add_argument("--report", help="write results as Markdown")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    try:
        if args.after_restart:
            after_restart(base, args.after_restart)
        else:
            first_run(base, args.save)
    except Exception as exc:  # network down, unexpected reply: report it as a failure
        check("Check ran to completion", False, repr(exc))
    if args.report:
        write_report(args.report, base, "after restart" if args.after_restart else "functional")
    failed = [name for name, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
