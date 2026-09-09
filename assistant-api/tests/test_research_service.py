from src.models import PaperInfoExtractionResult
from src.services import research_service


async def test_search_paper_uses_authoritative_search_result_url(monkeypatch) -> None:
    source_url = "https://publisher.example/paper/123"

    async def grounded_search(prompt, output_model, logger):
        assert "Paper title" in prompt
        assert logger is not None
        return output_model(source_url=source_url), []

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

    monkeypatch.setattr(research_service, "extract_output_from_genai", grounded_search)
    monkeypatch.setattr(research_service, "fetch_with_playwright", fetch)
    monkeypatch.setattr(research_service, "extract_structured_output", extract)

    result = await research_service.search_paper_by_title("Paper title", "task")

    assert result is not None
    assert result["url"] == source_url


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
        return output_model(source_url="https://pmc.ncbi.nlm.nih.gov/articles/PMC12844639/"), []

    async def fetch(*_args):
        return "<html>cached page</html>"

    async def extract(*_args):
        return PaperInfoExtractionResult(title="N/A", authors=[], abstract="N/A", url="N/A")

    monkeypatch.setattr(research_service, "extract_output_from_genai", grounded_search)
    monkeypatch.setattr(research_service, "fetch_with_playwright", fetch)
    monkeypatch.setattr(research_service, "extract_structured_output", extract)

    assert await research_service.search_paper_by_title("Paper title", "task") is None


async def test_get_paper_info_resolves_citation_through_crossref(monkeypatch) -> None:
    citation = "Mineshita Y, et al. Metabolites. 2022;12:669."

    async def find_doi(query):
        assert query == citation
        return "10.3390/metabo12070669"

    async def fetch_doi(doi):
        assert doi == "10.3390/metabo12070669"
        return {"title": "Resolved title", "authors": [], "abstract": "Abstract", "url": "https://doi.org/example"}

    async def suggest(*_args):
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

    async def suggest(*_args):
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
