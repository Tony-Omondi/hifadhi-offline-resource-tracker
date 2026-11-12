from datetime import datetime, timezone

from django.conf import settings
from django.db import connection
from django.http import HttpResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(["GET", "HEAD"])
def health(request):
    """Liveness + readiness: 200 when the app and its database answer, 503 otherwise."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        db_ok = True
    except Exception:  # any DB failure means "not ready"
        db_ok = False

    body = {
        "status": "ok" if db_ok else "degraded",
        "database": "ok" if db_ok else "unavailable",
        "version": settings.APP_VERSION,
        "time": datetime.now(timezone.utc).isoformat(),
    }
    return Response(body, status=200 if db_ok else 503)


def index(request):
    """Serve the offline web app shell (frontend/index.html)."""
    index_file = settings.STATICFILES_DIRS[0] / "index.html"
    return HttpResponse(index_file.read_text(encoding="utf-8"), content_type="text/html")
