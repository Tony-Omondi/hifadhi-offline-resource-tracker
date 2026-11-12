from unittest import mock

import pytest


@pytest.mark.django_db
@pytest.mark.parametrize("path", ["/health", "/health/"])
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
        response = client.get("/health")
    assert response.status_code == 503
    assert response.json()["database"] == "unavailable"
