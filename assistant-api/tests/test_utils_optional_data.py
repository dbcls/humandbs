from pathlib import Path

import pytest

from src import utils


def test_resolve_runtime_path_resolves_relative_paths_from_project_root() -> None:
    assert utils.resolve_runtime_path("custom/cache.db", "work/default.db") == utils.PROJECT_ROOT / "custom/cache.db"


def test_resolve_runtime_path_preserves_absolute_paths() -> None:
    absolute_path = Path("/var/lib/humandbs/cache.db")

    assert utils.resolve_runtime_path(str(absolute_path), "work/default.db") == absolute_path


def test_web_origin_is_configured_independently_from_api_origin(monkeypatch) -> None:
    monkeypatch.setenv("HUMANDBS_API_ORIGIN", "http://app:5173")
    monkeypatch.setenv("HUMANDBS_WEB_ORIGIN", "https://public.example/")

    assert utils.get_humandbs_web_origin() == "https://public.example"


@pytest.mark.parametrize("configured_origin", [None, ""])
def test_web_origin_defaults_to_production_site(monkeypatch, configured_origin) -> None:
    if configured_origin is None:
        monkeypatch.delenv("HUMANDBS_WEB_ORIGIN", raising=False)
    else:
        monkeypatch.setenv("HUMANDBS_WEB_ORIGIN", configured_origin)

    assert utils.get_humandbs_web_origin() == "https://humandbs.dbcls.jp"


def test_html_to_markdown_matches_existing_link_and_image_behavior() -> None:
    html = '<h1>Title</h1><p>Read <a href="https://example.com">the source</a>.</p><img src="image.png">'

    result = utils._html_to_markdown(html)

    assert "# Title" in result
    assert "Read the source." in result
    assert "https://example.com" not in result
    assert "image.png" not in result


def test_get_icd10_description_returns_none_when_mapping_file_missing(monkeypatch) -> None:
    missing_path = Path("/tmp/non-existent-icd10-mapping.json")
    monkeypatch.setattr(utils, "ICD10_MAPPING_PATH", missing_path)
    utils._load_icd10_descriptions.cache_clear()

    assert utils.get_icd10_description("A00") is None

    utils._load_icd10_descriptions.cache_clear()
