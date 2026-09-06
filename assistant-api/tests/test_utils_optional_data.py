from pathlib import Path

from src import utils


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
