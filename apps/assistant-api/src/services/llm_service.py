import logging
import os

from dotenv import load_dotenv
from langchain.schema import HumanMessage, SystemMessage
from langchain_community.cache import SQLiteCache
from langchain_core.globals import set_llm_cache
from langchain_openai import AzureChatOpenAI
from pydantic import BaseModel

from src.prompts import load_prompt

# Load environment variables
load_dotenv(override=True)
os.environ["OPIK_PROJECT_NAME"] = "humandb-demo"

# Configure logger
logger = logging.getLogger("llm_service")

set_llm_cache(SQLiteCache(database_path="langchain_cache.db"))

# Initialize LLM
model_name = os.environ.get("AZURE_OPENAI_MODEL", "gpt-4")
if "gpt-5" in model_name:
    llm = AzureChatOpenAI(
        azure_deployment=model_name,
        model="gpt-5",
        reasoning_effort="minimal",
    )

else:
    llm = AzureChatOpenAI(
        azure_deployment=model_name,
        temperature=float(os.environ.get("LLM_TEMPERATURE", 0.2)),
        max_tokens=2000,
    )


async def query_openai(prompt: str, system_message: str = None, task_id: str = None) -> str:
    """Query OpenAI API"""
    # Log the prompt
    if task_id:
        task_logger = logging.getLogger(f"app.task.{task_id}")
        task_logger.info(f"System Message: {system_message}" if system_message else "No system message")
        task_logger.info(f"User Prompt: {prompt}")

    messages = []
    if system_message:
        messages.append({"role": "system", "content": system_message})
    messages.append({"role": "user", "content": prompt})

    return llm.invoke(messages).content


async def extract_output_from_openai(
    prompt: str,
    output_model: type[BaseModel],
    system_message: str = None,
    task_id: str = None,
) -> BaseModel:
    """Extract structured output from OpenAI"""
    # Log the prompt
    max_length = int(1e5)
    if len(prompt) > max_length:
        prompt = prompt[:max_length] + "..."
        logger.warning(f"Prompt truncated to {max_length} characters.")

    if task_id:
        task_logger = logging.getLogger(f"app.task.{task_id}")
        task_logger.debug(f"System Message: {system_message}" if system_message else "No system message")
        task_logger.debug(f"User Prompt: {prompt}")
    else:
        logger.debug(f"System Message: {system_message}" if system_message else "No system message")
        logger.debug(f"User Prompt: {prompt}")

    messages = []
    if system_message:
        messages.append(SystemMessage(content=system_message))
    messages.append(HumanMessage(content=prompt))

    # Query LangChain with structured output
    try:
        return llm.with_structured_output(output_model).invoke(messages)
    except Exception:
        logger.exception("Error querying OpenAI")
        return None


async def suggest_icd10_code_list(prompt: str, task_id: str = None) -> list[str]:
    """Suggest ICD-10 code based on the prompt"""
    from src.models import ICD10Suggestion
    from src.utils import icd10_canonicalized_text

    result = await extract_output_from_openai(prompt, ICD10Suggestion, task_id=task_id)
    return [icd10_canonicalized_text(code) for code in result.icd10_code_list]


async def translate_research_abstract_sentences(
    source_sentences: list[str],
    task_id: str = None,
) -> list[str]:
    """Translate sentence-split English abstract text into Japanese sentence list."""
    from src.models import ResearchAbstractSentenceTranslationList

    if not source_sentences:
        return []

    sentence_list_text = "\n".join([f"* {sentence}" for sentence in source_sentences])
    prompt = load_prompt(
        "research_abstract_translation.txt",
        source_sentences=sentence_list_text,
    )

    result = await extract_output_from_openai(prompt, ResearchAbstractSentenceTranslationList, task_id=task_id)
    if not result:
        return []
    return result.translated_sentences


async def check_icd10_target_relevance(
    icd10_code_list: list[str],
    provided_data_target_jp: str | None,
    provided_data_target_en: str | None,
    task_id: str = None,
) -> tuple[bool, str]:
    """
    ICD10コードと提供データの対象の関連性を判定する。

    Args:
        icd10_code_list: ICD-10コードのリスト
        provided_data_target_jp: 提供データの対象（日本語）
        provided_data_target_en: 提供データの対象（英語）
        task_id: タスクID（ロギング用）

    Returns:
        (is_relevant, reason): 関連性の有無と判定理由のタプル
    """
    from src.models import ICD10TargetRelevance
    from src.utils import get_icd10_description

    if not icd10_code_list or (not provided_data_target_jp and not provided_data_target_en):
        return None, None

    # ICD10コードに疾患名を付加
    icd10_with_descriptions = []
    for code in icd10_code_list:
        description = get_icd10_description(code)
        if description:
            icd10_with_descriptions.append(f"{code}: {description}")
        else:
            icd10_with_descriptions.append(code)

    icd10_text = "\n".join(icd10_with_descriptions)

    # 提供データの対象を整理
    target_text_parts = []
    if provided_data_target_jp:
        target_text_parts.append(f"日本語: {provided_data_target_jp}")
    if provided_data_target_en:
        target_text_parts.append(f"英語: {provided_data_target_en}")
    target_text = "\n".join(target_text_parts)

    prompt = load_prompt("icd10_target_relevance.txt", icd10_text=icd10_text, target_text=target_text)

    result = await extract_output_from_openai(prompt, ICD10TargetRelevance, task_id=task_id)
    if result:
        return result.is_relevant, result.reason
    return None, None
