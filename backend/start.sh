#!/bin/sh
# Container start command (PrimeCloud runs this as the long-lived HTTP process).
set -e

# The container starts as root only so it can take ownership of a freshly mounted
# persistent disk (host folders are usually root-owned), then drops to "appuser".
# If the platform has dropped the needed capabilities, it keeps running as is.
DB_DIR=$(dirname "${SQLITE_PATH:-/app/data/db.sqlite3}")
RUN_AS=""
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DB_DIR" 2>/dev/null || true
  if chown -R appuser:appuser "$DB_DIR" 2>/dev/null \
     && setpriv --reuid=appuser --regid=appuser --init-groups true 2>/dev/null; then
    RUN_AS="setpriv --reuid=appuser --regid=appuser --init-groups"
    echo "Running as appuser; $DB_DIR owned by appuser"
  else
    echo "Could not drop privileges here; continuing as the platform's user"
  fi
fi

if [ -z "$DATABASE_URL" ]; then
  # No managed database: SQLite must live on the PERSISTENT disk, not in the container.
  mkdir -p "$DB_DIR" 2>/dev/null || true
  if ! $RUN_AS touch "$DB_DIR/.write-test" 2>/dev/null; then
    echo "FATAL: $DB_DIR is not writable. Mount the persistent disk there or set DATABASE_URL." >&2
    exit 1
  fi
  rm -f "$DB_DIR/.write-test"
  echo "Database: SQLite at ${SQLITE_PATH:-/app/data/db.sqlite3} (must be on a persistent disk)"
else
  echo "Database: DATABASE_URL (managed database)"
  # Internal DNS and the database can lag behind container start: wait up to ~30 s.
  $RUN_AS python - <<'PY'
import os, sys, time
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()
from django.db import connection
for attempt in range(1, 16):
    try:
        connection.ensure_connection()
        print(f"Database reachable (attempt {attempt}).")
        sys.exit(0)
    except Exception as exc:  # DNS not ready, DB booting, wrong host...
        print(f"Waiting for database (attempt {attempt}/15): {exc}".splitlines()[0], flush=True)
        connection.close()
        time.sleep(2)
print("FATAL: database still unreachable after ~30 s. Check the host in DATABASE_URL.", file=sys.stderr)
sys.exit(1)
PY
fi

$RUN_AS python manage.py migrate --noinput

# Loading the sample data is idempotent (fixed op IDs), so it is safe on every start.
if [ "${SEED_SAMPLE_DATA:-0}" = "1" ]; then
  $RUN_AS python manage.py seed_sample_data
fi

# exec: uvicorn becomes PID 1 and receives SIGTERM directly. It stops accepting new
# requests and lets in-flight syncs finish; each op commits in its own transaction
# before it is acknowledged, so a forced kill never acknowledges unapplied work.
# h11 parser: accepts the platform probe's bare-LF requests (gunicorn rejects them).
exec $RUN_AS uvicorn config.asgi:application \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --http h11 \
  --proxy-headers --forwarded-allow-ips "*" \
  --timeout-graceful-shutdown 8 \
  --no-server-header
