"""Validate one incoming operation. Returns (clean_op, None) or (partial_op, error)."""
import uuid
from datetime import date

from .conflict import LWW_FIELDS
from .models import Record

OP_TYPES = ("create", "update", "adjust", "delete")
EDITABLE = tuple(f for f in LWW_FIELDS if f != "deleted")
MAX_DELTA = 1_000_000


def _uuid(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def _int(value, minimum=None):
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    if minimum is not None and value < minimum:
        return None
    return value


def _clean_field(name, value):
    """Return (clean_value, error)."""
    if name == "name":
        if not isinstance(value, str) or not value.strip():
            return None, "name is required"
        return value.strip()[:200], None
    if name == "category":
        return (value, None) if value in Record.CATEGORIES else (None, f"unknown category {value!r}")
    if name in ("unit", "location", "notes"):
        if not isinstance(value, str):
            return None, f"{name} must be text"
        limit = {"unit": 30, "location": 120, "notes": 2000}[name]
        return value.strip()[:limit], None
    if name == "expiry_date":
        if value in (None, ""):
            return None, None
        try:
            return date.fromisoformat(value).isoformat(), None
        except (TypeError, ValueError):
            return None, "expiry_date must be YYYY-MM-DD"
    if name == "min_stock":
        clean = _int(value, minimum=0)
        return (clean, None) if clean is not None else (None, "min_stock must be a whole number >= 0")
    return None, f"field {name!r} cannot be changed"


def validate_op(raw):
    if not isinstance(raw, dict):
        return {}, "operation must be an object"

    op = {
        "op_id": _uuid(raw.get("op_id")),
        "type": raw.get("type"),
        "record_id": _uuid(raw.get("record_id")),
        "base_version": _int(raw.get("base_version", 0), minimum=0),
        "ts": _int(raw.get("ts"), minimum=0),
        "device_id": raw.get("device_id") if isinstance(raw.get("device_id"), str) else None,
        "data": raw.get("data") if isinstance(raw.get("data"), dict) else {},
    }
    if op["op_id"] is None:
        return op, "op_id must be a UUID"
    if op["type"] not in OP_TYPES:
        return op, f"type must be one of {', '.join(OP_TYPES)}"
    if op["record_id"] is None:
        return op, "record_id must be a UUID"
    if op["base_version"] is None or op["ts"] is None:
        return op, "base_version and ts must be whole numbers"
    if not op["device_id"] or len(op["device_id"]) > 64:
        return op, "device_id is required (max 64 chars)"

    data = op["data"]
    clean = {}
    if op["type"] == "create":
        for name in EDITABLE:
            if name in data:
                value, error = _clean_field(name, data[name])
                if error:
                    return op, error
                clean[name] = value
        if "name" not in clean:
            return op, "name is required"
        quantity = _int(data.get("quantity", 0), minimum=0)
        if quantity is None:
            return op, "quantity must be a whole number >= 0"
        clean["quantity"] = quantity
    elif op["type"] == "update":
        if not data:
            return op, "update has no fields"
        for name, raw_value in data.items():
            value, error = _clean_field(name, raw_value)
            if error:
                return op, error
            clean[name] = value
    elif op["type"] == "adjust":
        delta = _int(data.get("delta"))
        if delta is None or delta == 0 or abs(delta) > MAX_DELTA:
            return op, "delta must be a non-zero whole number"
        clean = {"delta": delta, "reason": str(data.get("reason", ""))[:40]}
    op["data"] = clean
    return op, None
