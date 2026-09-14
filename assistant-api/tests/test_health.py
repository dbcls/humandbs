from pathlib import Path
from unittest.mock import AsyncMock

import pytest
import yaml
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


def test_dataset_mutation_endpoints_reject_submission_applications(monkeypatch, tmp_path) -> None:
    application_path = tmp_path / "submission.yml"
    application_path.write_text(
        yaml.safe_dump({"application_type": "提供申請"}, allow_unicode=True),
        encoding="utf-8",
    )
    add_task = AsyncMock()
    remove_task = AsyncMock()
    monkeypatch.setattr(app_module, "get_task_result_path", lambda _task_id: application_path)
    monkeypatch.setattr(app_module, "add_datasets_to_application_task", add_task)
    monkeypatch.setattr(app_module, "remove_dataset_from_application_task", remove_task)
    client = TestClient(app)

    add_response = client.post("/api/applications/task/add-datasets", json={"dataset_ids": ["JGAD000001"]})
    remove_response = client.post("/api/applications/task/remove-dataset", json={"dataset_id": "JGAD000001"})

    assert add_response.status_code == 400
    assert remove_response.status_code == 400
    assert "利用申請" in add_response.json()["detail"]
    add_task.assert_not_awaited()
    remove_task.assert_not_awaited()


def test_dataset_mutation_endpoint_allows_usage_applications(monkeypatch, tmp_path) -> None:
    application_path = tmp_path / "usage.yml"
    application_path.write_text(
        yaml.safe_dump({"application_type": "利用申請"}, allow_unicode=True),
        encoding="utf-8",
    )
    add_task = AsyncMock(return_value={"status": "success"})
    monkeypatch.setattr(app_module, "get_task_result_path", lambda _task_id: application_path)
    monkeypatch.setattr(app_module, "add_datasets_to_application_task", add_task)
    client = TestClient(app)

    response = client.post("/api/applications/task/add-datasets", json={"dataset_ids": ["JGAD000001"]})

    assert response.status_code == 200
    assert response.json() == {"status": "success"}
    add_task.assert_awaited_once_with("task", ["JGAD000001"])
