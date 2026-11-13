from unittest import mock

import pytest


@pytest.mark.django_db
@pytest.mark.parametrize("path", ["/healthz", "/healthz/", "/health", "/health/"])
def test_health_ok(client, path):
    response = client.get(path)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert "version" in body and "time" in body


@pytest.mark.django_db
def test_health_reports_503_when_database_is_down(client):
    with mock.patch("sync.views.connection.cursor", side_effect=Exception("db down")):
        response = client.get("/healthz")
    assert response.status_code == 503
    assert response.json()["database"] == "unavailable"


@pytest.mark.django_db
def test_health_probe_with_an_internal_host_header_is_not_rejected(client, settings):
    settings.ALLOWED_HOSTS = ["hifadhi.example"]
    probe = client.get("/healthz", HTTP_HOST="10.0.3.17:8000")
    assert probe.status_code == 200
    other = client.get("/api/records", HTTP_HOST="10.0.3.17:8000")
    assert other.status_code == 400  # every other route still enforces ALLOWED_HOSTS


@pytest.mark.django_db
def test_health_probe_is_not_redirected_to_https(client, settings):
    settings.SECURE_SSL_REDIRECT = True
    assert client.get("/healthz").status_code == 200


@pytest.mark.django_db
def test_platform_probe_on_root_is_answered_when_a_public_host_is_configured(client, settings):
    from django.conf import settings as live

    settings.ALLOWED_HOSTS = ["hifadhi.example"] + [h for h in live.ALLOWED_HOSTS if h in ("localhost", "127.0.0.1", "[::1]")]
    settings.SECURE_SSL_REDIRECT = True
    assert client.get("/", HTTP_HOST="127.0.0.1:33224").status_code == 200
    assert client.get("/api/records", HTTP_HOST="evil.example").status_code == 400
