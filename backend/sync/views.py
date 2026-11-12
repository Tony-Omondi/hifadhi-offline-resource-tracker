from datetime import datetime, timezone

from django.conf import settings
from django.db import connection
from django.http import HttpResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import AppliedOp, Record
from .services import apply_operation, changes_since, now_ms, serialize

MAX_OPS_PER_REQUEST = 200


@api_view(["GET", "HEAD"])
def health(request):
    """Liveness + readiness: 200 when the app and its database answer, 503 otherwise."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        db_ok = True
    except Exception:  # any DB failure means "not ready"
        db_ok = False

    body = {
        "status": "ok" if db_ok else "degraded",
        "database": "ok" if db_ok else "unavailable",
        "version": settings.APP_VERSION,
        "time": datetime.now(timezone.utc).isoformat(),
    }
    return Response(body, status=200 if db_ok else 503)


def index(request):
    """Serve the React app shell built by Vite (frontend/dist/index.html)."""
    index_file = settings.FRONTEND_DIST / "index.html"
    if not index_file.exists():
        return HttpResponse(
            "Frontend not built. Run `npm run build` in frontend/, or use `npm run dev` on :5173.",
            content_type="text/plain",
            status=503,
        )
    return HttpResponse(index_file.read_text(encoding="utf-8"), content_type="text/html")


@api_view(["POST"])
def sync(request):
    """Push queued ops (applied strictly in the order sent), then pull changes after `cursor`.

    Body: {"device_id": str, "cursor": int, "ops": [op, ...]}
    Reply: {"results": [...one per op, same order], "changes": [...], "cursor": int,
            "has_more": bool, "server_time": ms}

    Demo fault injection: header `X-Simulate-Failure: drop-response` applies the ops and
    then answers 503, exactly like a connection dropping after the server did the work.
    """
    body = request.data if isinstance(request.data, dict) else {}
    ops = body.get("ops", [])
    cursor = body.get("cursor", 0)
    if not isinstance(ops, list) or len(ops) > MAX_OPS_PER_REQUEST:
        return Response({"error": f"ops must be a list of at most {MAX_OPS_PER_REQUEST}"}, status=400)
    if isinstance(cursor, bool) or not isinstance(cursor, int) or cursor < 0:
        return Response({"error": "cursor must be a whole number >= 0"}, status=400)

    results = [apply_operation(raw) for raw in ops]  # FIFO: index order is apply order

    failure = request.headers.get("X-Simulate-Failure", "")
    if failure == "drop-response" and settings.FAULT_INJECTION_ENABLED:
        return Response({"error": "simulated dropped connection (ops were applied)"}, status=503)

    changes, next_cursor, has_more = changes_since(cursor)
    return Response(
        {
            "results": results,
            "changes": changes,
            "cursor": next_cursor,
            "has_more": has_more,
            "server_time": now_ms(),
        }
    )


@api_view(["GET"])
def records(request):
    """Read-only view of the server's record map (live records only)."""
    rows = Record.objects.filter(deleted=False)
    return Response({"count": rows.count(), "records": [serialize(r) for r in rows]})


@api_view(["GET"])
def op_log(request):
    """The most recent entries of the server's operation-ID set."""
    entries = AppliedOp.objects.all()[:50]
    return Response(
        {
            "total": AppliedOp.objects.count(),
            "recent": [
                {
                    "op_id": str(e.op_id),
                    "type": e.op_type,
                    "record_id": str(e.record_id),
                    "device_id": e.device_id,
                    "status": e.status,
                    "applied_at": e.applied_at.isoformat(),
                }
                for e in entries
            ],
        }
    )


def service_worker(request):
    """Serve the service worker from the site root so it can control every page."""
    sw_file = settings.FRONTEND_DIST / "sw.js"
    if not sw_file.exists():
        return HttpResponse("// no service worker in this build", content_type="application/javascript")
    response = HttpResponse(sw_file.read_text(encoding="utf-8"), content_type="application/javascript")
    response["Cache-Control"] = "no-cache"
    return response
