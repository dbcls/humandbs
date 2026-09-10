import asyncio
import ipaddress
import json
import logging
import re
import socket
import xml.etree.ElementTree as ET
from typing import Any, Literal
from urllib.parse import urljoin, urlparse

import aiohttp
from aiohttp_retry import ExponentialRetry, RetryClient
from pydantic import BaseModel, Field

from src.models import PaperInfoExtractionResult, ResearchInfo, ResearchInfoSuggestionResult
from src.prompts import load_prompt
from src.services.google_genai_service import extract_output_from_genai, extract_structured_output
from src.utils import fetch_with_playwright, get_task_logger, icd10_canonicalized_text

logger = logging.getLogger("research_service")

_CITATION_PATTERN = re.compile(
    r"\s*(?P<author>[^,]+),\s*et al\.\s*(?P<journal>.+?)\.\s*"
    r"(?P<year>\d{4});(?P<volume>\d+):(?P<pagination>[\d-]+)\.\s*"
)

# Configure retry strategy with exponential backoff
retry_options = ExponentialRetry(
    attempts=3, start_timeout=0.5, max_timeout=5, factor=2, statuses={500, 502, 503, 504, 408, 429}
)


def _has_paper_content(paper_info: dict[str, Any]) -> bool:
    placeholder_values = {"", "n/a", "na", "none", "null"}
    return any(
        isinstance(value, str) and value.strip().casefold() not in placeholder_values
        for value in (paper_info.get("title"), paper_info.get("abstract"))
    )


async def find_doi_by_bibliographic_query(query: str) -> str | None:
    """Find the most relevant DOI for a citation or paper title using Crossref."""
    url = "https://api.crossref.org/works"
    params = {
        "query.bibliographic": query,
        "rows": 1,
        "select": "DOI,title,author,issued,published-print,published-online,container-title",
    }
    try:
        async with aiohttp.ClientSession() as session:
            retry_client = RetryClient(client_session=session, retry_options=retry_options)
            async with retry_client.get(url, params=params) as resp:
                if resp.status != 200:
                    logger.warning("Crossref bibliographic search failed for %r: %s", query, resp.status)
                    return None
                items = (await resp.json()).get("message", {}).get("items", [])
                if not items:
                    return None
                if not _crossref_candidate_matches_query(query, items[0]):
                    logger.warning("Crossref bibliographic candidate did not match query: %r", query)
                    return None
                doi = items[0].get("DOI")
                return doi.strip() if isinstance(doi, str) and doi.strip() else None
    except (aiohttp.ClientError, json.JSONDecodeError):
        logger.exception("Crossref bibliographic search failed for %r", query)
        return None


async def find_pmid_by_citation(citation: str) -> str | None:
    """Resolve an author-journal-year-volume-page citation to one PubMed record."""
    match = _CITATION_PATTERN.fullmatch(citation)
    if not match:
        return None

    parts = match.groupdict()
    term = (
        f'{parts["author"]}[Author] AND {parts["journal"]}[Journal] AND '
        f'{parts["year"]}[Publication Date] AND {parts["volume"]}[Volume] AND '
        f'{parts["pagination"]}[Pagination]'
    )
    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    try:
        async with aiohttp.ClientSession() as session:
            retry_client = RetryClient(client_session=session, retry_options=retry_options)
            async with retry_client.get(url, params={"db": "pubmed", "retmode": "json", "term": term}) as resp:
                if resp.status != 200:
                    logger.warning("PubMed citation search failed for %r: %s", citation, resp.status)
                    return None
                id_list = (await resp.json()).get("esearchresult", {}).get("idlist", [])
                return id_list[0] if len(id_list) == 1 and isinstance(id_list[0], str) else None
    except (aiohttp.ClientError, json.JSONDecodeError):
        logger.exception("PubMed citation search failed for %r", citation)
        return None


def _normalized_text(value: str | None) -> str:
    return re.sub(r"[^0-9a-z]+", "", value.casefold()) if isinstance(value, str) else ""


def _crossref_year(item: dict[str, Any]) -> str | None:
    for key in ("issued", "published-print", "published-online"):
        date_parts = item.get(key, {}).get("date-parts")
        if isinstance(date_parts, list) and date_parts and isinstance(date_parts[0], list) and date_parts[0]:
            year = date_parts[0][0]
            if isinstance(year, int):
                return str(year)
    return None


def _crossref_candidate_matches_query(query: str, item: dict[str, Any]) -> bool:
    doi = item.get("DOI")
    if not isinstance(doi, str) or not doi.strip():
        return False

    title_values = item.get("title")
    candidate_title = title_values[0] if isinstance(title_values, list) and title_values else ""
    query_title = _normalized_text(query)
    normalized_title = _normalized_text(candidate_title)

    match = _CITATION_PATTERN.fullmatch(query)
    if not match:
        return bool(query_title and normalized_title and (
            query_title in normalized_title or normalized_title in query_title
        ))

    parts = match.groupdict()
    author = _normalized_text(parts["author"])
    journal = _normalized_text(parts["journal"])
    candidate_year = _crossref_year(item)
    author_values = item.get("author", [])
    authors = [
        _normalized_text(" ".join(part for part in [value.get("given"), value.get("family")] if isinstance(part, str)))
        for value in author_values
        if isinstance(value, dict)
    ]
    journal_values = item.get("container-title", [])
    journals = [
        _normalized_text(value)
        for value in journal_values
        if isinstance(value, str)
    ]
    return (
        candidate_year == parts["year"]
        and any(author in value or value in author for value in authors if value)
        and any(journal in value or value in journal for value in journals if value)
    )


def _normalized_http_url(url: str | None) -> str | None:
    if not isinstance(url, str):
        return None
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
        return None
    return parsed._replace(fragment="").geturl()


async def _hostname_has_only_public_ips(hostname: str) -> bool:
    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False

    addresses = {
        ipaddress.ip_address(info[4][0])
        for info in infos
        if isinstance(info, tuple) and len(info) > 4 and info[4]
    }
    return bool(addresses) and all(address.is_global for address in addresses)


async def _is_safe_public_url(url: str) -> bool:
    normalized_url = _normalized_http_url(url)
    if normalized_url is None:
        return False
    hostname = urlparse(normalized_url).hostname
    if not hostname or hostname.casefold() == "localhost":
        return False
    try:
        return ipaddress.ip_address(hostname).is_global
    except ValueError:
        return await _hostname_has_only_public_ips(hostname)


async def _resolve_safe_grounded_url(
    source_url: str | None, grounded_urls: list[str], task_logger: logging.Logger
) -> str | None:
    normalized_source_url = _normalized_http_url(source_url)
    grounded_candidates = {
        normalized_url
        for normalized_url in (_normalized_http_url(url) for url in grounded_urls)
        if normalized_url is not None
    }
    if normalized_source_url is None or normalized_source_url not in grounded_candidates:
        task_logger.error("Paper URL was not present in grounding metadata: %s", source_url)
        return None

    current_url = normalized_source_url
    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        for _ in range(5):
            if not await _is_safe_public_url(current_url):
                task_logger.error("Rejected unsafe paper URL: %s", current_url)
                return None
            async with session.get(current_url, allow_redirects=False) as response:
                if 300 <= response.status < 400:
                    redirect_url = _normalized_http_url(urljoin(current_url, response.headers.get("Location", "")))
                    if redirect_url is None:
                        task_logger.error("Rejected invalid redirect for paper URL: %s", current_url)
                        return None
                    current_url = redirect_url
                    continue
                return current_url

    task_logger.error("Too many redirects while validating paper URL: %s", source_url)
    return None


async def search_paper_by_title(title: str, task_id: str | None = None) -> dict[str, Any] | None:
    task_logger = get_task_logger(task_id)
    class PaperSearchResult(BaseModel):
        source_url: str | None = Field(None, description="論文の公開ランディングページのURL")

    search_result, grounded_urls = await extract_output_from_genai(
        load_prompt("paper_url_search.txt", paper_reference=title),
        PaperSearchResult,
        logger=task_logger,
    )
    source_url = search_result.source_url if search_result else None
    source_url = await _resolve_safe_grounded_url(source_url, grounded_urls or [], task_logger)
    if source_url is None:
        task_logger.error(f"No grounded paper URL found for title: {title}")
        return None
    task_logger.info(f"Grounded paper URL: {source_url}")

    html = await fetch_with_playwright(source_url, True, task_id)

    if not html:
        task_logger.error(f"Failed to fetch HTML content for URL: {source_url}")
        return None

    extraction_result = await extract_structured_output(
        load_prompt("paper_info_extraction_from_web.txt", html=html),
        PaperInfoExtractionResult,
        task_id=task_id,
    )
    task_logger.info(f"Extraction result: {extraction_result}")

    if not extraction_result:
        task_logger.error(f"Failed to extract paper information from URL: {source_url}")
        return None

    paper_info = {
        "title": extraction_result.title,
        "authors": extraction_result.authors,
        "abstract": extraction_result.abstract,
        "url": source_url,
    }
    if not _has_paper_content(paper_info):
        task_logger.error(f"No paper information extracted from URL: {source_url}")
        return None
    return paper_info


async def get_paper_info(
    paper_id: str, title: str, id_type: Literal["doi", "pubmed", "title"], task_id: str = None
) -> ResearchInfo | None:
    """Get research paper information"""
    task_logger = get_task_logger(task_id)
    paper_info = None
    if id_type == "doi":
        paper_info = await fetch_from_doi(paper_id)
    elif id_type == "pubmed":
        paper_info = await fetch_from_pubmed(paper_id)
        paper_id = "PMID:" + paper_id
    if id_type == "title":
        pmid = await find_pmid_by_citation(title)
        if pmid:
            paper_id = f"PMID:{pmid}"
            paper_info = await fetch_from_pubmed(pmid)
        else:
            doi = await find_doi_by_bibliographic_query(title)
            if doi:
                paper_id = doi
                paper_info = await fetch_from_doi(doi)
    if not paper_info or (not paper_info.get("abstract") and title):
        paper_info = await search_paper_by_title(title, task_id)
    if not paper_info:
        task_logger.error(f"Failed to fetch paper info for {paper_id} with id_type {id_type}")
        return None

    title = paper_info.get("title", "")
    authors = paper_info.get("authors", [])
    abstract = paper_info.get("abstract", "")
    if not abstract:
        abstract = ""

    suggestion_result = await extract_structured_output(
        load_prompt("paper_info_suggestion.txt", title=title, abstract=abstract),
        ResearchInfoSuggestionResult,
        task_id=task_id,
    )

    if not suggestion_result:
        task_logger.error("Failed to generate research suggestions for %s", paper_id)
        return None

    handles_human_data = suggestion_result.handles_human_data
    human_data_reason = (suggestion_result.human_data_reason or "").strip()
    human_data_evidence = ""
    if suggestion_result.handles_human_data:
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

                            extraction_result = await extract_structured_output(
                                load_prompt("paper_abstract_extraction.txt", html=html),
                                ExtractionResult,
                                task_id=None,
                            )
                            abstract = extraction_result.abstract if extraction_result else None

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
