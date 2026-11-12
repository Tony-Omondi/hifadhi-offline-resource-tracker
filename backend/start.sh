#!/bin/sh
# Container start command (PrimeCloud runs this as the long-lived HTTP process).
set -e

if [ -z "$DATABASE_URL" ]; then
  # No managed database: SQLite must live on the PERSISTENT disk, not in the container.
  DB_DIR=$(dirname "${SQLITE_PATH:-/app/data/db.sqlite3}")
  mkdir -p "$DB_DIR" 2>/dev/null || true
  if ! touch "$DB_DIR/.write-test" 2>/dev/null; then
    echo "FATAL: $DB_DIR is not writable. Mount the persistent disk there or set DATABASE_URL." >&2
    exit 1
  fi
  rm -f "$DB_DIR/.write-test"
  echo "Database: SQLite at ${SQLITE_PATH:-/app/data/db.sqlite3} (must be on a persistent disk)"
else
  echo "Database: DATABASE_URL (managed database)"
fi

python manage.py migrate --noinput

# Loading the sample data is idempotent (fixed op IDs), so it is safe on every start.
if [ "${SEED_SAMPLE_DATA:-0}" = "1" ]; then
  python manage.py seed_sample_data
fi

# exec: gunicorn becomes PID 1 and receives SIGTERM directly. It stops accepting new
# requests and lets in-flight syncs finish; each op commits in its own transaction
# before it is acknowledged, so a forced kill never acknowledges unapplied work.
exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --timeout 30 \
  --graceful-timeout 8 \
  --max-requests 1000 --max-requests-jitter 100 \
  --access-logfile - --error-logfile -
