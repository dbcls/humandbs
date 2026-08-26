from fastapi.testclient import TestClient

from src.app import app


def test_health_endpoint_returns_ok() -> None:
    client = TestClient(app)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_docs_uses_relative_openapi_url() -> None:
    client = TestClient(app)

    response = client.get("/api/docs")

    assert response.status_code == 200
    assert "./openapi.json" in response.text


def test_redoc_uses_relative_openapi_url() -> None:
    client = TestClient(app)

    response = client.get("/api/redoc")

    assert response.status_code == 200
    assert "./openapi.json" in response.text
