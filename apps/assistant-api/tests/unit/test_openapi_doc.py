import importlib
import sys
import types


def build_openapi_document() -> dict:
    stub_assessment = types.ModuleType("src.services.assessment_service")

    async def create_assessment_report(result: dict) -> str:
        return "assessment"

    async def create_handout(result: dict) -> str:
        return "handout"

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
        return ({}, None)

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
    try:
        app_module = importlib.import_module("src.app")
        return app_module.app.openapi()
    finally:
        sys.modules.pop("src.app", None)
        for name, original in originals.items():
            if original is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = original


def iterate_operations(doc: dict) -> list[tuple[str, str, dict]]:
    operations: list[tuple[str, str, dict]] = []
    for path, path_item in doc["paths"].items():
        for method, operation in path_item.items():
            if method in {"get", "post", "put", "patch", "delete", "options", "head"}:
                operations.append((path, method, operation))
    return operations


def test_openapi_top_level_metadata_is_present() -> None:
    doc = build_openapi_document()

    assert doc["info"]["title"] == "Human Database Submission Assistant"
    assert doc["info"]["version"] == "0.1.0"
    assert doc["openapi"].startswith("3.")
    assert "/api/applications" in doc["paths"]
    assert doc["components"]["securitySchemes"]["HTTPBearer"]["type"] == "http"
    assert doc["components"]["securitySchemes"]["HTTPBearer"]["scheme"] == "bearer"


def test_every_operation_has_unique_operation_id_and_description() -> None:
    doc = build_openapi_document()
    operations = iterate_operations(doc)

    operation_ids = [operation["operationId"] for _, _, operation in operations]

    assert all(operation_ids)
    assert len(set(operation_ids)) == len(operation_ids)
    assert all(operation.get("description") for _, _, operation in operations)


def test_every_api_operation_declares_http_bearer_security() -> None:
    doc = build_openapi_document()

    for path, method, operation in iterate_operations(doc):
        assert path.startswith("/api/")
        assert operation.get("security") == [{"HTTPBearer": []}], f"missing bearer security: {method.upper()} {path}"


def test_application_upload_endpoint_is_documented_as_multipart() -> None:
    doc = build_openapi_document()

    operation = doc["paths"]["/api/applications"]["post"]
    request_body = operation["requestBody"]

    assert request_body["required"] is True
    assert "multipart/form-data" in request_body["content"]
