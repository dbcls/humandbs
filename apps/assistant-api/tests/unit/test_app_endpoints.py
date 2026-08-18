from __future__ import annotations

import importlib
import sys
import types
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.chdir(tmp_path)

    stub_assessment = types.ModuleType("src.services.assessment_service")

    async def create_assessment_report(result: dict) -> str:
        return "assessment-report"

    async def create_handout(result: dict) -> str:
        return "handout-text"

    stub_assessment.create_assessment_report = create_assessment_report
    stub_assessment.create_handout = create_handout

    stub_tasks = types.ModuleType("src.tasks")

    async def process_application_task(*args, **kwargs) -> None:
        return None

    async def add_datasets_to_application_task(*args, **kwargs) -> dict:
        return {"status": "ok"}

    async def remove_dataset_from_application_task(*args, **kwargs) -> dict:
        return {"status": "ok"}

    stub_tasks.process_application_task = process_application_task
    stub_tasks.add_datasets_to_application_task = add_datasets_to_application_task
    stub_tasks.remove_dataset_from_application_task = remove_dataset_from_application_task

    stub_utils = types.ModuleType("src.utils")
    stub_utils.determine_application_type_from_filename = lambda filename: "DU"
    stub_utils.extract_task_id_from_filename = lambda filename: "task-1"
    stub_utils.get_ethics_file_path = lambda filename: f"uploads/{filename}.ethics.pdf"
    stub_utils.get_research_plan_path = lambda filename: f"uploads/{filename}.research-plan.pdf"

    async def process_multiple_files(application_file_path: str, ethics_file_path: str | None):
        return ({"application_file_path": application_file_path}, {"ethics_file_path": ethics_file_path})

    stub_utils.process_multiple_files = process_multiple_files

    originals: dict[str, types.ModuleType | None] = {}
    for name, module in {
        "src.services.assessment_service": stub_assessment,
        "src.tasks": stub_tasks,
        "src.utils": stub_utils,
    }.items():
        originals[name] = sys.modules.get(name)
        sys.modules[name] = module

    sys.modules.pop("src.app", None)
    app_module = importlib.import_module("src.app")
    app_module.app.dependency_overrides[app_module.require_admin] = lambda: {"is_admin": True}

    try:
        with TestClient(app_module.app) as test_client:
            yield test_client
    finally:
        app_module.app.dependency_overrides.clear()
        sys.modules.pop("src.app", None)
        for name, original in originals.items():
            if original is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = original


def test_get_application_status_returns_processing_when_task_file_is_missing(client: TestClient) -> None:
    response = client.get("/api/applications/task-1")

    assert response.status_code == 200
    assert response.json() == {"status": "processing", "task_id": "task-1"}


def test_get_application_status_returns_error_when_error_file_exists(client: TestClient) -> None:
    Path("results").mkdir(parents=True, exist_ok=True)
    Path("results/task-1_error.txt").write_text("boom", encoding="utf-8")

    response = client.get("/api/applications/task-1")

    assert response.status_code == 200
    assert response.json() == {"status": "error", "error": "boom"}


def test_get_application_status_returns_completed_when_assessment_exists(client: TestClient) -> None:
    Path("results").mkdir(parents=True, exist_ok=True)
    Path("results/task-1.yml").write_text(
        yaml.safe_dump({"status": "processing", "assessment": {"summary": "done"}, "filename": "a.pdf"}),
        encoding="utf-8",
    )

    response = client.get("/api/applications/task-1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "completed"
    assert payload["assessment"] == "assessment-report"


def test_get_all_applications_marks_error_tasks(client: TestClient) -> None:
    Path("results").mkdir(parents=True, exist_ok=True)
    Path("results/task-ok.yml").write_text(
        yaml.safe_dump({"created_at": "2026-01-01", "updated_at": "2026-01-01", "status": "processing"}),
        encoding="utf-8",
    )
    Path("results/task-ng.yml").write_text(
        yaml.safe_dump({"created_at": "2026-01-02", "updated_at": "2026-01-02", "status": "processing"}),
        encoding="utf-8",
    )
    Path("results/task-ng_error.txt").write_text("failed", encoding="utf-8")

    response = client.get("/api/applications")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 2
    statuses = {task["task_id"]: task["status"] for task in payload["tasks"]}
    assert statuses["task-ok"] == "processing"
    assert statuses["task-ng"] == "error"


def test_reanalyze_returns_404_when_yaml_does_not_exist(client: TestClient) -> None:
    response = client.post("/api/applications/not-found/reanalyze")

    assert response.status_code == 404
    assert response.json()["detail"] == "Application not found"


def test_upload_attachments_returns_400_when_no_file_selected(client: TestClient) -> None:
    Path("results").mkdir(parents=True, exist_ok=True)
    Path("results/task-1.yml").write_text(
        yaml.safe_dump({"filename": "sample.pdf", "created_at": "2026-01-01", "updated_at": "2026-01-01"}),
        encoding="utf-8",
    )

    response = client.post("/api/applications/task-1/attachments")

    assert response.status_code == 400
    assert response.json()["detail"] == "アップロードするファイルが選択されていません"