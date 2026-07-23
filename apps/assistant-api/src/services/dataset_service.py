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
from src.services.llm_service import extract_output_from_openai
from src.utils import humandbs_web_base_url, icd10_canonicalized_text

logger = logging.getLogger("dataset_service")


def strip_html_tags(text: str) -> str:
    """Remove HTML tags from text and return clean text"""
    if not text:
        return text
    soup = BeautifulSoup(text, "html.parser")
    return soup.get_text(separator=" ", strip=True)


async def get_jga_study_ids_from_ddbj(dataset_id: str) -> tuple[list[str], list[str]]:
    """Fetch JGA study IDs and humIDs from DDBJ search API"""
    ddbj_api_base_url = os.getenv("DDBJ_SEARCH_API_BASE_URL", "https://ddbj.nig.ac.jp/search/api/entries/jga-dataset/")
    api_url = f"{ddbj_api_base_url}/{dataset_id}"

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
    humandbs_base_url = os.getenv("HUMANDBS_API_BASE_URL")
    api_url = f"{humandbs_base_url}/api/dataset/{dataset_id}?lang=ja"

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
    api_data = api_data.get("data", api_data)
    hum_id = str(api_data.get("humId") or "")
    if not hum_id:
        logger.warning(f"humid not found in HumandBS response for dataset ID {dataset_id}")
    if not api_data:
        return None

    # Extract info_dict from experiments.data with HTML tags stripped
    info_dict = {}
    study_id_list: list[str] = []
    experiments = api_data.get("experiments", [])

    if experiments:
        header_text_list: list[str] = []

        for experiment in experiments:
            header = experiment.get("header", {})

            if isinstance(header, str):
                header_text_list.append(header)
                continue

            if not isinstance(header, dict):
                continue

            ja_text = header.get("ja")
            en_text = header.get("en")
            header_text = header.get("text", {})
            if isinstance(header_text, str):
                header_text_list.append(header_text)
                continue

            if isinstance(ja_text, str):
                header_text_list.append(ja_text)
            elif isinstance(ja_text, dict):
                header_text_list.append(ja_text.get("text", ""))
            if isinstance(en_text, str):
                header_text_list.append(en_text)
            elif isinstance(en_text, dict):
                header_text_list.append(en_text.get("text", ""))

        jgas_pattern = re.compile(r"JGAS\d+")
        all_header_text = "\n".join(header_text_list)
        study_id_list = list(dict.fromkeys(jgas_pattern.findall(all_header_text)))

        # Take the first experiment's data section
        experiment_data = experiments[0].get("data", {})

        # Strip HTML tags from all fields
        for key, value in experiment_data.items():
            if isinstance(value, str):
                info_dict[key] = strip_html_tags(value)
            else:
                info_dict[key] = value

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
    # Summarize dataset using OpenAI
    prompt = load_prompt(
        "dataset_summary.txt",
        dataset_id=dataset_id,
        dataset_info_json=json.dumps(dataset_info.info_dict, ensure_ascii=False, indent=2),
    )

    system_message = load_prompt("dataset_summary_system_message.txt").strip()
    summary = await extract_output_from_openai(
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

    analysis_method_similarity = await extract_output_from_openai(prompt, Similarity, task_id=task_id)

    paper_analysis_method_list = [method for paper in paper_info_list for method in paper.analysis_method_list]

    prompt = load_prompt(
        "paper_method_similarity.txt",
        paper_analysis_method_list=paper_analysis_method_list,
        dataset_analysis_method_list=summary.analysis_method_list,
    )
    paper_similarity = await extract_output_from_openai(prompt, Similarity, task_id=task_id)

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
