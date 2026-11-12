import itertools
import uuid

_ts = itertools.count(1_700_000_000_000, 1000)


def new_id() -> str:
    return str(uuid.uuid4())


def op(type_, record_id, data=None, base_version=0, device="device-a", ts=None, op_id=None):
    return {
        "op_id": op_id or new_id(),
        "type": type_,
        "record_id": record_id,
        "base_version": base_version,
        "ts": ts if ts is not None else next(_ts),
        "device_id": device,
        "data": data or {},
    }


def create(record_id, name="Paracetamol 500mg", quantity=100, **kw):
    data = {"name": name, "quantity": quantity, "category": "medicine", "unit": "tablets"}
    data.update(kw.pop("data", {}))
    return op("create", record_id, data, **kw)


def sync(client, ops, cursor=0, headers=None):
    return client.post(
        "/api/sync",
        {"device_id": "test", "cursor": cursor, "ops": ops},
        content_type="application/json",
        headers=headers or {},
    )
