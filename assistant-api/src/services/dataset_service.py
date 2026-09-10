import json
import logging
import os
import re

import aiohttp
from bs4 import BeautifulSoup

from src.models import (
    DatasetAnalysisResult,
    DatasetAPIRetrievalResult,
    DataSetSummary,
    ResearchInfo,
    Similarity,
)
from src.prompts import load_prompt
from src.services.google_genai_service import extract_structured_output
from src.utils import humandbs_web_base_url, icd10_canonicalized_text

logger = logging.getLogger("dataset_service")

_MISSING = object()
_JGAS_PATTERN = re.compile(r"\bJGAS\d+\b")


def strip_html_tags(text: str) -> str:
    """Remove HTML tags from text and return clean text"""
    if not text:
        return text
    soup = BeautifulSoup(text, "html.parser")
    return soup.get_text(separator=" ", strip=True)


def _localized_text(value: object) -> str | None:
    if isinstance(value, str):
        return strip_html_tags(value)
    if not isinstance(value, dict):
        return None

    for language in ("ja", "en"):
        text = value.get(language)
        if isinstance(text, str) and text:
            return strip_html_tags(text)
    return None


def _decode_terms(terms: object) -> list[str] | None | object:
    if terms is None:
        return None
    if not isinstance(terms, list):
        return _MISSING

    decoded: list[str] = []
    for term in terms:
        if not isinstance(term, dict):
            continue
        label = _localized_text(term.get("label"))
        code = term.get("code")
        text = label or (code if isinstance(code, str) else None)
        if text and text not in decoded:
            decoded.append(text)
    return decoded


def _decode_numbers(numbers: object) -> list[dict[str, object]] | None | object:
    if numbers is None:
        return None
    if not isinstance(numbers, list):
        return _MISSING

    decoded: list[dict[str, object]] = []
    for number in numbers:
        if not isinstance(number, dict) or not isinstance(number.get("value"), (int, float)):
            continue
        item: dict[str, object] = {
            "value": number["value"],
            "unit": number.get("unit"),
        }
        for field in ("label", "note"):
            field_value = number.get(field)
            if isinstance(field_value, str) and field_value:
                item[field] = strip_html_tags(field_value)
        decoded.append(item)
    return decoded


def _decode_diseases(diseases: object) -> list[dict[str, object]] | None | object:
    if diseases is None:
        return None
    if not isinstance(diseases, list):
        return _MISSING

    decoded: list[dict[str, object]] = []
    for disease in diseases:
        if not isinstance(disease, dict):
            continue

        decoded_terms: list[dict[str, str]] = []
        terms = disease.get("terms")
        if isinstance(terms, list):
            for term in terms:
                if not isinstance(term, dict):
                    continue
                code = term.get("code")
                label = _localized_text(term.get("label"))
                decoded_term = {}
                if isinstance(code, str) and code:
                    decoded_term["code"] = code
                if label:
                    decoded_term["label"] = label
                if decoded_term:
                    decoded_terms.append(decoded_term)

        decoded.append({
            "name": _localized_text(disease.get("name")),
            "terms": decoded_terms,
        })
    return decoded


def _decode_value(value: dict[str, object]) -> object:
    value_type = value.get("type")
    if value_type == "text":
        return _localized_text(value.get("text"))
    if value_type in {"single", "accession"}:
        scalar = value.get("value")
        return strip_html_tags(scalar) if isinstance(scalar, str) else scalar
    if value_type == "vocabulary":
        return _decode_terms(value.get("terms"))
    if value_type == "number":
        return _decode_numbers(value.get("numbers"))
    if value_type == "disease":
        return _decode_diseases(value.get("diseases"))
    return _MISSING


def _is_useful(value: object) -> bool:
    return value is not None and value != "" and value != [] and value != {}


def _merge_decoded_value(existing: object, incoming: object) -> object:
    if not _is_useful(existing):
        return incoming
    if not _is_useful(incoming) or existing == incoming:
        return existing

    existing_values = existing if isinstance(existing, list) else [existing]
    incoming_values = incoming if isinstance(incoming, list) else [incoming]
    merged = list(existing_values)
    for value in incoming_values:
        if value not in merged:
            merged.append(value)
    return merged


def _add_values(
    info_dict: dict[str, object],
    values: object,
    policy_value: object = _MISSING,
) -> object:
    if not isinstance(values, list):
        return policy_value

    for value in values:
        if not isinstance(value, dict):
            continue

        key = value.get("key")
        label = _localized_text(value.get("label"))
        display_key = label or (key if isinstance(key, str) else None)
        if not display_key:
            continue

        decoded = _decode_value(value)
        if decoded is _MISSING:
            continue

        if display_key in info_dict:
            info_dict[display_key] = _merge_decoded_value(info_dict[display_key], decoded)
        else:
            info_dict[display_key] = decoded

        if key == "access-criteria":
            policy_value = (
                decoded
                if policy_value is _MISSING
                else _merge_decoded_value(policy_value, decoded)
            )

    return policy_value


def _policy_text(value: object) -> str:
    values = value if isinstance(value, list) else [value]
    return " / ".join(item for item in values if isinstance(item, str) and item.strip())


async def get_jga_study_ids_from_ddbj(dataset_id: str) -> tuple[list[str], list[str]]:
    """Fetch JGA study IDs and humIDs from DDBJ search API"""
    ddbj_api_base_url = os.getenv("DDBJ_SEARCH_API_BASE_URL", "https://ddbj.nig.ac.jp/search/api/entries/jga-dataset/")
    api_url = f"{ddbj_api_base_url.rstrip('/')}/{dataset_id}"

    study_id_list: list[str] = []
    hum_id_list: list[str] = []

    try:
        async with aiohttp.ClientSession() as session, session.get(api_url) as response:
            if response.status != 200:
                logger.warning(f"Failed to fetch from DDBJ API: {api_url}, status: {response.status}")
                return study_id_list, hum_id_list

            api_data = await response.json()
    except Exception:
        logger.exception(f"Error fetching from DDBJ API: {api_url}")
        return study_id_list, hum_id_list
    db_xref_list = api_data.get("dbXrefs", [])

    for db_xref in db_xref_list:
        if isinstance(db_xref, dict):
            entry_type = db_xref.get("type")
            identifier = db_xref.get("identifier")
            if entry_type == "jga-study" and identifier:
                study_id_list.append(identifier)
            elif entry_type == "humandbs" and identifier:
                hum_id_list.append(identifier)

    return list(dict.fromkeys(study_id_list)), list(dict.fromkeys(hum_id_list))


async def get_dataset_info(dataset_id: str) -> DatasetAPIRetrievalResult | None:
    """Get dataset information from HumandBS API"""
    # Fetch data from API
    humandbs_base_url = os.getenv("HUMANDBS_API_ORIGIN")
    if not humandbs_base_url:
        logger.error("HUMANDBS_API_ORIGIN is not set")
        return None

    api_url = f"{humandbs_base_url.rstrip('/')}/api/dataset/{dataset_id}"

    try:
        async with aiohttp.ClientSession() as session, session.get(api_url) as response:
            if response.status != 200:
                logger.error(f"Failed to fetch dataset info from API: {api_url}, status: {response.status}")
                api_data = {}
            else:
                api_data = await response.json()
    except Exception:
        logger.exception(f"Error fetching dataset info from API: {api_url}")
        api_data = {}
    if not isinstance(api_data, dict) or not api_data:
        logger.warning(f"No data found in HumanDBs response for dataset ID {dataset_id}")
        return None

    hum_id = str(api_data.get("research") or "")
    if not hum_id:
        logger.warning(f"research not found in HumanDBs response for dataset ID {dataset_id}")

    info_dict: dict[str, object] = {}
    study_id_list: list[str] = []
    policy_value = _add_values(info_dict, api_data.get("values"))

    experiments = api_data.get("experiments")
    if isinstance(experiments, list):
        for experiment in experiments:
            if not isinstance(experiment, dict):
                continue
            label = experiment.get("label")
            if isinstance(label, str):
                for study_id in _JGAS_PATTERN.findall(label):
                    if study_id not in study_id_list:
                        study_id_list.append(study_id)
            policy_value = _add_values(info_dict, experiment.get("values"), policy_value)

    policy = _policy_text(policy_value)
    if policy:
        info_dict["Policies"] = {"ja": {"text": policy}}

    study_id_list_from_ddbj, hum_id_list_from_ddbj = await get_jga_study_ids_from_ddbj(dataset_id)

    return DatasetAPIRetrievalResult(
        info_dict=info_dict,
        hum_id=hum_id,
        study_id_list=study_id_list,
        study_id_list_from_ddbj=study_id_list_from_ddbj,
        hum_id_list_from_ddbj=hum_id_list_from_ddbj,
    )


async def analyze_dataset(
    dataset_id: str,
    purpose_icd10_code_list: list[str],
    paper_icd10_code_list: list[str],
    paper_info_list: list[ResearchInfo],
    analysis_method: str,
    task_id: str = None,
) -> DatasetAnalysisResult:
    dataset_info = await get_dataset_info(dataset_id)

    if not dataset_info:
        logger.warning(f"Dataset information not found for dataset ID {dataset_id}")
        return DatasetAnalysisResult(
            id=dataset_id,
            found_in_database=False,
            icd10_code_list=[],
            purpose_similarity_icd10=None,
            paper_similarity="✗",
            paper_similarity_reason="Dataset information not found",
            paper_similarity_icd10=None,
            analysis_method_list=[],
            analysis_method_similarity="✗",
            analysis_method_similarity_reason="Dataset information not found",
            url="",
            dataset_api_retrieval_result=None,
        )

    """Summarize dataset information from its URL"""
    # Summarize dataset
    prompt = load_prompt(
        "dataset_summary.txt",
        dataset_id=dataset_id,
        dataset_info_json=json.dumps(dataset_info.info_dict, ensure_ascii=False, indent=2),
    )

    system_message = load_prompt("dataset_summary_system_message.txt").strip()
    summary = await extract_structured_output(
        prompt,
        DataSetSummary,
        system_message=system_message,
        task_id=task_id,
    )

    prompt = load_prompt(
        "analysis_method_similarity.txt",
        analysis_method=analysis_method,
        dataset_analysis_method_list=summary.analysis_method_list,
    )

    analysis_method_similarity = await extract_structured_output(prompt, Similarity, task_id=task_id)

    paper_analysis_method_list = [method for paper in paper_info_list for method in paper.analysis_method_list]

    prompt = load_prompt(
        "paper_method_similarity.txt",
        paper_analysis_method_list=paper_analysis_method_list,
        dataset_analysis_method_list=summary.analysis_method_list,
    )
    paper_similarity = await extract_structured_output(prompt, Similarity, task_id=task_id)

    purpose_similarity_icd10 = check_similarity_of_icd10_code_list(purpose_icd10_code_list, summary.icd10_code_list)
    paper_similarity_icd10 = check_similarity_of_icd10_code_list(paper_icd10_code_list, summary.icd10_code_list)

    url = humandbs_web_base_url + f"/{dataset_info.hum_id}" if dataset_info.hum_id else ""

    return DatasetAnalysisResult(
        id=summary.id,
        found_in_database=True,
        icd10_code_list=[icd10_canonicalized_text(code) for code in summary.icd10_code_list],
        purpose_similarity_icd10=purpose_similarity_icd10,
        paper_similarity="◯" if paper_similarity.similarity else "✗",
        paper_similarity_reason=paper_similarity.reason,
        paper_similarity_icd10=paper_similarity_icd10,
        analysis_method_list=summary.analysis_method_list,
        analysis_method_similarity="◯" if analysis_method_similarity.similarity else "✗",
        analysis_method_similarity_reason=analysis_method_similarity.reason,
        url=url,
        dataset_api_retrieval_result=dataset_info,
    )


def check_similarity_of_icd10_code_list(a: list[str], b: list[str]) -> bool:
    """Check if two lists of ICD-10 codes are similar"""
    a = [code.strip() for code in a if code.strip()]
    b = [code.strip() for code in b if code.strip()]
    if not a or not b:
        return None
    for code_a in a:
        for code_b in b:
            if check_similarity_of_icd10(code_a, code_b):
                return (code_a, code_b)
    return None


def check_similarity_of_icd10(a: str, b: str) -> bool:
    """Check if two ICD-10 codes are similar"""
    if not a or not b:
        return False
    if not re.match(r"^[A-Z]\d{2}(\.\d+)?$", a) or not re.match(r"^[A-Z]\d{2}(\.\d+)?$", b):
        # ICD-10コードの形式が正しくない場合は類似と判定しない
        return False
    if b.startswith(a) or a.startswith(b):
        # どちらかがどちらかを含む場合は類似と判定
        return True
    # 末尾の1文字を除いて同じ場合は類似と判定
    return b[:-1] == a[:-1]


if __name__ == "__main__":
    import asyncio
    import sys

    async def main():
        dataset_id = sys.argv[1] if len(sys.argv) > 1 else "JGAD000001"
        result = await get_dataset_info(dataset_id)
        import json

        print(json.dumps(result.model_dump() if result else None, ensure_ascii=False, indent=2))

    asyncio.run(main())
