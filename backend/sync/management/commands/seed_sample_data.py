"""Load sample_data/clinic_stock.json through the normal sync path.

Op IDs and record IDs are derived from the item name (uuid5), so running this command
twice is safe: the second run is answered from the operation-ID set as duplicates.
"""
import json
import uuid
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from sync.services import apply_operation, now_ms

NAMESPACE = uuid.UUID("6f1c2a8e-3b7d-4e5f-9a10-1c2d3e4f5a6b")
DEFAULT_FILE = settings.REPO_DIR / "sample_data" / "clinic_stock.json"


class Command(BaseCommand):
    help = "Load the sample clinic / aid-point stock list (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--file", default=str(DEFAULT_FILE))

    def handle(self, *args, **options):
        items = json.loads(Path(options["file"]).read_text())["items"]
        counts = {}
        for item in items:
            rid = uuid.uuid5(NAMESPACE, "record:" + item["name"])
            result = apply_operation(
                {
                    "op_id": str(uuid.uuid5(NAMESPACE, "create:" + item["name"])),
                    "type": "create",
                    "record_id": str(rid),
                    "base_version": 0,
                    "ts": now_ms(),
                    "device_id": "seed",
                    "data": item,
                }
            )
            counts[result["status"]] = counts.get(result["status"], 0) + 1
        summary = ", ".join(f"{n} {status}" for status, n in sorted(counts.items()))
        self.stdout.write(self.style.SUCCESS(f"{len(items)} sample items: {summary}"))
