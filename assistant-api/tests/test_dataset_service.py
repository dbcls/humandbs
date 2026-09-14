import pytest

from src.services import dataset_service


class _FakeResponse:
    def __init__(self, status: int, payload: dict):
        self.status = status
        self._payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def json(self):
        return self._payload


class _FakeSession:
    def __init__(self, payload: dict, status: int = 200):
        self._payload = payload
        self._status = status

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def get(self, _url: str):
        return _FakeResponse(self._status, self._payload)


def _patch_ddbj(monkeypatch) -> None:
    async def fake_ddbj(_dataset_id: str):
        return ["JGAS000002"], ["hum9999"]

    monkeypatch.setattr(dataset_service, "get_jga_study_ids_from_ddbj", fake_ddbj)


@pytest.mark.asyncio
async def test_get_dataset_info_decodes_current_schema_and_all_experiments(monkeypatch) -> None:
    monkeypatch.setenv("HUMANDBS_API_ORIGIN", "http://app:5173")
    payload = {
        "id": "DRA000908",
        "research": "hum0003",
        "values": [
            {
                "key": "access-criteria",
                "label": {"ja": "アクセス制限", "en": "Access type"},
                "type": "vocabulary",
                "terms": [{"code": "unrestricted-access", "label": {"ja": "非制限", "en": "unrestricted"}}],
            },
            {
                "key": "data-summary",
                "label": {"ja": "データ概要", "en": "Data summary"},
                "type": "text",
                "text": {"ja": "<p>全ゲノム解析</p>", "en": "Whole-genome analysis"},
            },
            {
                "key": "participant-status",
                "label": {"ja": "対象者の状態", "en": "Participant status"},
                "type": "single",
                "value": "患者",
            },
            {
                "key": "jga-dataset-accession",
                "label": {"ja": "JGAデータセットAccession", "en": "JGA dataset accession"},
                "type": "accession",
                "value": "JGAD000908",
            },
            {
                "key": "read-length",
                "label": {"ja": "リード長", "en": "Read length"},
                "type": "number",
                "numbers": [{"value": 100, "unit": "bp", "label": "Read 1", "note": "paired-end"}],
            },
            {
                "key": "disease",
                "label": {"ja": "疾患", "en": "Disease"},
                "type": "disease",
                "diseases": [
                    {
                        "terms": [{"code": "C34", "label": {"ja": "気管支及び肺の悪性新生物", "en": "Lung cancer"}}],
                        "name": {"ja": "肺がん", "en": "Lung cancer"},
                    }
                ],
            },
        ],
        "experiments": [
            {
                "label": "JGAS000001（全ゲノム）",
                "values": [
                    {
                        "key": "analysis-methods",
                        "label": {"ja": "解析方法", "en": "Analysis methods"},
                        "type": "text",
                        "text": {"ja": "WGS"},
                    },
                    {
                        "key": "platform",
                        "label": {"ja": "プラットフォーム", "en": "Platform"},
                        "type": "vocabulary",
                        "terms": [{"code": "hiseq", "label": {"en": "HiSeq 2500"}}],
                    },
                ],
            },
            {
                "label": "RNA: JGAS000002 / duplicate JGAS000001",
                "values": [
                    {
                        "key": "analysis-methods",
                        "label": {"ja": "解析方法", "en": "Analysis methods"},
                        "type": "text",
                        "text": {"ja": "RNA-seq"},
                    },
                    {
                        "key": "platform",
                        "label": {"ja": "プラットフォーム", "en": "Platform"},
                        "type": "vocabulary",
                        "terms": [
                            {"code": "hiseq", "label": {"en": "HiSeq 2500"}},
                            {"code": "novaseq", "label": {"ja": "NovaSeq 6000"}},
                        ],
                    },
                    {
                        "key": "read-length",
                        "label": {"ja": "リード長", "en": "Read length"},
                        "type": "number",
                        "numbers": [{"value": 150, "unit": "bp"}],
                    },
                ],
            },
        ],
    }
    monkeypatch.setattr(dataset_service.aiohttp, "ClientSession", lambda: _FakeSession(payload))
    _patch_ddbj(monkeypatch)

    result = await dataset_service.get_dataset_info("DRA000908")

    assert result is not None
    assert result.hum_id == "hum0003"
    assert result.study_id_list == ["JGAS000001", "JGAS000002"]
    assert result.study_id_list_from_ddbj == ["JGAS000002"]
    assert result.hum_id_list_from_ddbj == ["hum9999"]
    assert result.info_dict == {
        "アクセス制限": ["非制限"],
        "データ概要": "全ゲノム解析",
        "対象者の状態": "患者",
        "JGAデータセットAccession": "JGAD000908",
        "リード長": [
            {"value": 100, "unit": "bp", "label": "Read 1", "note": "paired-end"},
            {"value": 150, "unit": "bp"},
        ],
        "疾患": [
            {
                "name": "肺がん",
                "terms": [{"code": "C34", "label": "気管支及び肺の悪性新生物"}],
            }
        ],
        "解析方法": ["WGS", "RNA-seq"],
        "プラットフォーム": ["HiSeq 2500", "NovaSeq 6000"],
        "Policies": {"ja": {"text": "非制限"}},
    }


@pytest.mark.asyncio
async def test_get_dataset_info_allows_missing_research_and_empty_experiments(monkeypatch) -> None:
    monkeypatch.setenv("HUMANDBS_API_ORIGIN", "http://app:5173")
    payload = {"values": [{"key": "description", "type": "text", "text": {"en": "Dataset"}}], "experiments": []}
    monkeypatch.setattr(dataset_service.aiohttp, "ClientSession", lambda: _FakeSession(payload))
    _patch_ddbj(monkeypatch)

    result = await dataset_service.get_dataset_info("DRA000910")

    assert result is not None
    assert result.hum_id == ""
    assert result.study_id_list == []
    assert result.info_dict["description"] == "Dataset"


@pytest.mark.asyncio
async def test_get_dataset_info_preserves_current_schema_null_values(monkeypatch) -> None:
    monkeypatch.setenv("HUMANDBS_API_ORIGIN", "http://app:5173")
    payload = {
        "research": "hum0004",
        "values": [
            {"key": "text", "label": {"en": "Text"}, "type": "text", "text": {"ja": None, "en": None}},
            {"key": "single", "label": {"en": "Single"}, "type": "single", "value": None},
            {"key": "accession", "label": {"en": "Accession"}, "type": "accession", "value": None},
            {"key": "terms", "label": {"en": "Terms"}, "type": "vocabulary", "terms": None},
            {"key": "numbers", "label": {"en": "Numbers"}, "type": "number", "numbers": None},
            {"key": "diseases", "label": {"en": "Diseases"}, "type": "disease", "diseases": None},
        ],
        "experiments": [],
    }
    monkeypatch.setattr(dataset_service.aiohttp, "ClientSession", lambda: _FakeSession(payload))
    _patch_ddbj(monkeypatch)

    result = await dataset_service.get_dataset_info("DRA000909")

    assert result is not None
    assert result.info_dict == {
        "Text": None,
        "Single": None,
        "Accession": None,
        "Terms": None,
        "Numbers": None,
        "Diseases": None,
    }


@pytest.mark.asyncio
async def test_get_dataset_info_returns_none_for_unsuccessful_response(monkeypatch) -> None:
    monkeypatch.setenv("HUMANDBS_API_ORIGIN", "http://app:5173")
    monkeypatch.setattr(dataset_service.aiohttp, "ClientSession", lambda: _FakeSession({}, status=503))

    assert await dataset_service.get_dataset_info("DRA000911") is None


@pytest.mark.asyncio
async def test_get_jga_study_ids_from_ddbj_returns_empty_lists_for_unsuccessful_response(monkeypatch) -> None:
    monkeypatch.setattr(dataset_service.aiohttp, "ClientSession", lambda: _FakeSession({}, status=503))

    assert await dataset_service.get_jga_study_ids_from_ddbj("DRA000912") == ([], [])