#!/usr/bin/env python3
import asyncio
import hashlib
import json
import logging
import os
import pickle
import re
import ssl
import time
from pathlib import Path
from urllib.parse import quote

import fitz  # PyMuPDF
import pymupdf4llm
from googleapiclient.discovery import build
from jinja2 import Environment, FileSystemLoader
from langchain_community.document_transformers import Html2TextTransformer
from langchain_core.documents import Document
from playwright.async_api import async_playwright

from src.models import ApplicationData, EthicsDocumentInfo
from src.prompts import load_prompt
from src.services.llm_service import extract_output_from_openai

template_dir = "templates"
jinja_env = Environment(loader=FileSystemLoader(template_dir))
hum_datasets_dir = "data/hum_datasets"

logger = logging.getLogger("pdf_utils")

_JAPANESE_CHAR_PATTERN = re.compile(r"[ぁ-んァ-ン一-龥]")


def contains_japanese_chars(text: str | None) -> bool:
    if not text:
        return False
    return bool(_JAPANESE_CHAR_PATTERN.search(text))


def is_english_text(text: str | None) -> bool:
    if not text:
        return False
    return not contains_japanese_chars(text)


with open("data/icd10_jp_mapping.json", encoding="utf-8") as f:
    icd10_descriptions = json.load(f)


def find_latest_research_versions(directory_path: str) -> dict[str, str]:
    """
    Finds the files matching the pattern hum<research_number>-v<version_number>-ja.json
    and returns a dictionary mapping research numbers to the filenames with the highest version.

    Args:
        directory_path: Path to the directory containing the research files

    Returns:
        A dictionary where keys are research numbers and values are the filenames
        with the highest version for each research
    """
    # Check if directory exists
    if not os.path.isdir(directory_path):
        raise ValueError(f"Directory not found: {directory_path}")

    # Pattern to match: hum<research_number>-v<version_number>-ja.json
    pattern = re.compile(r"hum(\d+)-v(\d+)-ja\.json")

    # Dictionary to track the latest version for each research
    latest_versions: dict[str, dict] = {}

    # List all files in the directory
    for filename in os.listdir(directory_path):
        match = pattern.match(filename)
        if match:
            research_num = match.group(1)  # Extract research number
            version_num = int(match.group(2))  # Extract version number as integer

            # Initialize entry or update if this version is higher
            if research_num not in latest_versions or version_num > latest_versions[research_num]["version"]:
                latest_versions[research_num] = {"filename": filename, "version": version_num}

    # Create final dictionary with just the filenames
    result = {research_num: info["filename"] for research_num, info in latest_versions.items()}

    return result


research_mapping = find_latest_research_versions(hum_datasets_dir)


humandbs_web_base_url = os.environ.get("HUMANDBS_WEB_BASE_URL", "https://humandbs.dbcls.jp/").rstrip("/")


async def extract_text_from_pdf(file_path: str, task_id: str = None) -> str:
    task_logger = get_task_logger(task_id)

    pdf_content = ""

    try:
        # First try pymupdf4llm
        pdf_content = await asyncio.to_thread(
            pymupdf4llm.to_markdown, file_path, ignore_images=True, ignore_graphics=True
        )
        task_logger.info("Extracted %s characters using pymupdf4llm", len(pdf_content))

    except Exception:
        task_logger.exception("Error extracting text from PDF %s", file_path)

    if not pdf_content or len(pdf_content.strip()) < 100:
        # Attempt OCR as fallback
        try:
            ocr_content = await extract_text_with_ocr(file_path, task_id)
            if ocr_content:
                task_logger.info("OCR fallback extracted %s characters", len(ocr_content))
                return ocr_content
        except Exception:
            task_logger.exception("OCR fallback also failed")
    return pdf_content


async def extract_text_with_ocr(file_path: str, task_id: str = None) -> str:
    """Extract text from PDF using OCR when normal text extraction fails"""
    import io

    task_logger = get_task_logger(task_id)

    try:
        # Import OCR libraries when needed
        try:
            import pytesseract
            from PIL import Image
        except ImportError:
            task_logger.warning("OCR libraries (PIL, pytesseract) not available, skipping OCR")
            return ""

        # Open PDF with PyMuPDF
        pdf_document = fitz.open(file_path)
        extracted_text = ""

        for page_num in range(len(pdf_document)):
            page = pdf_document[page_num]

            # Convert page to image
            mat = fitz.Matrix(2.0, 2.0)  # Scale factor for better OCR quality
            pix = page.get_pixmap(matrix=mat)
            img_data = pix.tobytes("png")

            # Convert to PIL Image
            image = Image.open(io.BytesIO(img_data))

            # Use Tesseract OCR with Japanese and English
            try:
                # Try Japanese + English OCR
                page_text = pytesseract.image_to_string(image, lang="jpn+eng")
            except:  # noqa: E722
                # Fallback to English only
                page_text = pytesseract.image_to_string(image, lang="eng")

            extracted_text += f"\n--- Page {page_num + 1} ---\n"
            extracted_text += page_text

        pdf_document.close()
        return extracted_text.strip()

    except Exception:
        task_logger.exception("OCR failed for %s", file_path)
        return ""


async def extract_application_data_from_pdf(file_path: str) -> ApplicationData:
    """Extract application data from PDF file"""
    # Get application ID for logging
    task_id = None

    # Extract text using the unified function
    pdf_content = await extract_text_from_pdf(file_path, task_id)

    # Extract data using OpenAI
    prompt = load_prompt("application_form_extraction.txt", pdf_content=pdf_content)

    result = await extract_output_from_openai(prompt, ApplicationData)
    task_id = result.application_id if result.application_id else None

    # 所属機関の長に関しては、所属機関情報が申請書に書かれていないため研究代表者の情報をコピー
    result.head_of_institution_info.organization_jp = result.researcher_info.organization_jp
    result.head_of_institution_info.organization_en = result.researcher_info.organization_en
    if task_id:
        task_logger = get_task_logger(task_id)
        task_logger.info(f"Extracted application data: {result}")
    return result


def domain_matches(domain1: str, domain2: str) -> bool:
    if not domain1 or not domain2:
        return False

    # 大文字小文字を統一
    domain1 = domain1.lower().strip()
    domain2 = domain2.lower().strip()

    # 完全一致の場合
    if domain1 == domain2:
        return True

    # www. プレフィックスを除去
    if domain1.startswith("www."):
        domain1 = domain1[4:]
    if domain2.startswith("www."):
        domain2 = domain2[4:]

    # 再度完全一致をチェック
    if domain1 == domain2:
        return True

    # ドメインを逆順で分割（TLDから順に）
    parts1 = domain1.split(".")[::-1]
    parts2 = domain2.split(".")[::-1]

    # 共通のサフィックスの長さを計算
    common_suffix_length = 0
    for i in range(min(len(parts1), len(parts2))):
        if parts1[i] == parts2[i]:
            common_suffix_length += 1
        else:
            break

    # ３つ以上一致するか、２つ一致していてかつ２番目の部分がある程度（４文字以上）一致していればOKとみなす
    return common_suffix_length >= 3 or common_suffix_length >= 2 and len(parts1[1]) >= 4


def determine_application_type_from_filename(filename: str) -> str:
    if not filename:
        return "利用申請"
    return "提供申請" if "DS" in filename.upper() else "利用申請"


def extract_task_id_from_filename(filename: str) -> str:
    application_name = Path(filename).stem
    match = re.search(r"J-D[US]\d+-\d+_\d+", application_name, re.IGNORECASE)
    if match:
        return match.group(0)
    return application_name


async def extract_ethics_document_info(file_path: str) -> EthicsDocumentInfo:
    """Extract ethics document information from PDF file"""
    # Extract text using the unified function
    pdf_content = await extract_text_from_pdf(file_path)

    # Extract data using OpenAI
    prompt = load_prompt("ethics_document_extraction.txt", pdf_content=pdf_content)

    result = await extract_output_from_openai(prompt, EthicsDocumentInfo)
    return result


async def process_multiple_files(application_file_path: str, ethics_file: str = None):
    """Process application PDF and optional ethics document"""
    # Extract application data
    application_data = await extract_application_data_from_pdf(application_file_path)

    # Process ethics document if provided
    ethics_info = None
    if ethics_file:
        try:
            ethics_info = await extract_ethics_document_info(ethics_file)
        except Exception as e:
            task_id = application_data.application_id if application_data.application_id else None
            task_logger = get_task_logger(task_id)
            task_logger.warning(f"Failed to process ethics document {ethics_file}: {str(e)}")

    if ethics_info:
        return application_data, ethics_info
    return application_data, None


task_logger_dict = {}


def get_ethics_file_path(application_file_name: str) -> str | None:
    application_name = Path(application_file_name).stem
    return f"uploads/{application_name}_ethics.pdf"


def get_research_plan_path(application_file_name: str) -> str | None:
    application_name = Path(application_file_name).stem
    return f"uploads/{application_name}_research_plan.pdf"


# Playwright fetch cache settings
_PLAYWRIGHT_CACHE_TTL = int(os.environ.get("PLAYWRIGHT_CACHE_TTL_SECONDS", "3600"))
_PLAYWRIGHT_CACHE_DIR = Path(os.environ.get("PLAYWRIGHT_CACHE_DIR", ".cache/playwright"))


def _get_playwright_cache_key(url: str, convert_to_markdown: bool) -> str:
    cache_input = f"{url}:{convert_to_markdown}"
    return hashlib.sha256(cache_input.encode()).hexdigest()


def _get_playwright_cached_result(cache_key: str) -> tuple[str | None, bool]:
    """Returns (result, found) from cache. found=True means a valid cached entry exists."""
    if _PLAYWRIGHT_CACHE_TTL <= 0:
        return None, False

    cache_file = _PLAYWRIGHT_CACHE_DIR / f"{cache_key}.pkl"
    try:
        if cache_file.exists():
            with open(cache_file, "rb") as f:
                cached = pickle.load(f)
            if time.time() - cached["cached_at"] < _PLAYWRIGHT_CACHE_TTL:
                return cached["result"], True
    except Exception as e:
        logger.warning("Failed to read Playwright cache for %s: %s", cache_key, str(e))

    return None, False


def _save_playwright_cache(cache_key: str, result) -> None:
    if _PLAYWRIGHT_CACHE_TTL <= 0:
        return

    try:
        _PLAYWRIGHT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file = _PLAYWRIGHT_CACHE_DIR / f"{cache_key}.pkl"
        with open(cache_file, "wb") as f:
            pickle.dump({"result": result, "cached_at": time.time()}, f)
    except Exception as e:
        logger.warning("Failed to save Playwright cache for %s: %s", cache_key, str(e))


async def fetch_with_playwright(url: str, convert_to_markdown: bool, task_id: str = None) -> str | None:
    """Fetch content from a URL using Playwright, supporting both HTML and PDF"""
    task_logger = get_task_logger(task_id)

    cache_key = _get_playwright_cache_key(url, convert_to_markdown)
    cached_result, found = _get_playwright_cached_result(cache_key)
    if found:
        task_logger.info("Returning cached result for URL: %s", url)
        return cached_result

    result = await _fetch_with_playwright_impl(url, convert_to_markdown, task_logger, task_id)
    _save_playwright_cache(cache_key, result)
    return result


async def _fetch_with_playwright_impl(
    url: str, convert_to_markdown: bool, task_logger: logging.Logger, task_id: str = None
) -> str | None:
    # Check if URL is a PDF
    if url.lower().endswith(".pdf") or "pdf" in url.lower():
        try:
            task_logger.info(f"Processing PDF from URL: {url}")

            # Handle remote PDF URLs with requests
            try:
                import tempfile

                import requests

                task_logger.info("Downloading PDF with requests")

                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                    "Accept": "application/pdf,application/octet-stream,*/*",
                    "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive",
                    "Upgrade-Insecure-Requests": "1",
                }

                # Create custom SSL context to handle SSL handshake issues
                try:
                    ssl_context = ssl.create_default_context()
                    ssl_context.set_ciphers("DEFAULT:!aNULL:!eNULL:!MD5:!3DES:!DES:!RC4:!IDEA:!SEED:!aDSS:!SRP:!PSK")

                    session = requests.session()
                    adapter = requests.adapters.HTTPAdapter()
                    adapter.init_poolmanager(1, 1, ssl_context=ssl_context)
                    session.adapters.pop("https://", None)
                    session.mount("https://", adapter)

                    task_logger.info("Using custom SSL context for HTTPS connection")
                    response = session.get(url, headers=headers, timeout=20, stream=True)

                except Exception as ssl_error:
                    task_logger.warning(f"Custom SSL context failed: {ssl_error}, trying default requests")
                    # Fallback to default requests if custom SSL fails
                    response = requests.get(url, headers=headers, timeout=20, stream=True)

                response.raise_for_status()

                if len(response.content) == 0:
                    task_logger.error("Received empty PDF content")
                    return None

                task_logger.info(f"Successfully downloaded PDF ({len(response.content)} bytes)")

                # Save temporarily to process with pymupdf4llm
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temp_file:
                    temp_file.write(response.content)
                    temp_path = temp_file.name

                # Skip if too large to process
                if os.path.getsize(temp_path) > 2 * 1024 * 1024:  # 2 MB
                    task_logger.warning("PDF file is too large to process")
                    os.unlink(temp_path)
                    return None

                try:
                    # Extract text from PDF with 30 second timeout
                    markdown_content = await asyncio.wait_for(extract_text_from_pdf(temp_path, task_id), timeout=30.0)

                    task_logger.info("Successfully extracted content from PDF (%s chars)", len(markdown_content))
                    return markdown_content
                except asyncio.TimeoutError:
                    task_logger.error("PDF extraction timed out after 30 seconds")
                    return None
                finally:
                    # Clean up temporary file
                    os.unlink(temp_path)

            except requests.exceptions.RequestException:
                task_logger.exception("Error downloading PDF with requests")
                return None
            except Exception:
                task_logger.exception("Error processing PDF")
                return None

        except Exception:
            task_logger.exception("An error occurred while processing PDF")
            return None

    # Handle regular HTML pages
    async with async_playwright() as p:
        # Define user agent string
        user_agent = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )

        # Launch browser with anti-detection settings
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-features=VizDisplayCompositor",
                f"--user-agent={user_agent}",
            ],
        )
        try:
            context = await browser.new_context()
            page = await context.new_page()
            task_logger.info(f"Navigating to URL: {url}")

            # Navigate to the page with timeout
            try:
                await page.goto(url, timeout=15000, wait_until="domcontentloaded")
            except asyncio.TimeoutError:
                task_logger.warning(f"Timeout while navigating to {url}")
                return None
            except Exception:
                task_logger.exception("Error navigating to page")
                return None

            task_logger.info(f"Successfully navigated to {url}")
            if convert_to_markdown:
                html = await page.content()
                text = Html2TextTransformer().transform_documents([Document(page_content=html)])[0].page_content
            else:
                # Get only the visible text content directly
                text = await page.inner_text("body")

            task_logger.info("Successfully fetched page text content with Playwright")
            return text
        except Exception:
            task_logger.exception("An error occurred while using Playwright")
            return None
        finally:
            await browser.close()


def get_search_response(query, num_results=1, preferred_domain=None):
    """
    Execute search using Google Custom Search API with domain preference

    Args:
        query: List of keywords or single keyword string, allowing "AND" or "OR" operators
        num_results: Number of results to return
        preferred_domain: Preferred domain for prioritizing results (e.g., "example.com")

    Returns:
        List of search results sorted with preferred domain first, then by date, or None if error
    """
    if not query:
        return []

    from datetime import datetime
    from urllib.parse import urlparse

    service = build("customsearch", "v1", developerKey=os.environ.get("GOOGLE_CLOUD_API_KEY"))

    def search_with_date_filter(query_str, date_filter=""):
        """Helper function to perform search with optional date filter"""
        search_query = query_str + " " + date_filter if date_filter else query_str
        try:
            response = (
                service.cse()
                .list(
                    q=search_query,
                    cx=os.environ.get("GOOGLE_CSE_ID"),
                    num=min(num_results * 2, 10),  # Get more results to have options for filtering
                    start=1,
                )
                .execute()
            )
            return response.get("items", [])
        except Exception:  # noqa: E722
            logging.exception("Error in search with query: %s", search_query)
            return []

    def extract_domain(url):
        """Extract domain from URL"""
        try:
            parsed = urlparse(url)
            domain = parsed.netloc.lower()
            if domain.startswith("www."):
                domain = domain[4:]
            return domain
        except Exception:  # noqa: E722
            return ""

    def is_preferred_domain(url, preferred):
        """Check if URL belongs to preferred domain"""
        if not preferred:
            return False
        return domain_matches(extract_domain(url), preferred)

    def sort_results(results, preferred_domain):
        """Sort results by domain preference"""

        def sort_key(item):
            url = item.get("link", "")
            is_preferred = is_preferred_domain(url, preferred_domain)
            return not is_preferred

        return sorted(results, key=sort_key)

    current_year = datetime.now().year

    recent_query = query + f" after:{current_year - 1}"
    results = search_with_date_filter(recent_query)

    # Count preferred domain results
    preferred_count = 0
    if preferred_domain and results:
        preferred_count = sum(1 for item in results if is_preferred_domain(item.get("link", ""), preferred_domain))

    # If not enough preferred domain results, search without date filter
    if preferred_domain and preferred_count < num_results and len(results) < num_results:
        logging.info(
            "Found only %d results from preferred domain %s, searching without date filter",
            preferred_count,
            preferred_domain,
        )
        all_time_results = search_with_date_filter(query)

        # Combine and deduplicate results
        seen_urls = set()
        combined_results = []

        for item in results + all_time_results:
            url = item.get("link", "")
            if url not in seen_urls:
                seen_urls.add(url)
                combined_results.append(item)

        results = combined_results

    # Sort results with domain preference
    if results:
        results = sort_results(results, preferred_domain)
        # Limit to requested number of results
        results = results[:num_results]

    return results


def get_task_logger(task_id: str | None) -> logging.Logger:
    if task_id in task_logger_dict:
        return task_logger_dict[task_id]

    task_logger = logging.getLogger("app.task.default") if not task_id else logging.getLogger(f"app.task.{task_id}")

    # Get log level from environment variable, default to INFO
    log_level_str = os.environ.get("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_str, logging.INFO)

    task_logger.setLevel(log_level)

    # Create file handler
    file_handler = logging.FileHandler(f"logs/{task_id}.log")
    file_handler.setLevel(log_level)

    # Create formatter
    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
    file_handler.setFormatter(formatter)

    # Add the handler to logger
    task_logger.addHandler(file_handler)
    task_logger_dict[task_id] = task_logger
    return task_logger


def normalize_icd10_code(icd10_code: str) -> str:
    """
    ICD10コードを正規化する。表記揺れに対応するため、以下の処理を行う:
    - 大文字に統一
    - 空白を除去
    - ピリオドを除去してから、必要に応じて再度追加
    - 0埋めを考慮
    """
    if not icd10_code:
        return None

    # 空白を除去し、大文字に変換
    code = icd10_code.strip().upper().replace(" ", "")

    # ピリオドを除去
    code = code.replace(".", "")

    # A00、A000、A00.0などの形式に対応
    # 最初の文字がアルファベット、残りが数字の形式を想定
    match = re.match(r"^([A-Z])(\d+)(\.\d+)?$", code)
    if not match:
        match = re.match(r"^([A-Z])(\d+)$", code)

    if match:
        letter = match.group(1)
        numbers = match.group(2)

        # 数字部分を処理
        if len(numbers) <= 2:
            # A0 -> A00, A1 -> A01のように2桁に0埋め
            numbers = numbers.zfill(2)
        elif len(numbers) == 3:
            # A000 -> A00.0のように変換
            numbers = numbers[:2] + "." + numbers[2]
        elif len(numbers) > 3:
            # A0000 -> A00.00のように変換
            numbers = numbers[:2] + "." + numbers[2:]

        return f"{letter}{numbers}"

    # マッチしない場合は元のコードを返す
    return code


def get_icd10_description(icd10_code: str) -> str:
    normalized_code = normalize_icd10_code(icd10_code)

    # そのまま検索
    return icd10_descriptions.get(normalized_code, None)


def icd10_display_text(icd10_code: str) -> str:
    description = get_icd10_description(icd10_code)
    if description:
        return f"{icd10_code}({description})"
    return icd10_code


def icd10_canonicalized_text(icd10_code: str) -> str:
    if re.match(r"^[A-Z]\d{3}$", icd10_code):
        icd10_code = icd10_code[:3] + "." + icd10_code[3:]
    return icd10_code


def icd10_similarity_str(similarity: tuple[str, str] | None) -> str:
    if similarity:
        icd10_code1 = similarity[0]
        icd10_code2 = similarity[1]
        if icd10_code1 == icd10_code2:
            return f"◯ ({icd10_code1})"
        return f"◯ ({icd10_code1} vs {icd10_code2})"
    return "✗"


def quote_for_textfragment(text: str) -> str:
    """Quote text for use in URL text fragment"""
    if not text:
        return ""
    quoted = quote(text, safe="")
    quoted = quoted.replace("-", "%2D")  # Preserve hyphens
    return quoted


def add_text_fragment_to_url(url: str, *texts: str) -> str:
    """URLにテキストフラグメント（#:~:text=...）を追加する"""
    fragment_params = "&".join([f"text={quote_for_textfragment(text)}" for text in texts])
    return f"{url}#:~:{fragment_params}"


jinja_env.globals.update(icd10_similarity_str=icd10_similarity_str)


def _url_domain(url: str) -> str:
    m = re.search(r"^https?://([^/]+)", url)
    return m.group(1) if m else url


jinja_env.filters["url_domain"] = _url_domain
