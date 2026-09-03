from pathlib import Path

import pytest
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient

from src import app as app_module
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


def test_openapi_uses_a_relative_server_url() -> None:
    client = TestClient(app)

    response = client.get("/api/openapi.json")

    assert response.status_code == 200
    assert response.json()["servers"] == [{"url": ".."}]


@pytest.mark.asyncio
async def test_batch_reanalysis_registers_one_background_task(monkeypatch) -> None:
    result_files = [Path("/tmp/first.yml"), Path("/tmp/second.yml")]
    monkeypatch.setattr(app_module, "get_all_task_result_paths", lambda: result_files)
    background_tasks = BackgroundTasks()

    response = await app_module.batch_reanalyze_applications(background_tasks)

    assert response == {"message": "Batch reanalysis queued", "queued_count": 2}
    assert len(background_tasks.tasks) == 1
    assert background_tasks.tasks[0].func is app_module.batch_reanalyze_task
    assert background_tasks.tasks[0].args == (result_files,)
