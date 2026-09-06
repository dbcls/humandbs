import logging

import pytest

from src.models import PaperInfo
from src.tasks import get_research_info_list


@pytest.mark.asyncio
async def test_get_research_info_list_keeps_failed_paper_as_best_effort(monkeypatch) -> None:
    async def failed_retrieval(*args, **kwargs):
        return None

    monkeypatch.setattr("src.tasks.get_paper_info", failed_retrieval)
    related_papers = [
        PaperInfo(title="DOI paper", doi="10.1000/example"),
        PaperInfo(title="PubMed paper", pmid="12345678"),
        PaperInfo(title="Title-only paper"),
        PaperInfo(title=None),
    ]

    result = await get_research_info_list(related_papers, "test-task", logging.getLogger(__name__))

    assert len(result) == len(related_papers)
    assert [info.title for info in result] == ["DOI paper", "PubMed paper", "Title-only paper", ""]
    assert [info.paper_id for info in result] == ["10.1000/example", "PMID:12345678", None, None]
    assert result[0].url == "https://doi.org/10.1000/example"
    assert all(info.icd10_code_list == [] for info in result)