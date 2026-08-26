import os

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
    def __init__(self, payload: dict):
        self._payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def get(self, _url: str):
        return _FakeResponse(200, self._payload)


@pytest.mark.asyncio
async def test_get_dataset_info_normalizes_v2_response(monkeypatch) -> None:
    monkeypatch.setenv("HUMANDBS_API_ORIGIN", "http://app:5173")

    payload = {
        "id": "DRA000908",
        "research": "hum0003",
        "values": [
            {
                "key": "access-criteria",
                "label": {"ja": "アクセス制限", "en": "Access type"},
                "type": "vocabulary",
                "terms": [
                    {
                        "code": "unrestricted-access",
                        "label": {"ja": "非制限", "en": "unrestricted"},
                    }
                ],
            },
            {
                "key": "type-of-data",
                "label": {"ja": "データ種別", "en": "Type of data"},
                "type": "text",
                "text": {"ja": "NGS", "en": "NGS"},
            },
        ],
        "experiments": [
            {
                "header": {"ja": "Study JGAS000001", "en": "Study JGAS000001"},
                "data": {},
            }
        ],
    }

    monkeypatch.setattr(dataset_service.aiohttp, "ClientSession", lambda: _FakeSession(payload))

    async def _fake_ddbj(_dataset_id: str):
        return ["JGAS000002"], ["hum9999"]

    monkeypatch.setattr(dataset_service, "get_jga_study_ids_from_ddbj", _fake_ddbj)

    result = await dataset_service.get_dataset_info("DRA000908")

    assert result is not None
    assert result.hum_id == "hum0003"
    assert result.study_id_list == ["JGAS000001"]
    assert result.study_id_list_from_ddbj == ["JGAS000002"]
    assert result.hum_id_list_from_ddbj == ["hum9999"]
    assert result.info_dict["データ種別"] == "NGS"
    assert result.info_dict["Policies"]["ja"]["text"] == "非制限"
