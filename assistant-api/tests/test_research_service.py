from src.models import PaperInfoExtractionResult
from src.services import research_service


async def test_search_paper_uses_authoritative_search_result_url(monkeypatch) -> None:
    source_url = "https://publisher.example/paper/123"

    async def search(_title):
        return [{"link": f"  {source_url}  "}]

    async def fetch(url, _use_browser, _task_id):
        assert url == source_url
        return "<html>paper</html>"

    async def extract(_prompt, _model, _task_id):
        return PaperInfoExtractionResult(
            title="Paper title",
            authors=["Author"],
            abstract="Abstract",
            url="https://hallucinated.example/wrong",
        )

    monkeypatch.setattr(research_service, "get_search_response", search)
    monkeypatch.setattr(research_service, "fetch_with_playwright", fetch)
    monkeypatch.setattr(research_service, "extract_structured_output", extract)

    result = await research_service.search_paper_by_title("Paper title", "task")

    assert result is not None
    assert result["url"] == source_url


async def test_search_paper_rejects_result_without_valid_link(monkeypatch) -> None:
    async def search(_title):
        return [{"link": None}]

    async def unexpected_fetch(*_args):
        raise AssertionError("fetch should not run without a valid source URL")

    monkeypatch.setattr(research_service, "get_search_response", search)
    monkeypatch.setattr(research_service, "fetch_with_playwright", unexpected_fetch)

    assert await research_service.search_paper_by_title("Paper title", "task") is None
