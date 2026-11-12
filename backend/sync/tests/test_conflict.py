"""Unit tests for the conflict-resolution rules (no database)."""
from sync.conflict import incoming_wins, merge_fields

META_V2_BY_B = {"location": {"ts": 2000, "dev": "device-b", "v": 2}}
CURRENT = {"location": "Shelf B", "notes": ""}


def test_causal_change_applies_even_with_an_older_clock():
    # Client saw version 2, so its edit is newer even though its clock is behind.
    m = merge_fields(CURRENT, META_V2_BY_B, base_version=2, changes={"location": "Shelf C"},
                     ts=1000, device="device-a", new_version=3)
    assert m.applied == {"location": "Shelf C"}
    assert m.conflicts == []


def test_concurrent_edit_later_timestamp_wins_and_is_reported():
    m = merge_fields(CURRENT, META_V2_BY_B, base_version=1, changes={"location": "Store room"},
                     ts=3000, device="device-a", new_version=3)
    assert m.applied == {"location": "Store room"}
    assert m.conflicts == [{"field": "location", "yours": "Store room", "theirs": "Shelf B", "winner": "yours"}]
    assert m.meta["location"] == {"ts": 3000, "dev": "device-a", "v": 3}


def test_concurrent_edit_earlier_timestamp_loses():
    m = merge_fields(CURRENT, META_V2_BY_B, base_version=1, changes={"location": "Store room"},
                     ts=1500, device="device-a", new_version=3)
    assert m.applied == {}
    assert m.conflicts[0]["winner"] == "theirs"
    assert m.meta["location"]["dev"] == "device-b"  # untouched


def test_exact_timestamp_tie_is_broken_by_device_id_the_same_way_everywhere():
    meta = {"ts": 2000, "dev": "device-b"}
    assert incoming_wins(2000, "device-c", meta) is True
    assert incoming_wins(2000, "device-a", meta) is False


def test_concurrent_edits_to_different_fields_both_survive():
    m = merge_fields(CURRENT, META_V2_BY_B, base_version=1, changes={"notes": "Keep cool"},
                     ts=1500, device="device-a", new_version=3)
    assert m.applied == {"notes": "Keep cool"}
    assert m.conflicts == []


def test_same_device_follow_up_edit_is_not_a_conflict():
    meta = {"location": {"ts": 2000, "dev": "device-a", "v": 2}}
    m = merge_fields(CURRENT, meta, base_version=1, changes={"location": "Shelf D"},
                     ts=2500, device="device-a", new_version=3)
    assert m.applied == {"location": "Shelf D"}
    assert m.conflicts == []


def test_concurrent_identical_values_are_not_reported_as_conflicts():
    m = merge_fields(CURRENT, META_V2_BY_B, base_version=1, changes={"location": "Shelf B"},
                     ts=1500, device="device-a", new_version=3)
    assert m.conflicts == []
