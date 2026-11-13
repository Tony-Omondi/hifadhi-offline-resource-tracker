# Offline-First Resource Tracker: one container serves the sync API, /health and the React app.

# --- Stage 1: build the React app ---
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

# --- Stage 2: Django runtime ---
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend backend
COPY sample_data sample_data
COPY --from=frontend /app/frontend/dist frontend/dist

WORKDIR /app/backend
# collectstatic needs a key at build time only; the real one comes from the environment at runtime.
RUN DJANGO_SECRET_KEY=build-only python manage.py collectstatic --noinput

# /app/data is where a persistent disk mounts when no managed database is used.
RUN useradd --create-home appuser && mkdir -p /app/data && chown -R appuser /app && chmod 775 /app/data && chmod 755 /app/backend/start.sh
# No USER line: start.sh fixes ownership of the mounted disk, then drops to appuser.
ENV SQLITE_PATH=/app/data/db.sqlite3

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/healthz', timeout=4)"

# Run through sh so it starts even if the platform drops the file's execute bit;
# start.sh then execs gunicorn, which becomes PID 1 and receives SIGTERM directly.
CMD ["sh", "/app/backend/start.sh"]
