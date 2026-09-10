from src.models import PaperInfoExtractionResult
from src.services import research_service


async def test_search_paper_uses_authoritative_search_result_url(monkeypatch) -> None:
    source_url = "https://publisher.example/paper/123"
    validated_url = "https://publisher.example/paper/123?validated=1"

    async def grounded_search(prompt, output_model, logger):
        assert "Paper title" in prompt
        assert logger is not None
        return output_model(source_url=source_url), [source_url]

    async def validate(url, grounded_urls, _logger):
        assert url == source_url
        assert grounded_urls == [source_url]
        return validated_url

    async def fetch(url, _use_browser, _task_id):
        assert url == validated_url
        return "<html>paper</html>"

    async def extract(_prompt, _model, system_message=None, task_id=None):
        assert system_message is None
        assert task_id == "task"
        return PaperInfoExtractionResult(
            title="Paper title",
            authors=["Author"],
            abstract="Abstract",
            url="https://hallucinated.example/wrong",
        )

    monkeypatch.setattr(research_service, "extract_output_from_genai", grounded_search)
    monkeypatch.setattr(research_service, "_resolve_safe_grounded_url", validate)
    monkeypatch.setattr(research_service, "fetch_with_playwright", fetch)
    monkeypatch.setattr(research_service, "extract_structured_output", extract)

    result = await research_service.search_paper_by_title("Paper title", "task")

    assert result is not None
    assert result["url"] == validated_url


async def test_search_paper_rejects_result_without_valid_link(monkeypatch) -> None:
    async def grounded_search(_prompt, output_model, logger):
        assert logger is not None
        return output_model(source_url=None), []

    async def unexpected_fetch(*_args):
        raise AssertionError("fetch should not run without a valid source URL")

    monkeypatch.setattr(research_service, "extract_output_from_genai", grounded_search)
    monkeypatch.setattr(research_service, "fetch_with_playwright", unexpected_fetch)

    assert await research_service.search_paper_by_title("Paper title", "task") is None


async def test_search_paper_rejects_placeholder_extraction(monkeypatch) -> None:
    async def grounded_search(_prompt, output_model, logger):
        assert logger is not None
        source_url = "https://pmc.ncbi.nlm.nih.gov/articles/PMC12844639/"
        return output_model(source_url=source_url), [source_url]

    async def validate(url, grounded_urls, _logger):
        assert grounded_urls == [url]
        return url

    async def fetch(*_args):
        return "<html>cached page</html>"

    async def extract(*_args, **_kwargs):
        return PaperInfoExtractionResult(title="N/A", authors=[], abstract="N/A", url="N/A")

    monkeypatch.setattr(research_service, "extract_output_from_genai", grounded_search)
    monkeypatch.setattr(research_service, "_resolve_safe_grounded_url", validate)
    monkeypatch.setattr(research_service, "fetch_with_playwright", fetch)
    monkeypatch.setattr(research_service, "extract_structured_output", extract)

    assert await research_service.search_paper_by_title("Paper title", "task") is None


async def test_search_paper_rejects_url_not_present_in_grounding_metadata(monkeypatch) -> None:
    async def grounded_search(_prompt, output_model, logger):
        assert logger is not None
        return output_model(source_url="https://publisher.example/paper/123"), [
            "https://publisher.example/paper/456"
        ]

    async def unexpected_fetch(*_args):
        raise AssertionError("fetch should not run for an ungrounded URL")

    monkeypatch.setattr(research_service, "extract_output_from_genai", grounded_search)
    monkeypatch.setattr(research_service, "fetch_with_playwright", unexpected_fetch)

    assert await research_service.search_paper_by_title("Paper title", "task") is None


class _FakeResponse:
    def __init__(self, status: int, payload: dict) -> None:
        self.status = status
        self._payload = payload
        self.headers: dict[str, str] = {}

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def json(self) -> dict:
        return self._payload


class _FakeSession:
    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeRedirectSession(_FakeSession):
    def __init__(self, responses: list[_FakeResponse], *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._responses = responses

    def get(self, _url, allow_redirects=False):
        assert allow_redirects is False
        return self._responses.pop(0)


async def test_get_paper_info_resolves_citation_through_crossref(monkeypatch) -> None:
    citation = "Mineshita Y, et al. Metabolites. 2022;12:669."

    async def find_doi(query):
        assert query == citation
        return "10.3390/metabo12070669"

    async def fetch_doi(doi):
        assert doi == "10.3390/metabo12070669"
        return {"title": "Resolved title", "authors": [], "abstract": "Abstract", "url": "https://doi.org/example"}

    async def suggest(_prompt, _model, system_message=None, task_id=None):
        assert system_message is None
        assert task_id == "task"
        return research_service.ResearchInfoSuggestionResult(
            summary_jp="要約",
            handles_human_data=False,
            human_data_reason="",
            evidence_excerpt="",
            icd10_code_list=[],
            analysis_method_list=[],
        )

    async def unexpected_search(*_args):
        raise AssertionError("web search should not run after a Crossref match")

    async def no_pmid_match(_query):
        return None

    monkeypatch.setattr(research_service, "find_pmid_by_citation", no_pmid_match)
    monkeypatch.setattr(research_service, "find_doi_by_bibliographic_query", find_doi)
    monkeypatch.setattr(research_service, "fetch_from_doi", fetch_doi)
    monkeypatch.setattr(research_service, "extract_structured_output", suggest)
    monkeypatch.setattr(research_service, "search_paper_by_title", unexpected_search)

    result = await research_service.get_paper_info(None, citation, "title", task_id="task")

    assert result is not None
    assert result.title == "Resolved title"
    assert result.paper_id == "10.3390/metabo12070669"


async def test_get_paper_info_resolves_structured_citation_through_pubmed(monkeypatch) -> None:
    citation = "Sasaki H, et al. J Nutr Biochem. 2023;120:109420."

    async def find_pmid(query):
        assert query == citation
        return "37516314"

    async def fetch_pubmed(pmid):
        assert pmid == "37516314"
        return {
            "title": "Resolved from PubMed",
            "authors": ["Hiroyuki Sasaki"],
            "abstract": "Abstract",
            "url": "https://pubmed.ncbi.nlm.nih.gov/37516314/",
        }

    async def suggest(_prompt, _model, system_message=None, task_id=None):
        assert system_message is None
        assert task_id == "task"
        return research_service.ResearchInfoSuggestionResult(
            summary_jp="要約",
            handles_human_data=False,
            human_data_reason="",
            evidence_excerpt="",
            icd10_code_list=[],
            analysis_method_list=[],
        )

    async def unexpected_fallback(*_args):
        raise AssertionError("Crossref or web search should not run after a PubMed match")

    monkeypatch.setattr(research_service, "find_pmid_by_citation", find_pmid)
    monkeypatch.setattr(research_service, "fetch_from_pubmed", fetch_pubmed)
    monkeypatch.setattr(research_service, "find_doi_by_bibliographic_query", unexpected_fallback)
    monkeypatch.setattr(research_service, "search_paper_by_title", unexpected_fallback)
    monkeypatch.setattr(research_service, "extract_structured_output", suggest)

    result = await research_service.get_paper_info(None, citation, "title", task_id="task")

    assert result is not None
    assert result.paper_id == "PMID:37516314"
    assert result.url == "https://pubmed.ncbi.nlm.nih.gov/37516314/"


async def test_find_doi_by_bibliographic_query_rejects_unmatched_crossref_candidate(monkeypatch) -> None:
    payload = {
        "message": {
            "items": [{
                "DOI": "10.1000/example",
                "title": ["Different title"],
                "author": [{"given": "John", "family": "Smith"}],
                "issued": {"date-parts": [[2024]]},
                "container-title": ["Other Journal"],
            }]
        }
    }
    captured = {}

    class FakeRetryClient:
        def __init__(self, client_session, retry_options) -> None:
            pass

        def get(self, url, params):
            captured["url"] = url
            captured["params"] = params
            return _FakeResponse(200, payload)

    monkeypatch.setattr(research_service.aiohttp, "ClientSession", _FakeSession)
    monkeypatch.setattr(research_service, "RetryClient", FakeRetryClient)

    result = await research_service.find_doi_by_bibliographic_query(
        "Mineshita Y, et al. Metabolites. 2022;12:669."
    )

    assert result is None
    assert captured["url"] == "https://api.crossref.org/works"
    assert captured["params"]["select"] == (
        "DOI,title,author,issued,published-print,published-online,container-title"
    )


async def test_find_doi_by_bibliographic_query_accepts_matching_crossref_title(monkeypatch) -> None:
    payload = {
        "message": {
            "items": [{
                "DOI": "10.1000/example",
                "title": ["Resolved title"],
                "author": [{"given": "Jane", "family": "Doe"}],
                "issued": {"date-parts": [[2024]]},
                "container-title": ["Example Journal"],
            }]
        }
    }

    class FakeRetryClient:
        def __init__(self, client_session, retry_options) -> None:
            pass

        def get(self, _url, params):
            return _FakeResponse(200, payload)

    monkeypatch.setattr(research_service.aiohttp, "ClientSession", _FakeSession)
    monkeypatch.setattr(research_service, "RetryClient", FakeRetryClient)

    result = await research_service.find_doi_by_bibliographic_query("Resolved title")

    assert result == "10.1000/example"


async def test_resolve_safe_grounded_url_rejects_redirect_outside_grounding(monkeypatch) -> None:
    redirect = _FakeResponse(302, {})
    redirect.headers["Location"] = "https://other.example/paper"

    async def safe(_url):
        return True

    monkeypatch.setattr(research_service, "_is_safe_public_url", safe)
    monkeypatch.setattr(
        research_service.aiohttp,
        "ClientSession",
        lambda *args, **kwargs: _FakeRedirectSession([redirect], *args, **kwargs),
    )

    result = await research_service._resolve_safe_grounded_url(
        "https://publisher.example/paper",
        ["https://publisher.example/paper"],
        research_service.logger,
    )

    assert result is None


async def test_resolve_safe_grounded_url_rejects_unsuccessful_status(monkeypatch) -> None:
    async def safe(_url):
        return True

    monkeypatch.setattr(research_service, "_is_safe_public_url", safe)
    monkeypatch.setattr(
        research_service.aiohttp,
        "ClientSession",
        lambda *args, **kwargs: _FakeRedirectSession([_FakeResponse(404, {})], *args, **kwargs),
    )

    result = await research_service._resolve_safe_grounded_url(
        "https://publisher.example/paper",
        ["https://publisher.example/paper"],
        research_service.logger,
    )

    assert result is None
