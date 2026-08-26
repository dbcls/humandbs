import logging
import os

from src.models import DatasetAnalysisResult, ResearchAbstractTranslation, ResearchInfo
from src.utils import add_text_fragment_to_url, humandbs_web_base_url, icd10_display_text, jinja_env

logger = logging.getLogger("assessment_service")

report_template = jinja_env.get_template("report.jinja2")
handout_template = jinja_env.get_template("handout.jinja2")


def _dataset_policy_text(dataset: DatasetAnalysisResult | None) -> str:
    fallback_text = "制限事項に関する記載が見つかりませんでした"
    try:
        policy_ja = dataset.dataset_api_retrieval_result.info_dict["Policies"]["ja"]["text"]
    except (AttributeError, KeyError, TypeError):
        return fallback_text

    if isinstance(policy_ja, str) and policy_ja.strip():
        return policy_ja.strip()

    return fallback_text


def template_parameters(
    application_data: dict,
) -> dict:
    application_id = application_data.get("application_id")
    research_abstract = application_data.get("research_abstract")
    research_abstract_translation_data = application_data.get("research_abstract_translation")
    abstract_icd10_list = application_data.get("abstract_icd10_list")
    dataset_analysis_results = application_data.get("dataset_analysis_list", [])
    research_info_list = application_data.get("research_info_list", [])
    research_abstract_translation = None

    if abstract_icd10_list:
        abstract_icd10_list = [icd10_display_text(code) for code in abstract_icd10_list]

    research_info_list = [ResearchInfo(**info) for info in research_info_list]
    dataset_analysis_list = [DatasetAnalysisResult(**result) for result in dataset_analysis_results]
    if research_abstract_translation_data:
        research_abstract_translation = ResearchAbstractTranslation(**research_abstract_translation_data)

    for paper in research_info_list:
        paper.icd10_code_list = [icd10_display_text(code) for code in paper.icd10_code_list]

    for dataset in dataset_analysis_list:
        if dataset.url:
            dataset.url = add_text_fragment_to_url(dataset.url, dataset.id)
        elif dataset.dataset_api_retrieval_result and dataset.dataset_api_retrieval_result.hum_id:
            dataset.url = add_text_fragment_to_url(
                f"{humandbs_web_base_url}/{dataset.dataset_api_retrieval_result.hum_id}", dataset.id
            )
        dataset.icd10_code_list = [icd10_display_text(code) for code in dataset.icd10_code_list]

    dataset_policy_groups_map: dict[str, list[str]] = {}
    for dataset in dataset_analysis_list:
        policy_text = _dataset_policy_text(dataset)
        dataset_policy_groups_map.setdefault(policy_text, []).append(dataset.id)

    dataset_policy_groups = [
        {"dataset_ids": dataset_ids, "policy_text": policy_text}
        for policy_text, dataset_ids in dataset_policy_groups_map.items()
    ]

    # Format research title (combine Japanese and English if both exist)
    research_title_jp = application_data.get("research_title_jp", "")
    research_title_en = application_data.get("research_title_en", "")
    if research_title_jp and research_title_en:
        title = f"{research_title_jp} / {research_title_en}"
    else:
        title = research_title_jp or research_title_en or application_data.get("research_title", "")

    # Prepare data for the template
    return {
        "application_id": application_id,
        "title": title,
        "abstract": research_abstract,
        "abstract_translation": research_abstract_translation,
        "abstract_sentence_pairs": research_abstract_translation.sentence_pairs
        if research_abstract_translation
        else [],
        "abstract_icd10_list": abstract_icd10_list,
        "application_analysis_method": application_data.get("application_analysis_method", ""),
        "paper_analysis_method_list": [method for info in research_info_list for method in info.analysis_method_list],
        "paper_icd10_list": [
            icd10_display_text(code) for research_info in research_info_list for code in research_info.icd10_code_list
        ],
        "researcher_info": application_data.get("researcher_info", {}),
        "submitter_info": application_data.get("submitter_info", {}),
        "head_of_institution_info": application_data.get("head_of_institution_info", {}),
        "researcher_verification_result": application_data.get("researcher_verification_result", {}),
        "submitter_verification_result": application_data.get("submitter_verification_result", {}),
        "head_of_institution_verification_result": application_data.get("head_of_institution_verification_result", {}),
        "ethics_document_info": application_data.get("ethics_document", {}),
        "papers": research_info_list,
        "dataset_analysis_list": dataset_analysis_list,
        "dataset_info_list": application_data.get("dataset_info_list", []),
        "dataset_policy_groups": dataset_policy_groups,
        "phone_consistency_result": application_data.get("phone_consistency_result", {}),
        "email_domain_consistency_result": application_data.get("email_domain_consistency_result", {}),
        "period_of_data_use_end": application_data.get("period_of_data_use_end", ""),
        "submission_application_check_result": application_data.get("submission_application_check_result", {}),
        "humandbs_web_base_url": humandbs_web_base_url,
        "application_data": application_data,
    }


async def create_assessment_report(application_data: dict) -> str:
    """Create report to assess if the application meets the requirements"""
    global report_template
    parameters = template_parameters(application_data)
    if os.environ.get("DEPLOY_MODE") == "development":
        # Reload the template for development
        report_template = jinja_env.get_template("report.jinja2")

    # Render the template
    report = report_template.render(parameters)

    return report


async def create_handout(application_data: dict) -> str:
    """Create handout for the applicant"""
    global handout_template
    params = template_parameters(application_data)
    if os.environ.get("DEPLOY_MODE") == "development":
        # Reload the template for development
        handout_template = jinja_env.get_template("handout.jinja2")

    # Render the template
    handout = handout_template.render(params)

    return handout
