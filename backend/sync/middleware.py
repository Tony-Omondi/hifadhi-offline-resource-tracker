"""Answer platform health probes before anything else runs.

PrimeCloud's probe reaches the container directly, often with an internal IP or
hostname in the Host header. Django would reject that host (400) before the view runs,
and the HTTPS redirect would send the probe away. Health checks are therefore served
here, first in the chain; every other request still goes through ALLOWED_HOSTS and
the normal security middleware.
"""
from .views import health_payload

HEALTH_PATHS = {"/healthz", "/healthz/", "/health", "/health/"}


class HealthCheckMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path in HEALTH_PATHS and request.method in ("GET", "HEAD"):
            from django.http import JsonResponse

            body, status = health_payload()
            response = JsonResponse(body, status=status)
            response["Cache-Control"] = "no-store"
            return response
        return self.get_response(request)
