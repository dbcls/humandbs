import asyncio
import hashlib
import json
import logging
import os
import pickle
import re
import sys
from pathlib import Path

from google import genai
from google.api_core.client_options import ClientOptions
from google.cloud import documentai
from google.genai import types
from google.oauth2 import service_account
from pydantic import BaseModel, ValidationError

from src.prompts import load_prompt

default_logger = logging.getLogger("google_genai_service")

# キャッシュ設定
CACHE_ENABLED = os.environ.get("GOOGLE_GENAI_CACHE_ENABLED", "false").lower() == "true"
CACHE_DIR = Path(os.environ.get("GOOGLE_GENAI_CACHE_DIR", "work/.cache/genai"))


def _build_genai_client() -> genai.Client:
    scopes = [
        "https://www.googleapis.com/auth/generative-language",
        "https://www.googleapis.com/auth/cloud-platform",
    ]
    credentials = service_account.Credentials.from_service_account_file(
        os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"), scopes=scopes
    )
    return genai.Client(
        vertexai=True,
        project=os.environ.get("GOOGLE_CLOUD_PROJECT_ID"),
        location=os.environ.get("GOOGLE_GENAI_LOCATION", "asia-northeast1"),
        credentials=credentials,
    )


def _model_name() -> str:
    return os.environ.get("GOOGLE_GENAI_MODEL", "gemini-2.5-flash")


def _build_contents(prompt: str) -> list[types.Content]:
    return [types.Content(role="user", parts=[types.Part(text=prompt)])]


def _build_generate_content_config(
    system_message: str | None = None,
    tools: list[types.Tool] | None = None,
    response_schema: type[BaseModel] | None = None,
) -> types.GenerateContentConfig:
    return types.GenerateContentConfig(
        system_instruction=system_message,
        temperature=float(os.environ.get("LLM_TEMPERATURE", 0.2)),
        seed=0,
        max_output_tokens=65535,
        safety_settings=[
            types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF"),
        ],
        tools=tools,
        thinking_config=types.ThinkingConfig(thinking_budget=-1),
        response_mime_type="application/json" if response_schema else None,
        response_schema=response_schema,
    )


def _generate_cache_key(model: str, contents: list, config: types.GenerateContentConfig) -> str:
    """model, contents, configからキャッシュキーを生成する

    Args:
        model: モデル名
        contents: コンテンツリスト
        config: 生成設定

    Returns:
        str: キャッシュキー（SHA256ハッシュ）
    """
    # キャッシュキーの素になるデータを作成
    # contentsはPydanticモデルなので、dictに変換
    contents_data = json.dumps(
        [{"role": c.role, "parts": [{"text": p.text} for p in c.parts]} for c in contents], sort_keys=True
    )

    config_dict = config.model_dump(mode="python", exclude_none=True)
    response_schema = config_dict.get("response_schema")
    if isinstance(response_schema, type) and issubclass(response_schema, BaseModel):
        config_dict["response_schema"] = response_schema.model_json_schema()
    config_data = json.dumps(config_dict, sort_keys=True, default=str)

    cache_input = f"{model}:{contents_data}:{config_data}"
    return hashlib.sha256(cache_input.encode()).hexdigest()


def _get_cached_response(cache_key: str):
    """キャッシュからレスポンスを取得する

    Args:
        cache_key: キャッシュキー

    Returns:
        キャッシュされたレスポンス、またはNone
    """
    if not CACHE_ENABLED:
        return None

    cache_file = CACHE_DIR / f"{cache_key}.pkl"

    try:
        if cache_file.exists():
            with open(cache_file, "rb") as f:
                cached_response = pickle.load(f)
                default_logger.debug(f"Cache hit: {cache_key}")
                return cached_response
    except Exception as e:
        default_logger.warning(f"Failed to read cache for {cache_key}: {str(e)}")

    return None


def _save_cached_response(cache_key: str, response) -> None:
    """レスポンスをキャッシュに保存する

    Args:
        cache_key: キャッシュキー
        response: 保存するレスポンス
    """
    if not CACHE_ENABLED:
        return

    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file = CACHE_DIR / f"{cache_key}.pkl"

        with open(cache_file, "wb") as f:
            pickle.dump(response, f)
            default_logger.debug(f"Cached response: {cache_key}")
    except Exception as e:
        default_logger.warning(f"Failed to save cache for {cache_key}: {str(e)}")


async def extract_text_with_document_ai_ocr(file_path: str) -> str:
    # 設定
    location = os.environ.get("DOCUMENT_AI_LOCATION", "us")
    processor_id = os.environ.get("DOCUMENT_AI_PROCESSOR_ID")
    mime = "application/pdf"

    scopes = [
        "https://www.googleapis.com/auth/cloud-platform",
    ]
    credentials = service_account.Credentials.from_service_account_file(
        os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"), scopes=scopes
    )

    pid = os.environ.get("GOOGLE_CLOUD_PROJECT_ID")

    # クライアント作成
    opts = ClientOptions(api_endpoint=f"{location}-documentai.googleapis.com", quota_project_id=pid)
    client = documentai.DocumentProcessorServiceClient(client_options=opts, credentials=credentials)

    # OCR リクエスト
    with open(file_path, "rb") as image:
        buff = image.read()

    raw_document = documentai.RawDocument(content=buff, mime_type=mime)
    name = f"projects/{pid}/locations/{location}/processors/{processor_id}"
    request = documentai.ProcessRequest(name=name, raw_document=raw_document)
    response = client.process_document(request)

    # OCR レスポンス
    text = response.document.text
    return text


async def request_google_genai_api_with_grounding(
    prompt: str,
    system_message: str = None,
    logger: logging.Logger = None,
    grounding_type: str = "web_search",  # "web_search" or "map"
    use_cache: bool = True,
) -> tuple[str, list[tuple | str]]:
    """Google Generative AI APIにプロンプトを送信し、レスポンスを取得する関数

    Args:
        prompt: ユーザープロンプト
        system_message: システムメッセージ（オプション）
        logger: ロガー
    Returns:
        str: レスポンステキスト
    """
    max_length = int(1e5)
    if not logger:
        logger = default_logger

    if len(prompt) > max_length:
        prompt = prompt[:max_length] + "..."
        logger.warning(f"Prompt truncated to {max_length} characters.")

    model = _model_name()
    contents = _build_contents(prompt)

    logger.debug(f"System Message: {system_message}" if system_message else "No system message")
    logger.debug(f"User Prompt: {prompt}")

    if grounding_type == "map":
        tools = [
            types.Tool(google_maps=types.GoogleMaps()),
        ]
    else:
        tools = [
            types.Tool(google_search=types.GoogleSearch()),
        ]

    client = _build_genai_client()
    generate_content_config = _build_generate_content_config(system_message=system_message, tools=tools)

    # キャッシュキーを生成
    cache_key = _generate_cache_key(model, contents, generate_content_config)

    # キャッシュから取得を試みる
    response = _get_cached_response(cache_key) if use_cache else None

    # キャッシュにない場合は、APIを呼び出す
    if response is None:
        response = await client.aio.models.generate_content(
            model=model,
            contents=contents,
            config=generate_content_config,
        )
        # レスポンスをキャッシュに保存
        if use_cache:
            _save_cached_response(cache_key, response)

    response_text = response.text if response and response.text else ""
    url_list = []

    # レスポンステキストを表示
    if response.candidates and response.candidates[0].content:
        logger.debug(f"Response Text: {response.text}")
        candidate = response.candidates[0]
        if (
            hasattr(candidate, "citation_metadata")
            and candidate.citation_metadata
            and candidate.citation_metadata.citations
        ):
            for citation in candidate.citation_metadata.citations:
                if hasattr(citation, "uri") and citation.uri:
                    url_list.append(citation.uri)

        # グラウンディング情報から収集
        if (
            hasattr(candidate, "grounding_metadata")
            and candidate.grounding_metadata
            and (
                hasattr(candidate.grounding_metadata, "grounding_chunks")
                and candidate.grounding_metadata.grounding_chunks
            )
        ):
            for chunk_info in candidate.grounding_metadata.grounding_chunks:
                if hasattr(chunk_info, "web") and chunk_info.web and hasattr(chunk_info.web, "uri"):
                    url_list.append(chunk_info.web.uri)
                if hasattr(chunk_info, "maps") and chunk_info.maps and hasattr(chunk_info.maps, "uri"):
                    url_list.append((chunk_info.maps.uri, chunk_info.maps.title, chunk_info.maps.place_id))
        url_list = [
            await retrieve_original_url(url) if "vertexaisearch.cloud.google.com" in url else url for url in url_list
        ]

    else:
        logger.warning("No response candidates or content found.")
    return response_text, url_list


async def query_genai(
    prompt: str,
    system_message: str | None = None,
    task_id: str | None = None,
) -> str:
    """Query Google GenAI without grounding."""
    logger = logging.getLogger(f"app.task.{task_id}") if task_id else default_logger
    logger.info(f"System Message: {system_message}" if system_message else "No system message")
    logger.info(f"User Prompt: {prompt}")

    model = _model_name()
    contents = _build_contents(prompt)
    config = _build_generate_content_config(system_message=system_message)
    cache_key = _generate_cache_key(model, contents, config)
    response = _get_cached_response(cache_key)

    if response is None:
        client = _build_genai_client()
        response = await client.aio.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )
        _save_cached_response(cache_key, response)

    return response.text if response and response.text else ""


async def extract_structured_output(
    prompt: str,
    output_model: type[BaseModel],
    system_message: str | None = None,
    task_id: str | None = None,
) -> BaseModel | None:
    """Extract structured output with Google GenAI's native JSON schema support."""
    max_length = int(1e5)
    if len(prompt) > max_length:
        prompt = prompt[:max_length] + "..."
        default_logger.warning(f"Prompt truncated to {max_length} characters.")

    logger = logging.getLogger(f"app.task.{task_id}") if task_id else default_logger
    logger.debug(f"System Message: {system_message}" if system_message else "No system message")
    logger.debug(f"User Prompt: {prompt}")

    model = _model_name()
    contents = _build_contents(prompt)
    config = _build_generate_content_config(system_message=system_message, response_schema=output_model)
    cache_key = _generate_cache_key(model, contents, config)

    try:
        response = _get_cached_response(cache_key)
        if response is None:
            client = _build_genai_client()
            response = await client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            _save_cached_response(cache_key, response)

        parsed = getattr(response, "parsed", None)
        if isinstance(parsed, output_model):
            return parsed
        if parsed is not None:
            return output_model.model_validate(parsed)
        if response.text:
            return output_model.model_validate_json(response.text)
        logger.warning("No structured response content found.")
    except Exception:
        logger.exception("Error querying Google GenAI")
    return None


async def extract_output_from_genai(
    prompt: str,
    output_model: type[BaseModel],
    system_message: str = None,
    logger: logging.Logger = None,
    grounding_type: str = "web_search",  # "web_search" or "map"
) -> tuple[BaseModel, list[str]]:
    """Extract structured output from Google Generative AI

    Returns:
        BaseModel: output_model instance or None on failure
        str: URL of the reference if available
    """
    if not logger:
        logger = default_logger

    user_message = load_prompt(
        "genai_structured_output_wrapper.txt",
        prompt=prompt,
        schema=str(output_model.model_json_schema()),
    )

    max_retries = 3
    for attempt in range(max_retries):
        response, reference_urls = await request_google_genai_api_with_grounding(
            prompt=user_message,
            system_message=system_message,
            logger=logger,
            grounding_type=grounding_type,
            use_cache=(attempt == 0),
        )
        reference_urls = [url for url in reference_urls if url]

        if response:
            result = await try_to_parse_response(response, output_model)
            if result and reference_urls:
                # Both result and reference_urls are present
                return result, reference_urls
            if result:
                # Result exists but no reference_urls
                logger.warning(
                    f"Result parsed successfully, but no reference URLs found (attempt {attempt + 1}/{max_retries})"
                )
                if attempt < max_retries - 1:
                    logger.info(f"Retrying... (attempt {attempt + 2}/{max_retries})")
                    continue
                return result, reference_urls
            logger.warning(f"Failed to parse response into the expected model (attempt {attempt + 1}/{max_retries})")
            if attempt < max_retries - 1:
                logger.info(f"Retrying... (attempt {attempt + 2}/{max_retries})")
                continue
            return None, None
        logger.warning(f"No response candidates or content found (attempt {attempt + 1}/{max_retries})")
        if attempt < max_retries - 1:
            logger.info(f"Retrying... (attempt {attempt + 2}/{max_retries})")
            continue
        return None, None

    return None, None


async def suggest_icd10_code_list(prompt: str, task_id: str | None = None) -> list[str]:
    """Suggest ICD-10 codes based on the prompt."""
    from src.models import ICD10Suggestion
    from src.utils import icd10_canonicalized_text

    result = await extract_structured_output(prompt, ICD10Suggestion, task_id=task_id)
    if not result:
        return []
    return [icd10_canonicalized_text(code) for code in result.icd10_code_list]


async def translate_research_abstract_sentences(
    source_sentences: list[str],
    task_id: str | None = None,
) -> list[str]:
    """Translate sentence-split English abstract text into Japanese."""
    from src.models import ResearchAbstractSentenceTranslationList

    if not source_sentences:
        return []

    sentence_list_text = "\n".join([f"* {sentence}" for sentence in source_sentences])
    prompt = load_prompt(
        "research_abstract_translation.txt",
        source_sentences=sentence_list_text,
    )

    result = await extract_structured_output(prompt, ResearchAbstractSentenceTranslationList, task_id=task_id)
    if not result:
        return []
    return result.translated_sentences


async def check_icd10_target_relevance(
    icd10_code_list: list[str],
    provided_data_target_jp: str | None,
    provided_data_target_en: str | None,
    task_id: str | None = None,
) -> tuple[bool | None, str | None]:
    """Determine whether ICD-10 codes are relevant to the provided data target."""
    from src.models import ICD10TargetRelevance
    from src.utils import get_icd10_description

    if not icd10_code_list or (not provided_data_target_jp and not provided_data_target_en):
        return None, None

    icd10_with_descriptions = []
    for code in icd10_code_list:
        description = get_icd10_description(code)
        icd10_with_descriptions.append(f"{code}: {description}" if description else code)

    target_text_parts = []
    if provided_data_target_jp:
        target_text_parts.append(f"日本語: {provided_data_target_jp}")
    if provided_data_target_en:
        target_text_parts.append(f"英語: {provided_data_target_en}")

    prompt = load_prompt(
        "icd10_target_relevance.txt",
        icd10_text="\n".join(icd10_with_descriptions),
        target_text="\n".join(target_text_parts),
    )
    result = await extract_structured_output(prompt, ICD10TargetRelevance, task_id=task_id)
    if result:
        return result.is_relevant, result.reason
    return None, None


async def retrieve_original_url(vertexai_url: str) -> str:
    """
    Vertex AIの参照元URLとして vertexaisearch.cloud.google.com が返ってくることがある。
    実際にアクセスすると302リダイレクトされるので、その最終的なURLを取得する
    """
    import aiohttp

    try:
        async with (
            aiohttp.ClientSession() as session,
            session.get(vertexai_url, allow_redirects=False, timeout=aiohttp.ClientTimeout(total=10)) as response,
        ):
            # リダイレクトの場合、Location ヘッダーから最終URLを取得
            if response.status in [301, 302, 303, 307, 308]:
                location = response.headers.get("Location")
                if location:
                    default_logger.debug(f"Redirected from {vertexai_url} to {location}")
                    return location

            # リダイレクトがない場合は元のURLをそのまま返す
            return vertexai_url

    except Exception:
        default_logger.exception(f"Failed to retrieve original URL from {vertexai_url}")
        # エラーが発生した場合は元のURLを返す
        return vertexai_url


async def try_to_parse_response(
    response_text: str,
    output_model: type[BaseModel],
) -> BaseModel:
    json_pattern = r"(\[[\s\S]*\]|\{[\s\S]*\})"
    match = re.search(json_pattern, response_text)

    if not match:
        return None

    json_str = match.group(1)
    try:
        return output_model.model_validate_json(json_str)
    except (json.JSONDecodeError, ValidationError):
        # JSONの修正を試みる
        default_logger.warning("JSONDecodeError: Attempting to fix the JSON format.")
        json_str = re.sub(r",\s*}", "}", json_str)  # 末尾のカンマを削除
        json_str = re.sub(r"\s\\+\s", "", json_str)  # JSON中に単独でバックスラッシュが出現する場合があるので、削除
        json_str = re.sub(r"'", '"', json_str)  # シングルクォートをダブルクォートに変換
        # False, True を小文字に変換（
        json_str = re.sub(r"\bFalse\b", "false", json_str, flags=re.IGNORECASE)
        json_str = re.sub(r"\bTrue\b", "true", json_str, flags=re.IGNORECASE)
        # Noneをnullに変換
        json_str = re.sub(r"\bNone\b", "null", json_str, flags=re.IGNORECASE)

        default_logger.warning(f"Attempting to fix JSON: {json_str}")
        try:
            return output_model.model_validate_json(json_str)
        except Exception:
            default_logger.exception("Failed to decode JSON after attempting to fix it.")
            return None


async def investigate_researcher_history(
    researcher_name: str,
    institution_name: str,
    logger: logging.Logger = None,
) -> tuple[str, list[str]]:
    """研究者の研究履歴を調査する関数

    Args:
        researcher_name: 研究者の氏名
        institution_name: 所属機関名
        logger: ロガー

    Returns:
        str: 調査結果の文字列
        List[str]: 参考URLのリスト
    """
    if not logger:
        logger = default_logger

    system_message = load_prompt("researcher_history_system_message.txt")

    prompt = load_prompt(
        "researcher_history_investigation.txt",
        researcher_name=researcher_name,
        institution_name=institution_name,
    )

    try:
        return await request_google_genai_api_with_grounding(
            prompt=prompt, system_message=system_message, logger=logger
        )
    except Exception as e:
        logger.exception(f"Error investigating research history for {researcher_name}: {str(e)}")
        return None, None


async def main():
    """メイン実行関数"""

    if len(sys.argv) < 3:
        print("使用方法: python -m src.services.google_genai_service <研究者氏名> <所属機関名>")
        print("例: python -m src.services.google_genai_service '田中太郎' '東京大学'")
        sys.exit(1)

    researcher_name = sys.argv[1]
    institution_name = sys.argv[2]

    # ロガーの設定
    logging.basicConfig(level=logging.DEBUG, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    logger = logging.getLogger("research_history_investigation")

    logger.info("研究履歴調査を開始します...")
    logger.info(f"研究者氏名: {researcher_name}")
    logger.info(f"所属機関: {institution_name}")

    try:
        # 研究履歴調査を実行
        result, reference_urls = await investigate_researcher_history(
            researcher_name=researcher_name, institution_name=institution_name, logger=logger
        )

        if result:
            logger.info("研究履歴調査が完了しました。")

            # 結果を整形して出力
            print("\n" + "=" * 80)
            print("【研究者研究履歴調査結果】")
            print("=" * 80)
            print(result)
            print("=" * 80 + "\n")
            if reference_urls:
                print("【参考URL】")
                for url in reference_urls:
                    print(f"- {url}")
                print("\n" + "=" * 80 + "\n")

        else:
            logger.error("研究履歴調査に失敗しました。")
            print("研究履歴調査に失敗しました。ログを確認してください。")
            sys.exit(1)

    except Exception as e:
        logger.exception(f"研究履歴調査中にエラーが発生しました: {str(e)}")
        print(f"エラーが発生しました: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
