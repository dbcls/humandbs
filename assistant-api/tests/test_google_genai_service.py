from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from src.models import SubmissionApplicationFormData
from src.services import google_genai_service


class _StructuredResult(BaseModel):
    value: str


def test_structured_output_config_uses_native_json_schema() -> None:
    config = google_genai_service._build_generate_content_config(
        system_message="Follow the instructions.",
        response_schema=_StructuredResult,
    )

    assert config.system_instruction == "Follow the instructions."
    assert config.response_mime_type == "application/json"
    assert config.response_schema == _StructuredResult
    assert config.tools is None


@pytest.mark.asyncio
async def test_extract_structured_output_returns_parsed_model(monkeypatch) -> None:
    expected = _StructuredResult(value="Gemini response")
    calls = []

    class _FakeModels:
        async def generate_content(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(parsed=expected, text=expected.model_dump_json())

    monkeypatch.setattr(
        google_genai_service,
        "_build_genai_client",
        lambda: SimpleNamespace(aio=SimpleNamespace(models=_FakeModels())),
    )
    monkeypatch.setattr(google_genai_service, "_get_cached_response", lambda _key: None)
    monkeypatch.setattr(google_genai_service, "_save_cached_response", lambda _key, _response: None)

    result = await google_genai_service.extract_structured_output(
        "Extract this value.",
        _StructuredResult,
        system_message="Return structured data.",
    )

    assert result == expected
    assert calls[0]["model"] == "gemini-2.5-flash"
    assert calls[0]["config"].response_schema == _StructuredResult


@pytest.mark.asyncio
async def test_extract_structured_output_validates_text_fallback(monkeypatch) -> None:
    class _FakeModels:
        async def generate_content(self, **_kwargs):
            return SimpleNamespace(parsed=None, text='{"value":"text response"}')

    monkeypatch.setattr(
        google_genai_service,
        "_build_genai_client",
        lambda: SimpleNamespace(aio=SimpleNamespace(models=_FakeModels())),
    )
    monkeypatch.setattr(google_genai_service, "_get_cached_response", lambda _key: None)
    monkeypatch.setattr(google_genai_service, "_save_cached_response", lambda _key, _response: None)

    result = await google_genai_service.extract_structured_output("Extract this value.", _StructuredResult)

    assert result == _StructuredResult(value="text response")


@pytest.mark.asyncio
async def test_query_genai_awaits_async_client(monkeypatch) -> None:
    calls = []

    class _FakeModels:
        async def generate_content(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(text="async response")

    monkeypatch.setattr(
        google_genai_service,
        "_build_genai_client",
        lambda: SimpleNamespace(aio=SimpleNamespace(models=_FakeModels())),
    )
    monkeypatch.setattr(google_genai_service, "_get_cached_response", lambda _key: None)
    monkeypatch.setattr(google_genai_service, "_save_cached_response", lambda _key, _response: None)

    result = await google_genai_service.query_genai("Answer this.")

    assert result == "async response"
    assert len(calls) == 1
    assert calls[0]["model"] == "gemini-2.5-flash"


@pytest.mark.asyncio
async def test_extract_output_awaits_async_grounded_request_and_parses_response(monkeypatch) -> None:
    calls = []
    expected_url = "https://example.com/evidence"

    class _FakeModels:
        async def generate_content(self, **kwargs):
            calls.append(kwargs)
            candidate = SimpleNamespace(
                content=SimpleNamespace(),
                citation_metadata=SimpleNamespace(citations=[SimpleNamespace(uri=expected_url)]),
                grounding_metadata=None,
            )
            return SimpleNamespace(
                text='{"value":"grounded response"}',
                candidates=[candidate],
            )

    monkeypatch.setattr(
        google_genai_service,
        "_build_genai_client",
        lambda: SimpleNamespace(aio=SimpleNamespace(models=_FakeModels())),
    )
    monkeypatch.setattr(google_genai_service, "_get_cached_response", lambda _key: None)
    monkeypatch.setattr(google_genai_service, "_save_cached_response", lambda _key, _response: None)

    result, urls = await google_genai_service.extract_output_from_genai(
        "Extract this grounded value.",
        _StructuredResult,
        system_message="Return structured data.",
    )

    assert result == _StructuredResult(value="grounded response")
    assert urls == [expected_url]
    assert len(calls) == 1
    assert calls[0]["model"] == "gemini-2.5-flash"
    assert calls[0]["config"].system_instruction == "Return structured data."
    assert calls[0]["config"].tools[0].google_search is not None


@pytest.mark.asyncio
async def test_submission_form_extraction_accepts_nullable_optional_fields(monkeypatch) -> None:
    class _FakeModels:
        async def generate_content(self, **_kwargs):
            return SimpleNamespace(
                parsed=None,
                text=(
                    '{"target_region_is_limited":null,'
                    '"file_format":null,'
                    '"total_data_amount_is_valid":null}'
                ),
            )

    monkeypatch.setattr(
        google_genai_service,
        "_build_genai_client",
        lambda: SimpleNamespace(aio=SimpleNamespace(models=_FakeModels())),
    )
    monkeypatch.setattr(google_genai_service, "_get_cached_response", lambda _key: None)
    monkeypatch.setattr(google_genai_service, "_save_cached_response", lambda _key, _response: None)

    result = await google_genai_service.extract_structured_output(
        "Extract submission application fields.",
        SubmissionApplicationFormData,
    )

    assert isinstance(result, SubmissionApplicationFormData)
    assert result.target_region_is_limited is None
    assert result.file_format is None
    assert result.total_data_amount_is_valid is None
