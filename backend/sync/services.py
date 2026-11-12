"""Apply operations exactly once, in the order received, and serve the change feed."""
import time
from datetime import date

from django.db import IntegrityError, transaction

from .conflict import LWW_FIELDS, merge_fields
from .models import AppliedOp, Record, SyncCounter
from .validation import validate_op

# A device clock far in the future would win every conflict forever; cap it.
MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
FEED_PAGE = 500


def now_ms() -> int:
    return int(time.time() * 1000)


def serialize(record: Record) -> dict:
    return {
        "id": str(record.id),
        "name": record.name,
        "category": record.category,
        "unit": record.unit,
        "location": record.location,
        "expiry_date": record.expiry_date.isoformat() if record.expiry_date else None,
        "min_stock": record.min_stock,
        "notes": record.notes,
        "quantity": record.quantity,
        "deleted": record.deleted,
        "version": record.version,
        "seq": record.seq,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
    }


def _next_seq() -> int:
    counter, _ = SyncCounter.objects.select_for_update().get_or_create(pk=1)
    counter.value += 1
    counter.save(update_fields=["value"])
    return counter.value


def _set_field(record: Record, name: str, value) -> None:
    if name == "expiry_date":
        value = date.fromisoformat(value) if value else None
    setattr(record, name, value)


def _result(op, status, record=None, conflicts=(), error=None) -> dict:
    return {
        "op_id": op.get("op_id"),
        "record_id": op.get("record_id"),
        "status": status,  # applied | merged | duplicate | rejected
        "conflicts": list(conflicts),
        "error": error,
        "record": serialize(record) if record else None,
    }


def _apply(op: dict) -> dict:
    """Apply one validated op. Caller holds the transaction."""
    rid, data = op["record_id"], op["data"]
    ts = min(op["ts"], now_ms() + MAX_FUTURE_SKEW_MS)
    device = op["device_id"]
    record = Record.objects.select_for_update().filter(pk=rid).first()

    if op["type"] == "create":
        if record is not None:
            return _result(op, "rejected", record, error="a record with this id already exists")
        record = Record(id=rid, version=1, seq=_next_seq())
        for name, value in data.items():
            _set_field(record, name, value)
        record.field_meta = {name: {"ts": ts, "dev": device, "v": 1} for name in LWW_FIELDS}
        record.save()
        return _result(op, "applied", record)

    if record is None:
        return _result(op, "rejected", error="record not found")

    if op["type"] == "adjust":
        record.quantity += data["delta"]
        record.version += 1
        record.seq = _next_seq()
        record.save()
        return _result(op, "applied", record)

    changes = {"deleted": True} if op["type"] == "delete" else data
    new_version = record.version + 1
    merge = merge_fields(
        current=serialize(record),
        field_meta=record.field_meta,
        base_version=op["base_version"],
        changes=changes,
        ts=ts,
        device=device,
        new_version=new_version,
    )
    if merge.applied:
        for name, value in merge.applied.items():
            _set_field(record, name, value)
        record.field_meta = merge.meta
        record.version = new_version
        record.seq = _next_seq()
        record.save()
    return _result(op, "merged" if merge.conflicts else "applied", record, merge.conflicts)


def _duplicate(op_id: str) -> dict:
    stored = AppliedOp.objects.get(pk=op_id)
    result = dict(stored.result)
    result["original_status"] = stored.status
    result["status"] = "duplicate"
    current = Record.objects.filter(pk=stored.record_id).first()
    result["record"] = serialize(current) if current else None
    return result


def apply_operation(raw: dict, fail_before_commit: bool = False) -> dict:
    """Apply one raw op exactly once.

    The op's effect and its entry in the operation-ID set commit in ONE transaction,
    so a crash leaves either both or neither: never "applied but not remembered".
    """
    op, error = validate_op(raw)
    if op.get("op_id") and AppliedOp.objects.filter(pk=op["op_id"]).exists():
        return _duplicate(op["op_id"])
    if error:
        result = _result(op, "rejected", error=error)
        if op.get("op_id") and op.get("record_id"):
            # Remember rejections too, so a retry gets the same answer.
            AppliedOp.objects.get_or_create(
                pk=op["op_id"],
                defaults={
                    "record_id": op["record_id"],
                    "device_id": (op.get("device_id") or "")[:64],
                    "op_type": str(op.get("type"))[:10],
                    "status": "rejected",
                    "result": result,
                },
            )
        return result

    try:
        with transaction.atomic():
            result = _apply(op)
            AppliedOp.objects.create(
                op_id=op["op_id"],
                record_id=op["record_id"],
                device_id=op["device_id"],
                op_type=op["type"],
                status=result["status"],
                result=result,
            )
            if fail_before_commit:
                raise RuntimeError("simulated crash before commit")
    except IntegrityError:
        # Another request applied the same op_id at the same moment; its result stands.
        return _duplicate(op["op_id"])
    return result


def changes_since(cursor: int, limit: int = FEED_PAGE):
    rows = list(Record.objects.filter(seq__gt=cursor).order_by("seq")[: limit + 1])
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = rows[-1].seq if rows else cursor
    return [serialize(r) for r in rows], next_cursor, has_more
