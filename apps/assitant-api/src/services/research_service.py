import json
import logging
import xml.etree.ElementTree as ET
from typing import Any, Literal

import aiohttp
from aiohttp_retry import ExponentialRetry, RetryClient
from pydantic import BaseModel, Field

from src.models import PaperInfoExtractionResult, ResearchInfo, ResearchInfoSuggestionResult
from src.prompts import load_prompt
from src.services.llm_service import extract_output_from_openai
from src.utils import fetch_with_playwright, get_search_response, get_task_logger, icd10_canonicalized_text

logger = logging.getLogger("research_service")

# Configure retry strategy with exponential backoff
retry_options = ExponentialRetry(
    attempts=3, start_timeout=0.5, max_timeout=5, factor=2, statuses={500, 502, 503, 504, 408, 429}
)


async def search_paper_by_title(title: str, task_id: str = None) -> list[dict[str, Any]]:
    task_logger = get_task_logger(task_id)
    search_result = get_search_response(title)
    if not search_result:
        task_logger.error(f"Search result is None for title: {title}")
        return None
    if not isinstance(search_result, list):
        task_logger.error(f"Search result is not a list: {search_result}")
        return None
    if not search_result:
        task_logger.error(f"No search results found for title: {title}")
        return None
    first_result = search_result[0]
    task_logger.info(f"First search result: {first_result}")

    html = await fetch_with_playwright(first_result["link"], True, task_id)

    if not html:
        task_logger.error(f"Failed to fetch HTML content for URL: {first_result['link']}")
        return None

    extraction_result = await extract_output_from_openai(
        load_prompt("paper_info_extraction_from_web.txt", html=html),
        PaperInfoExtractionResult,
        task_id,
    )
    task_logger.info(f"Extraction result: {extraction_result}")

    return {
        "title": extraction_result.title,
        "authors": extraction_result.authors,
        "abstract": extraction_result.abstract,
        "url": extraction_result.url,
    }


async def get_paper_info(
    paper_id: str, title: str, id_type: Literal["doi", "pubmed", "title"], task_id: str = None
) -> ResearchInfo | None:
    """Get research paper information"""
    task_logger = get_task_logger(task_id)
    if id_type == "doi":
        paper_info = await fetch_from_doi(paper_id)
    elif id_type == "pubmed":
        paper_info = await fetch_from_pubmed(paper_id)
        paper_id = "PMID:" + paper_id
    if id_type == "title" or not paper_info or not paper_info["abstract"] and title:
        paper_info = await search_paper_by_title(title, task_id)
    if not paper_info:
        task_logger.error(f"Failed to fetch paper info for {paper_id} with id_type {id_type}")
        return None

    title = paper_info.get("title", "")
    authors = paper_info.get("authors", [])
    abstract = paper_info.get("abstract", "")
    if not abstract:
        abstract = ""

    suggestion_result = await extract_output_from_openai(
        load_prompt("paper_info_suggestion.txt", title=title, abstract=abstract),
        ResearchInfoSuggestionResult,
        task_id,
    )

    handles_human_data = suggestion_result.handles_human_data if suggestion_result else None
    human_data_reason = (suggestion_result.human_data_reason or "").strip() if suggestion_result else ""
    human_data_evidence = ""
    if suggestion_result and suggestion_result.handles_human_data:
        human_data_evidence = (suggestion_result.evidence_excerpt or "").strip()

    icd10_code_list = [icd10_canonicalized_text(code) for code in suggestion_result.icd10_code_list]
    summary_jp = suggestion_result.summary_jp.strip() if suggestion_result.summary_jp else title

    research_info = ResearchInfo(
        title=title,
        summary_jp=summary_jp,
        paper_id=paper_id,
        authors=authors,
        abstract=abstract,
        url=paper_info.get("url", ""),
        handles_human_data=handles_human_data,
        human_data_reason=human_data_reason,
        human_data_evidence=human_data_evidence,
        icd10_code_list=icd10_code_list if icd10_code_list else [],
        analysis_method_list=suggestion_result.analysis_method_list if suggestion_result.analysis_method_list else [],
    )
    return research_info


async def fetch_from_pubmed(pmid: str) -> dict[str, Any] | None:
    """Fetch paper information from PubMed"""
    url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={pmid}&retmode=xml"
    try:
        async with aiohttp.ClientSession() as session:
            retry_client = RetryClient(client_session=session, retry_options=retry_options)
            async with retry_client.get(url) as resp:
                if resp.status == 200:
                    xml_data = await resp.text()
                    root = ET.fromstring(xml_data)
                    title = root.find(".//ArticleTitle")
                    title = "".join(title.itertext()) if title is not None else ""
                    authors = []
                    for author in root.findall(".//Author"):
                        try:
                            last_name = author.find("LastName").text
                            first_name = author.find("ForeName").text
                            full_name = f"{first_name} {last_name}"
                            authors.append(full_name)
                        except Exception:
                            logging.exception("Error parsing author name")
                            continue
                    abstract = root.find(".//AbstractText")
                    abstract = "".join(abstract.itertext()) if abstract is not None else ""
                    url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
                    return {
                        "title": title,
                        "authors": authors,
                        "abstract": abstract,
                        "url": url,
                    }
                logger.error(f"Error fetching PubMed data: {resp.status}")
                return None
    except aiohttp.ClientError:
        logging.exception(f"Client error occurred while fetching PubMed data for PMID {pmid}")
        return None
    except Exception:
        logging.exception(f"Unexpected error occurred while fetching PubMed data for PMID {pmid}")
        return None


async def fetch_from_doi(doi: str) -> dict[str, Any] | None:
    """Fetch paper information from DOI"""
    url = f"https://api.crossref.org/works/{doi}/transform/application/vnd.citationstyles.csl+json"
    try:
        async with aiohttp.ClientSession() as session:
            retry_client = RetryClient(client_session=session, retry_options=retry_options)
            async with retry_client.get(url) as resp:
                if resp.status == 200:
                    content_type = resp.content_type
                    if "application/octet-stream" in content_type:
                        raw_data = await resp.read()
                        data = json.loads(raw_data.decode("utf-8"))
                    else:
                        data = await resp.json()

                    title = data.get("title", "")

                    # 著者リスト
                    authors = []
                    for a in data.get("author", []):
                        given = a.get("given", "").strip()
                        family = a.get("family", "").strip()
                        full_name = " ".join(filter(None, [given, family]))
                        if full_name:
                            authors.append(full_name)

                    # abstract フィールド（存在しないケースもある）
                    abstract = data.get("abstract")
                    if not abstract:
                        abstract = await fetch_abstract_europepmc(doi)
                    if not abstract:
                        html = await fetch_with_playwright(data.get("URL", ""), True, task_id=None)
                        if html:

                            class ExtractionResult(BaseModel):
                                abstract: str = Field(
                                    ...,
                                    description="抽出された論文の概要",
                                )

                            extraction_result = await extract_output_from_openai(
                                load_prompt("paper_abstract_extraction.txt", html=html),
                                ExtractionResult,
                                task_id=None,
                            )
                            abstract = extraction_result.abstract

                    url = ""
                    if "link" in data:
                        for link in data["link"]:
                            url = link.get("URL", "")
                            if link.get("content-type") == "text/html":  # HTMLリンクを優先
                                break

                    return {
                        "title": title,
                        "authors": authors,
                        "abstract": abstract,
                        "url": url,
                    }
                logger.error(f"Error fetching DOI data: {resp.status}")
                return None
    except aiohttp.ClientError:
        logging.exception(f"Client error occurred while fetching DOI data for DOI {doi}")
        return None
    except json.JSONDecodeError:
        logging.exception(f"JSON decode error occurred while fetching DOI data for DOI {doi}")
        return None
    except Exception:
        logging.exception(f"Unexpected error occurred while fetching DOI data for DOI {doi}")
        return None


async def fetch_abstract_europepmc(doi: str) -> str | None:
    """Fetch abstract from Europe PMC if not available in CrossRef"""
    url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    params = {"query": f"DOI:{doi}", "format": "json", "resultType": "core"}
    try:
        async with aiohttp.ClientSession() as session:
            retry_client = RetryClient(client_session=session, retry_options=retry_options)
            async with retry_client.get(url, params=params) as resp:
                if resp.status == 200:
                    records = (await resp.json()).get("resultList", {}).get("result", [])
                    if records:
                        return records[0].get("abstractText")
                return None
    except aiohttp.ClientError:
        logging.exception(f"Client error occurred while fetching abstract from Europe PMC for DOI {doi}")
        return None
    except json.JSONDecodeError:
        logging.exception(f"JSON decode error occurred while fetching abstract from Europe PMC for DOI {doi}")
        return None
    except Exception:
        logging.exception(f"Unexpected error occurred while fetching abstract from Europe PMC for DOI {doi}")
        return None
