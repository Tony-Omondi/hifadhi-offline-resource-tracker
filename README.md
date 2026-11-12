# Offline-First Resource Tracker

Stock tracking for rural clinics and aid points that keeps working with no connection and syncs when the network returns (SDG 3: Good Health, SDG 2: Zero Hunger).

**Stack:** React + Vite + Tailwind CSS (IndexedDB for offline storage) · Django REST Framework sync API · one Docker image.

> Work in progress. The full README (architecture, DSA complexity, sync protocol, test evidence) comes in the last build stage.

## Run locally (two terminals)

Backend on :8000:

```bash
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
cd backend && DJANGO_DEBUG=1 ../.venv/bin/python manage.py migrate && DJANGO_DEBUG=1 ../.venv/bin/python manage.py runserver
```

Frontend on :5173 (forwards `/health` and `/api` to the backend):

```bash
cd frontend && npm install && npm run dev
```

## Run tests

```bash
cd backend && ../.venv/bin/python -m pytest -q
```

```bash
cd frontend && npm test
```

## Run with Docker (same image as production)

```bash
docker build -t resource-tracker .
docker run -p 8000:8000 -e DJANGO_SECRET_KEY=change-me resource-tracker
```

Open http://localhost:8000 and http://localhost:8000/health
