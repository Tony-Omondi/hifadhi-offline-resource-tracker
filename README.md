# Offline-First Resource Tracker

Stock tracking for rural clinics and aid points that keeps working with no connection and syncs when the network returns (SDG 3: Good Health, SDG 2: Zero Hunger).

> Work in progress. The full README (architecture, DSA complexity, sync protocol, test evidence) comes in the last build stage.

## Run locally

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd backend && DJANGO_DEBUG=1 ../.venv/bin/python manage.py migrate && DJANGO_DEBUG=1 ../.venv/bin/python manage.py runserver
```

Open http://127.0.0.1:8000 and http://127.0.0.1:8000/health

## Run tests

```bash
cd backend && ../.venv/bin/python -m pytest -q
```

## Run with Docker (same image as production)

```bash
docker build -t resource-tracker .
docker run -p 8000:8000 -e DJANGO_SECRET_KEY=change-me -e DJANGO_ALLOWED_HOSTS=localhost resource-tracker
```
