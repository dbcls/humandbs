from pathlib import Path

from src import utils


def test_find_latest_research_versions_missing_directory_returns_empty_dict() -> None:
    assert utils.find_latest_research_versions("/tmp/this-directory-should-not-exist") == {}


def test_get_icd10_description_returns_none_when_mapping_file_missing(monkeypatch) -> None:
    missing_path = Path("/tmp/non-existent-icd10-mapping.json")
    monkeypatch.setattr(utils, "ICD10_MAPPING_PATH", missing_path)
    utils._load_icd10_descriptions.cache_clear()

    assert utils.get_icd10_description("A00") is None

    utils._load_icd10_descriptions.cache_clear()
