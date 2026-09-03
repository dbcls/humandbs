from pathlib import Path

from src import utils

def test_get_icd10_description_returns_none_when_mapping_file_missing(monkeypatch) -> None:
    missing_path = Path("/tmp/non-existent-icd10-mapping.json")
    monkeypatch.setattr(utils, "ICD10_MAPPING_PATH", missing_path)
    utils._load_icd10_descriptions.cache_clear()

    assert utils.get_icd10_description("A00") is None

    utils._load_icd10_descriptions.cache_clear()
