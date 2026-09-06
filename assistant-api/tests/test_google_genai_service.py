from types import SimpleNamespace

import pytest
from pydantic import BaseModel

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
        def generate_content(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(parsed=expected, text=expected.model_dump_json())

    monkeypatch.setattr(
        google_genai_service,
        "_build_genai_client",
        lambda: SimpleNamespace(models=_FakeModels()),
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
        def generate_content(self, **_kwargs):
            return SimpleNamespace(parsed=None, text='{"value":"text response"}')

    monkeypatch.setattr(
        google_genai_service,
        "_build_genai_client",
        lambda: SimpleNamespace(models=_FakeModels()),
    )
    monkeypatch.setattr(google_genai_service, "_get_cached_response", lambda _key: None)
    monkeypatch.setattr(google_genai_service, "_save_cached_response", lambda _key, _response: None)

    result = await google_genai_service.extract_structured_output("Extract this value.", _StructuredResult)

    assert result == _StructuredResult(value="text response")
