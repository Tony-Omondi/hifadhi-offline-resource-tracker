"""Server-side storage for the sync protocol.

Record     the server's copy of the record map (one row per stock item, keyed by UUID).
AppliedOp  the server's operation-ID set: the primary key on op_id makes "has this op
           already been applied?" a single index lookup and makes a second insert fail.
SyncCounter a single-row counter that gives every change a global, increasing sequence
           number, so clients can pull "everything after cursor N".
"""
from django.db import models


class Record(models.Model):
    CATEGORIES = ("medicine", "supplies", "food", "water", "other")

    id = models.UUIDField(primary_key=True)
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=20, default="other")
    unit = models.CharField(max_length=30, default="units")
    location = models.CharField(max_length=120, blank=True, default="")
    expiry_date = models.DateField(null=True, blank=True)
    min_stock = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True, default="")
    quantity = models.IntegerField(default=0)
    deleted = models.BooleanField(default=False)  # tombstone, so deletes sync too

    version = models.PositiveIntegerField(default=0)  # bumps on every applied change
    # Per-field last writer: {"name": {"ts": ms, "dev": "device-id", "v": version}, ...}
    field_meta = models.JSONField(default=dict)
    seq = models.BigIntegerField(default=0, db_index=True)  # position in the change feed

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.quantity} {self.unit})"


class AppliedOp(models.Model):
    op_id = models.UUIDField(primary_key=True)
    record_id = models.UUIDField(db_index=True)
    device_id = models.CharField(max_length=64)
    op_type = models.CharField(max_length=10)
    status = models.CharField(max_length=12)
    result = models.JSONField()  # stored so a retried op gets the same answer back
    applied_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-applied_at"]


class SyncCounter(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1)
    value = models.BigIntegerField(default=0)
