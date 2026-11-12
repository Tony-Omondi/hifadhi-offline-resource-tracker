"""Conflict resolution: per-field last-writer-wins, guided by versions.

Pure functions, no Django, so the rules can be unit-tested on their own.

Every LWW field on the server remembers who wrote it last: {"ts", "dev", "v"}.
An incoming change to field f (from an op with base_version b) is handled like this:

1. Causal (not a conflict): the client had already seen the current value
   (meta.v <= b), or the same device wrote it last (its own ops arrive in FIFO order).
   The change is newer by construction, so it is applied whatever the clocks say.
2. Concurrent (a real conflict): someone else changed f after the client last synced.
   The write with the larger (timestamp, device_id) wins. device_id breaks ties so every
   replica picks the same winner. Fields the other writer did not touch merge cleanly.

Quantity is NOT an LWW field: stock movements are deltas ("dispensed 5", "received 20")
that add up, so two clinics dispensing at the same time never overwrite each other.

Cost per op: O(k) for k changed fields; no history is scanned.
"""
from dataclasses import dataclass, field

LWW_FIELDS = ("name", "category", "unit", "location", "expiry_date", "min_stock", "notes", "deleted")

_EMPTY_META = {"ts": 0, "dev": "", "v": 0}


@dataclass
class MergeResult:
    applied: dict = field(default_factory=dict)  # field -> new value written
    meta: dict = field(default_factory=dict)  # full field_meta after the merge
    conflicts: list = field(default_factory=list)  # one entry per concurrent, differing write


def incoming_wins(ts: int, device: str, meta: dict) -> bool:
    """Total order on writes: later timestamp wins, device_id breaks exact ties."""
    return (ts, device) > (meta.get("ts", 0), meta.get("dev", ""))


def merge_fields(
    current: dict,
    field_meta: dict,
    base_version: int,
    changes: dict,
    ts: int,
    device: str,
    new_version: int,
) -> MergeResult:
    result = MergeResult(meta={k: dict(v) for k, v in field_meta.items()})
    for name, value in changes.items():
        meta = field_meta.get(name, _EMPTY_META)
        causal = meta.get("v", 0) <= base_version or meta.get("dev") == device

        if causal:
            wins = True
        else:
            wins = incoming_wins(ts, device, meta)
            if current.get(name) != value:
                result.conflicts.append(
                    {
                        "field": name,
                        "yours": value,
                        "theirs": current.get(name),
                        "winner": "yours" if wins else "theirs",
                    }
                )

        if wins:
            result.applied[name] = value
            result.meta[name] = {"ts": ts, "dev": device, "v": new_version}
    return result
