"""End-to-end tests of /api/sync: FIFO order, op-ID dedup, conflicts and failure cases."""
from unittest import mock

import pytest

from sync.models import AppliedOp, Record
from sync.services import MAX_FUTURE_SKEW_MS, apply_operation, now_ms

from .helpers import create, new_id, op, sync

pytestmark = pytest.mark.django_db


def record(rid):
    return Record.objects.get(pk=rid)


# ---------- FIFO order ----------

def test_batch_is_applied_in_queue_order_and_results_keep_that_order():
    rid = new_id()
    ops = [
        create(rid, quantity=100),
        op("adjust", rid, {"delta": -30, "reason": "dispensed"}, base_version=0),
        op("update", rid, {"location": "Pharmacy shelf 2"}, base_version=0),
        op("adjust", rid, {"delta": 50, "reason": "received"}, base_version=0),
    ]
    body = sync(_client(), ops).json()
    assert [r["op_id"] for r in body["results"]] == [o["op_id"] for o in ops]
    assert [r["status"] for r in body["results"]] == ["applied"] * 4
    assert [r["record"]["version"] for r in body["results"]] == [1, 2, 3, 4]
    rec = record(rid)
    assert (rec.quantity, rec.location, rec.version) == (120, "Pharmacy shelf 2", 4)


def test_out_of_order_ops_fail_which_is_why_the_queue_must_be_fifo():
    rid = new_id()
    adjust_first = op("adjust", rid, {"delta": -5})
    body = sync(_client(), [adjust_first, create(rid)]).json()
    assert body["results"][0]["status"] == "rejected"
    assert body["results"][0]["error"] == "record not found"
    assert record(rid).quantity == 100  # the early adjust was never applied


def test_change_feed_is_ordered_by_sequence_and_paginates_by_cursor():
    client = _client()
    ids = [new_id() for _ in range(3)]
    sync(client, [create(i, name=f"Item {n}") for n, i in enumerate(ids)])
    body = sync(client, [], cursor=0).json()
    seqs = [c["seq"] for c in body["changes"]]
    assert seqs == sorted(seqs) and len(seqs) == 3
    later = sync(client, [], cursor=seqs[1]).json()
    assert [c["id"] for c in later["changes"]] == [ids[2]]
    assert later["cursor"] == seqs[2]


# ---------- operation-ID set (idempotency) ----------

def test_resending_a_whole_batch_changes_nothing():
    client = _client()
    rid = new_id()
    ops = [create(rid, quantity=10), op("adjust", rid, {"delta": 5})]
    sync(client, ops)
    body = sync(client, ops).json()
    assert [r["status"] for r in body["results"]] == ["duplicate", "duplicate"]
    assert [r["original_status"] for r in body["results"]] == ["applied", "applied"]
    assert record(rid).quantity == 15
    assert AppliedOp.objects.count() == 2


def test_same_op_twice_in_one_batch_applies_once():
    rid = new_id()
    adjust = op("adjust", rid, {"delta": -4})
    body = sync(_client(), [create(rid, quantity=10), adjust, adjust]).json()
    assert [r["status"] for r in body["results"]] == ["applied", "applied", "duplicate"]
    assert record(rid).quantity == 6


def test_duplicate_reply_carries_the_current_record_so_the_client_converges():
    client = _client()
    rid = new_id()
    first = create(rid, quantity=10)
    sync(client, [first])
    sync(client, [op("adjust", rid, {"delta": 7}, device="device-b")])
    dup = sync(client, [first]).json()["results"][0]
    assert dup["status"] == "duplicate"
    assert dup["record"]["quantity"] == 17


# ---------- conflict resolution ----------

def test_concurrent_edits_to_the_same_field_converge_whatever_the_arrival_order():
    finals = []
    for order in ("a_first", "b_first"):
        rid = new_id()
        client = _client()
        sync(client, [create(rid, device="device-a")])
        edit_a = op("update", rid, {"location": "Cold room"}, base_version=1, device="device-a", ts=now_ms())
        edit_b = op("update", rid, {"location": "Shelf 4"}, base_version=1, device="device-b", ts=now_ms() + 10)
        batch = [edit_a, edit_b] if order == "a_first" else [edit_b, edit_a]
        results = sync(client, batch).json()["results"]
        finals.append(record(rid).location)
        second = results[1]
        assert second["status"] == "merged"
        assert second["conflicts"][0]["field"] == "location"
    assert finals == ["Shelf 4", "Shelf 4"]  # later write wins in both orders


def test_concurrent_edits_to_different_fields_both_survive():
    rid = new_id()
    client = _client()
    sync(client, [create(rid)])
    sync(client, [
        op("update", rid, {"location": "Cold room"}, base_version=1, device="device-a"),
        op("update", rid, {"min_stock": 40}, base_version=1, device="device-b"),
    ])
    rec = record(rid)
    assert (rec.location, rec.min_stock) == ("Cold room", 40)


def test_concurrent_stock_movements_add_up_instead_of_overwriting():
    rid = new_id()
    client = _client()
    sync(client, [create(rid, quantity=100)])
    sync(client, [
        op("adjust", rid, {"delta": -30}, base_version=1, device="clinic-a"),
        op("adjust", rid, {"delta": -25}, base_version=1, device="clinic-b"),
    ])
    assert record(rid).quantity == 45


def test_delete_wins_over_an_older_concurrent_edit():
    rid = new_id()
    client = _client()
    sync(client, [create(rid)])
    t = now_ms()
    sync(client, [op("delete", rid, base_version=1, device="device-a", ts=t + 100)])
    result = sync(client, [op("update", rid, {"name": "Renamed"}, base_version=1, device="device-b", ts=t)]).json()
    rec = record(rid)
    assert rec.deleted is True
    assert result["results"][0]["status"] == "applied"  # name merges onto the tombstone, no clash
    assert rec.name == "Renamed"


def test_far_future_device_clock_is_capped():
    rid = new_id()
    client = _client()
    sync(client, [create(rid)])
    sync(client, [op("update", rid, {"location": "X"}, base_version=1, device="bad-clock", ts=now_ms() + 10**12)])
    assert record(rid).field_meta["location"]["ts"] <= now_ms() + MAX_FUTURE_SKEW_MS


# ---------- failure cases ----------

def test_connection_lost_after_server_applied_then_retry_is_safe():
    client = _client()
    rid = new_id()
    ops = [create(rid, quantity=50), op("adjust", rid, {"delta": -10})]
    dropped = sync(client, ops, headers={"X-Simulate-Failure": "drop-response"})
    assert dropped.status_code == 503
    assert record(rid).quantity == 40  # server did the work, client never heard back

    retry = sync(client, ops).json()  # client still has both ops queued, sends them again
    assert [r["status"] for r in retry["results"]] == ["duplicate", "duplicate"]
    assert record(rid).quantity == 40  # not 30: the adjust was not applied twice


def test_crash_in_the_middle_of_a_batch_keeps_earlier_ops_and_loses_nothing():
    rid = new_id()
    ops = [create(rid, quantity=20), op("adjust", rid, {"delta": 5}), op("adjust", rid, {"delta": 7})]
    apply_operation(ops[0])
    apply_operation(ops[1])
    with pytest.raises(RuntimeError):
        apply_operation(ops[2], fail_before_commit=True)  # server dies mid-transaction
    assert record(rid).quantity == 25  # third op rolled back completely...
    assert not AppliedOp.objects.filter(pk=ops[2]["op_id"]).exists()  # ...including its op-ID

    body = sync(_client(), ops).json()  # client retries the whole batch
    assert [r["status"] for r in body["results"]] == ["duplicate", "duplicate", "applied"]
    assert record(rid).quantity == 32


def test_invalid_op_is_rejected_without_blocking_the_rest_of_the_queue():
    rid = new_id()
    bad = op("adjust", rid, {"delta": 0})
    ops = [create(rid, quantity=5), bad, op("adjust", rid, {"delta": 1})]
    body = sync(_client(), ops).json()
    assert [r["status"] for r in body["results"]] == ["applied", "rejected", "applied"]
    assert record(rid).quantity == 6
    again = sync(_client(), [bad]).json()["results"][0]
    assert again["status"] == "duplicate" and again["original_status"] == "rejected"


@pytest.mark.parametrize(
    "payload",
    [{"ops": "nope"}, {"ops": [{}] * 201}, {"ops": [], "cursor": -1}, {"ops": [], "cursor": "x"}],
)
def test_malformed_requests_get_400(payload):
    response = _client().post("/api/sync", payload, content_type="application/json")
    assert response.status_code == 400


def test_records_and_op_log_endpoints():
    client = _client()
    rid = new_id()
    sync(client, [create(rid)])
    assert client.get("/api/records").json()["count"] == 1
    assert client.get("/api/ops").json()["total"] == 1


def _client():
    from django.test import Client

    return Client()


def test_seed_command_is_idempotent(capsys):
    from django.core.management import call_command

    call_command("seed_sample_data")
    call_command("seed_sample_data")
    out = capsys.readouterr().out
    assert "16 applied" in out and "16 duplicate" in out
    assert Record.objects.count() == 16
