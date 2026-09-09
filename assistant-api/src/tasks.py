import asyncio
import datetime
import logging
import os
import re
import traceback
from pathlib import Path
from typing import Any
from uuid import uuid4
from weakref import WeakKeyDictionary

import yaml  # Added PyYAML for YAML serialization

from src.models import (
    ApplicationData,
    ApplicationVerificationData,
    EmailDomainConsistencyResult,
    EthicsDocumentInfo,
    PaperInfo,
    ResearchAbstractSentencePair,
    ResearchAbstractTranslation,
    ResearchInfo,
)
from src.phone_validator import PhoneValidator
from src.prompts import load_prompt
from src.services.dataset_service import analyze_dataset
from src.services.email_check import validate_email
from src.services.ethics_document_validator import EthicsDocumentValidator
from src.services.google_genai_service import (
    investigate_researcher_history,
    suggest_icd10_code_list,
    translate_research_abstract_sentences,
)
from src.services.research_plan_validator import ResearchPlanValidator
from src.services.research_service import get_paper_info
from src.services.submission_application_checks import run_submission_application_checks
from src.utils import (
    ensure_runtime_directories,
    get_task_error_path,
    get_task_logger,
    get_task_result_path,
    get_upload_path,
    is_english_text,
    process_multiple_files,
)

_application_result_locks: WeakKeyDictionary[asyncio.AbstractEventLoop, dict[str, asyncio.Lock]] = WeakKeyDictionary()


def _get_application_result_lock(task_id: str) -> asyncio.Lock:
    loop = asyncio.get_running_loop()
    locks = _application_result_locks.setdefault(loop, {})
    return locks.setdefault(task_id, asyncio.Lock())


def _load_application_data(yml_path: Path, task_id: str) -> dict[str, Any]:
    if not yml_path.exists():
        raise FileNotFoundError(f"Application {task_id} not found")
    with open(yml_path, encoding="utf-8") as f:
        application_data = yaml.safe_load(f) or {}
    if not isinstance(application_data, dict):
        raise ValueError(f"Application {task_id} has invalid result data")
    return application_data


def _atomic_write_yaml(yml_path: Path, data: dict[str, Any]) -> None:
    temporary_path = yml_path.with_name(f".{yml_path.name}.{uuid4().hex}.tmp")
    try:
        with open(temporary_path, "x", encoding="utf-8") as f:
            yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary_path, yml_path)
    finally:
        temporary_path.unlink(missing_ok=True)


async def mark_application_processing(task_id: str, processing_data: dict[str, Any]) -> None:
    """Atomically mark an application as processing without discarding its current result."""
    yml_path = get_task_result_path(task_id)
    async with _get_application_result_lock(task_id):
        existing_data = _load_application_data(yml_path, task_id) if yml_path.exists() else {}
        merged_data = {**existing_data, **processing_data}
        merged_data["created_at"] = existing_data.get("created_at", processing_data["created_at"])
        _atomic_write_yaml(yml_path, merged_data)


def _merge_reanalyzed_dataset_state(
    latest_data: dict[str, Any],
    result: dict[str, Any],
) -> None:
    """Keep the latest explicit dataset membership while refreshing matching analyses."""
    if "dataset_analysis_list" not in latest_data and "dataset_info_list" not in latest_data:
        return

    latest_analyses = latest_data.get("dataset_analysis_list", [])
    if not isinstance(latest_analyses, list):
        latest_analyses = []
    reanalyzed = result.get("dataset_analysis_list", [])
    if not isinstance(reanalyzed, list):
        reanalyzed = []
    reanalyzed_by_id = {
        dataset_id.strip(): analysis
        for analysis in reanalyzed
        if (
            isinstance(analysis, dict)
            and isinstance((dataset_id := analysis.get("id")), str)
            and dataset_id.strip()
        )
    }
    result["dataset_analysis_list"] = [
        reanalyzed_by_id.get(dataset_id.strip(), analysis)
        if isinstance(analysis, dict)
        and isinstance((dataset_id := analysis.get("id")), str)
        and dataset_id.strip()
        else analysis
        for analysis in latest_analyses
    ]

    latest_dataset_info = latest_data.get("dataset_info_list", [])
    result["dataset_info_list"] = latest_dataset_info if isinstance(latest_dataset_info, list) else []


async def _persist_application_result(task_id: str, result: dict[str, Any]) -> None:
    yml_path = get_task_result_path(task_id)
    async with _get_application_result_lock(task_id):
        latest_data = _load_application_data(yml_path, task_id) if yml_path.exists() else {}
        result["created_at"] = latest_data.get("created_at", result["created_at"])
        _merge_reanalyzed_dataset_state(latest_data, result)
        _atomic_write_yaml(yml_path, result)


def _normalize_email(email: str | None) -> str | None:
    if not email:
        return None
    return email.strip().lower()


def _is_email_different_from_others(
    head_email: str | None,
    researcher_email: str | None,
    submitter_email: str | None,
) -> bool | None:
    normalized_head = _normalize_email(head_email)
    if not normalized_head:
        return None

    comparison_targets = [
        _normalize_email(researcher_email),
        _normalize_email(submitter_email),
    ]
    comparison_targets = [email for email in comparison_targets if email]

    if not comparison_targets:
        return None

    return all(normalized_head != email for email in comparison_targets)


def _extract_email_domain(email: str | None) -> str | None:
    if not email:
        return None
    normalized = _normalize_email(email)
    if normalized and "@" in normalized:
        return normalized.split("@")[-1]
    return None


def check_email_domain_consistency(
    researcher_email: str | None,
    submitter_email: str | None,
    head_of_institution_email: str | None,
) -> EmailDomainConsistencyResult:
    """
    研究代表者・申請者・所属機関長のメールドメインの整合性をチェックする。

    Returns:
        EmailDomainConsistencyResult: 整合性チェック結果
    """
    researcher_domain = _extract_email_domain(researcher_email)
    submitter_domain = _extract_email_domain(submitter_email)
    head_domain = _extract_email_domain(head_of_institution_email)

    researcher_submitter_match = (
        researcher_domain == submitter_domain if researcher_domain and submitter_domain else None
    )
    researcher_head_match = researcher_domain == head_domain if researcher_domain and head_domain else None
    submitter_head_match = submitter_domain == head_domain if submitter_domain and head_domain else None

    details = []

    def format_match_detail(role1: str, role2: str, domain1: str | None, domain2: str | None) -> str:
        if domain1 is None or domain2 is None:
            return f"{role1} ↔ {role2}: 判定不可（メールアドレス未記載）"
        if domain1 == domain2:
            return f"{role1} ↔ {role2}: 一致（{domain1}）"
        return f"{role1} ↔ {role2}: 不一致（{role1}: {domain1}, {role2}: {domain2}）"

    details.append(format_match_detail("研究代表者", "申請者", researcher_domain, submitter_domain))
    details.append(format_match_detail("研究代表者", "所属機関長", researcher_domain, head_domain))
    details.append(format_match_detail("申請者", "所属機関長", submitter_domain, head_domain))

    matches = [m for m in [researcher_submitter_match, researcher_head_match, submitter_head_match] if m is not None]

    if not matches:
        all_match = False
        summary = "判定不可（メールアドレス未記載）"
    elif all(matches):
        all_match = True
        available_domains = [d for d in [researcher_domain, submitter_domain, head_domain] if d]
        common_domain = available_domains[0] if available_domains else None
        summary = f"全員一致（{common_domain}）"
    elif not any(matches):
        all_match = False
        domain_parts = []
        if researcher_domain:
            domain_parts.append(f"研究代表者: {researcher_domain}")
        if submitter_domain:
            domain_parts.append(f"申請者: {submitter_domain}")
        if head_domain:
            domain_parts.append(f"所属機関長: {head_domain}")
        domain_info = f"（{', '.join(domain_parts)}）" if domain_parts else ""
        summary = f"全員不一致{domain_info}"
    else:
        all_match = False
        match_pairs = []
        if researcher_submitter_match:
            match_pairs.append("研究代表者-申請者")
        if researcher_head_match:
            match_pairs.append("研究代表者-所属機関長")
        if submitter_head_match:
            match_pairs.append("申請者-所属機関長")
        summary = f"一部不一致（{', '.join(match_pairs)}が一致）" if match_pairs else "不一致あり"

    return EmailDomainConsistencyResult(
        all_match=all_match,
        summary=summary,
        researcher_domain=researcher_domain,
        submitter_domain=submitter_domain,
        head_of_institution_domain=head_domain,
        researcher_submitter_match=researcher_submitter_match,
        researcher_head_match=researcher_head_match,
        submitter_head_match=submitter_head_match,
        details=details,
    )


def _split_english_abstract_into_sentences(research_abstract: str) -> list[str]:
    if not research_abstract:
        return []

    normalized = re.sub(r"\s+", " ", research_abstract).strip()
    if not normalized:
        return []

    # Keep sentence-ending punctuation while splitting by common delimiters.
    sentences = [s.strip() for s in re.split(r"(?<=[.!?．！？])\s+", normalized) if s.strip()]
    # merge too short sentences with the next one (e.g., "Background." "This study...") to avoid losing context in translation
    merged_sentences = []
    i = 0
    while i < len(sentences):
        if i < len(sentences) - 1 and len(sentences[i]) < 20:
            merged_sentences.append(f"{sentences[i]} {sentences[i + 1]}")
            i += 2
        else:
            merged_sentences.append(sentences[i])
            i += 1
    return merged_sentences if merged_sentences else [normalized]


def _build_research_abstract_translation(
    source_sentences: list[str],
    translated_sentences: list[str],
) -> ResearchAbstractTranslation | None:
    translations = [sentence.strip() for sentence in translated_sentences if sentence and sentence.strip()]
    if not translations:
        return None

    sentence_pairs = []
    if len(source_sentences) == len(translated_sentences):
        sentence_pairs = [
            ResearchAbstractSentencePair(
                pair_id=f"abstract-sentence-{index}",
                source_sentence=source_sentence.strip(),
                translated_sentence=translated_sentence.strip(),
            )
            for index, (source_sentence, translated_sentence) in enumerate(
                zip(source_sentences, translated_sentences, strict=True),
                start=1,
            )
            if source_sentence.strip() and translated_sentence.strip()
        ]
        if len(sentence_pairs) != len(source_sentences):
            sentence_pairs = []

    return ResearchAbstractTranslation(
        translated_abstract="\n".join(translations),
        sentence_pairs=sentence_pairs,
    )


def _complement_research_info(paper_info: PaperInfo) -> ResearchInfo:
    paper_id = paper_info.doi or (f"PMID:{paper_info.pmid}" if paper_info.pmid else None)
    title = paper_info.title or ""
    return ResearchInfo(
        title=title,
        summary_jp=title or None,
        paper_id=paper_id,
        authors=[],
        abstract="",
        url=f"https://doi.org/{paper_info.doi}" if paper_info.doi else "",
        icd10_code_list=[],
        analysis_method_list=[],
    )


async def get_research_info_list(
    related_paper_list: list[PaperInfo], task_id: str, logger: logging.Logger
) -> list[ResearchInfo]:
    retrieval_tasks: list[tuple[int, Any]] = []
    research_info_list = [_complement_research_info(paper_info) for paper_info in related_paper_list]

    for index, paper_info in enumerate(related_paper_list):
        if paper_info.doi:
            retrieval_task = get_paper_info(paper_info.doi, paper_info.title, "doi", task_id=task_id)
        elif paper_info.pmid:
            retrieval_task = get_paper_info(paper_info.pmid, paper_info.title, "pubmed", task_id=task_id)
        elif paper_info.title:
            retrieval_task = get_paper_info(None, paper_info.title, "title", task_id=task_id)
        else:
            logger.warning("Using best-effort paper information: %s", paper_info)
            continue
        retrieval_tasks.append((index, retrieval_task))

    retrieval_results = await asyncio.gather(
        *(task for _, task in retrieval_tasks), return_exceptions=True
    )
    for (index, _), research_info in zip(retrieval_tasks, retrieval_results):
        if isinstance(research_info, BaseException) or research_info is None:
            logger.warning("Using best-effort paper information: %s", related_paper_list[index])
            continue
        research_info_list[index] = research_info

    return research_info_list


async def analyze_datasets_for_application(
    dataset_id_list: list[str],
    abstract_icd10_list: list[str],
    research_info_list: list[Any],
    analysis_method: str,
    task_id: str,
    logger=None,
):
    """Analyze datasets for a given application

    Args:
        dataset_id_list: List of dataset IDs to analyze
        abstract_icd10_list: ICD-10 codes from research abstract
        research_info_list: List of research information
        analysis_method: Analysis method description
        task_id: Task ID for logging
        logger: Logger instance

    Returns:
        List of DatasetAnalysisResult objects
    """
    if logger is None:
        logger = get_task_logger(task_id)

    dataset_analysis_tasks = []
    paper_icd10_list = [icd10_code for info in research_info_list for icd10_code in info.icd10_code_list]
    for dataset_id in dataset_id_list:
        dataset_analysis_tasks.append(
            analyze_dataset(
                dataset_id,
                abstract_icd10_list,
                paper_icd10_list,
                research_info_list,
                analysis_method,
                task_id=task_id,
            )
        )
    dataset_analysis_result = await asyncio.gather(*dataset_analysis_tasks)
    logger.info(f"Dataset analysis_result retrieved: {dataset_analysis_result}")

    return dataset_analysis_result


async def process_application_task(
    task_id: str,
    filename: str,
    output_path: str,
    ethics_file_path: str,
    research_plan_path: str,
    application_type: str,
):
    """Process application data in background"""
    ensure_runtime_directories()

    error_file_path = get_task_error_path(task_id)
    if error_file_path.exists():
        os.remove(error_file_path)

    try:
        # Set up file handler for this task
        task_logger = get_task_logger(task_id)

        # Start logging
        task_logger.info("Starting application processing...")

        application_file_path = str(get_upload_path(filename))
        application_data, ethics_document = await process_multiple_files(application_file_path, ethics_file_path)

        # Get ICD-10 code for abstract
        abstract_icd10_list = await suggest_icd10_code_list(
            load_prompt("abstract_icd10_suggest.txt", research_abstract=application_data.research_abstract),
            task_id=task_id,
        )
        task_logger.info(f"ICD-10 code suggested for abstract: {abstract_icd10_list}")

        research_abstract_translation = None
        if is_english_text(application_data.research_abstract):
            source_sentences = _split_english_abstract_into_sentences(application_data.research_abstract)
            translated_sentences = await translate_research_abstract_sentences(
                source_sentences,
                task_id=task_id,
            )

            research_abstract_translation = _build_research_abstract_translation(
                source_sentences,
                translated_sentences,
            )
            if research_abstract_translation:
                if research_abstract_translation.sentence_pairs:
                    task_logger.info("Research abstract translated to Japanese with sentence alignment")
                else:
                    task_logger.warning(
                        "Research abstract translated without sentence alignment: source=%s translated=%s",
                        len(source_sentences),
                        len(translated_sentences),
                    )

        research_info_list = await get_research_info_list(
            application_data.related_paper_list,
            task_id,
            task_logger,
        )
        task_logger.info(f"Research information retrieved: {research_info_list}")

        # Analyze datasets using the reusable function
        dataset_analysis_result = await analyze_datasets_for_application(
            [ds.dataset_id for ds in application_data.dataset_info_list],
            abstract_icd10_list,
            research_info_list,
            application_data.analysis_method,
            task_id=task_id,
            logger=task_logger,
        )

        researcher_verification_result = await validate_email(
            application_data.researcher_info, False, logger=task_logger
        )

        if application_data.researcher_info.email == application_data.submitter_info.email:
            submitter_verification_result = researcher_verification_result
        else:
            submitter_verification_result = await validate_email(
                application_data.submitter_info, False, logger=task_logger
            )

        head_of_institution_verification_result = await validate_email(
            application_data.head_of_institution_info,
            True,
            logger=task_logger,
            provided_country_code=researcher_verification_result.address_validation_result.country_code
            if researcher_verification_result.address_validation_result
            else None,
            validate_address=False,
        )

        email_address_is_different = _is_email_different_from_others(
            application_data.head_of_institution_info.email,
            application_data.researcher_info.email,
            application_data.submitter_info.email,
        )
        head_of_institution_verification_result = head_of_institution_verification_result.model_copy(
            update={"email_address_is_different_from_others": email_address_is_different}
        )

        # 倫理関係書類の検証（倫理書類が提供されている場合のみ）
        ethics_document_validation_result = None
        institution_domain = None
        if application_data.researcher_info.email:
            institution_domain = application_data.researcher_info.email.split("@")[-1]

        if ethics_document:
            task_logger.info("Starting ethics document validation...")
            ethics_document_validator = EthicsDocumentValidator(task_id=task_id)
            ethics_document_validation_result = await ethics_document_validator.validate(
                application_data, ethics_document, institution_domain
            )
            task_logger.info(f"Ethics document validation result: {ethics_document_validation_result}")

        # 研究者履歴調査を実行
        researcher_history_result = None
        researcher_history_urls = []
        if os.environ.get("INVESTIGATE_RESEARCHER_HISTORY", "false").lower() == "true" and (
            application_data.researcher_info.name_jp or application_data.researcher_info.name_en
        ):
            task_logger.info("Starting researcher history investigation...")
            researcher_name = application_data.researcher_info.name_jp or application_data.researcher_info.name_en
            institution_name = (
                application_data.researcher_info.organization_jp
                or application_data.researcher_info.organization_en
                or ""
            )

            researcher_history_result, researcher_history_urls = await investigate_researcher_history(
                researcher_name, institution_name, logger=task_logger
            )
            task_logger.info("Researcher history investigation completed")

        # 電話番号整合性チェックを実行
        task_logger.info("Starting phone number consistency check...")
        phone_validator = PhoneValidator(task_id=task_id)

        # 研究代表者の電話番号検証結果から国コードを取得
        researcher_country_code = None
        if researcher_verification_result.phone_validation_result:
            researcher_country_code = researcher_verification_result.phone_validation_result.country_code

        # 3者間の電話番号整合性チェック
        organization_name = (
            application_data.researcher_info.organization_jp or application_data.researcher_info.organization_en
        )
        phone_consistency_result = await phone_validator.check_phone_consistency(
            researcher_phone=application_data.researcher_info.phone,
            submitter_phone=application_data.submitter_info.phone,
            head_of_institution_phone=application_data.head_of_institution_info.phone,
            default_region=researcher_country_code,
            organization_name=organization_name,
        )
        task_logger.info(f"Phone consistency check result: {phone_consistency_result}")

        # メールドメイン整合性チェックを実行
        task_logger.info("Starting email domain consistency check...")
        email_domain_consistency_result = check_email_domain_consistency(
            researcher_email=application_data.researcher_info.email,
            submitter_email=application_data.submitter_info.email,
            head_of_institution_email=application_data.head_of_institution_info.email,
        )
        task_logger.info(f"Email domain consistency check result: {email_domain_consistency_result}")

        if research_plan_path:
            research_plan_validator = ResearchPlanValidator(task_id=task_id)
            research_plan_validation_result = await research_plan_validator.validate(
                application_data, research_plan_path
            )
            task_logger.info(f"Research plan validation result: {research_plan_validation_result}")
        else:
            research_plan_validation_result = None

        # 提供申請限定チェック
        submission_application_check_result = None
        application_file_path = str(get_upload_path(filename))
        if "提供" in application_type:
            submission_application_check_result = await run_submission_application_checks(
                application_file_path,
                task_id=task_id,
                logger=task_logger,
            )

        # Create ApplicationVerificationData with all verification results
        # Currently only researcher verification is implemented
        application_verification_data = ApplicationVerificationData(
            **application_data.model_dump(),
            application_type=application_type,
            abstract_icd10_list=abstract_icd10_list,
            research_abstract_translation=research_abstract_translation,
            researcher_verification_result=researcher_verification_result,
            submitter_verification_result=submitter_verification_result,
            head_of_institution_verification_result=head_of_institution_verification_result,
            ethics_document=ethics_document,
            ethics_file_path=ethics_file_path,
            research_plan_path=research_plan_path,
            researcher_history=researcher_history_result,
            researcher_history_urls=researcher_history_urls,
            phone_consistency_result=phone_consistency_result,
            email_domain_consistency_result=email_domain_consistency_result,
            research_plan_validation_result=research_plan_validation_result,
            ethics_document_validation_result=ethics_document_validation_result,
            submission_application_check_result=submission_application_check_result,
        )

        # Assess application
        task_logger.info("Assessment completed")

        updated_at = (
            datetime.datetime.now()
            .astimezone(datetime.timezone(datetime.timedelta(hours=9)))
            .strftime("%Y-%m-%d %H:%M:%S")
        )

        # Store result - merge application data with verification data and additional metadata
        result = {
            "created_at": updated_at,
            "updated_at": updated_at,
            "status": "completed",
            "filename": filename,
            # Include all application verification data (which includes application data)
            **application_verification_data.model_dump(),
            # Additional processing results
            "research_info_list": [info.model_dump() for info in research_info_list],
            "dataset_analysis_list": [dataset.model_dump() for dataset in dataset_analysis_result],
        }

        await _persist_application_result(task_id, result)
        task_logger.info("Result saved successfully.")

    except Exception:
        # Log error
        error_stacktrace = traceback.format_exc()
        with open(error_file_path, "w", encoding="utf-8") as f:
            f.write(error_stacktrace)
        if "task_logger" in locals():
            task_logger.error(error_stacktrace)
        else:
            logging.getLogger("app").error(error_stacktrace)


def _normalize_dataset_ids(values: object) -> list[str]:
    if not isinstance(values, (list, tuple, set)):
        return []
    return list(
        dict.fromkeys(
            dataset_id.strip()
            for dataset_id in values
            if isinstance(dataset_id, str) and dataset_id.strip()
        )
    )


async def add_datasets_to_application_task(task_id: str, new_dataset_ids: list[str]):
    """Add new datasets to an existing application and analyze them

    Args:
        task_id: Task ID of the existing application
        new_dataset_ids: List of new dataset IDs to add
    Returns:
        Dict with status and message
    """
    error_file_path = get_task_error_path(task_id, "dataset_add")
    if error_file_path.exists():
        os.remove(error_file_path)

    try:
        # Set up file handler for this task
        task_logger = get_task_logger(f"{task_id}_dataset_add")
        task_logger.info(f"Adding datasets {new_dataset_ids} to application {task_id}")

        yml_path = get_task_result_path(task_id)
        normalized_dataset_ids = _normalize_dataset_ids(new_dataset_ids)

        async with _get_application_result_lock(task_id):
            existing_data = _load_application_data(yml_path, task_id)
            abstract_icd10_list = existing_data.get("abstract_icd10_list", [])
            research_info_list_data = existing_data.get("research_info_list", [])
            if not isinstance(research_info_list_data, list):
                research_info_list_data = []
            analysis_method = existing_data.get("analysis_method", "")
            dataset_analysis_list = existing_data.get("dataset_analysis_list", [])
            if not isinstance(dataset_analysis_list, list):
                dataset_analysis_list = []
            existing_dataset_ids = {
                dataset_id.strip()
                for ds in dataset_analysis_list
                if (
                    isinstance(ds, dict)
                    and isinstance((dataset_id := ds.get("id")), str)
                    and dataset_id.strip()
                )
            }

        # Convert research_info_list back to objects
        from src.models import ResearchInfo

        research_info_list = []
        for info in research_info_list_data:
            if not isinstance(info, dict):
                task_logger.warning("Ignoring malformed research information while adding datasets")
                continue
            try:
                research_info_list.append(ResearchInfo(**info))
            except (TypeError, ValueError):
                task_logger.warning("Ignoring malformed research information while adding datasets")

        datasets_to_add = [ds_id for ds_id in normalized_dataset_ids if ds_id not in existing_dataset_ids]

        status = "success"

        if not datasets_to_add:
            task_logger.info("No new datasets to add (all already exist)")
            return {
                "status": status,
                "message": "All specified datasets already exist in the application",
                "added_count": 0,
                "skipped_datasets": normalized_dataset_ids,
            }

        task_logger.info(f"Analyzing {len(datasets_to_add)} new datasets: {datasets_to_add}")

        dataset_analysis_result = await analyze_datasets_for_application(
            datasets_to_add,
            abstract_icd10_list,
            research_info_list,
            analysis_method,
            task_id=task_id,
            logger=task_logger,
        )

        analyzed_dataset_ids = [ds.id for ds in dataset_analysis_result]

        async with _get_application_result_lock(task_id):
            existing_data = _load_application_data(yml_path, task_id)
            dataset_analysis_list = existing_data.get("dataset_analysis_list", [])
            if not isinstance(dataset_analysis_list, list):
                dataset_analysis_list = []
            existing_data["dataset_analysis_list"] = dataset_analysis_list
            latest_dataset_ids = {
                dataset_id.strip()
                for ds in dataset_analysis_list
                if (
                    isinstance(ds, dict)
                    and isinstance((dataset_id := ds.get("id")), str)
                    and dataset_id.strip()
                )
            }
            added_dataset_ids = []
            for analysis in dataset_analysis_result:
                if analysis.id not in latest_dataset_ids:
                    dataset_analysis_list.append(analysis.model_dump())
                    latest_dataset_ids.add(analysis.id)
                    added_dataset_ids.append(analysis.id)

            dataset_info_list = existing_data.get("dataset_info_list", [])
            if not isinstance(dataset_info_list, list):
                dataset_info_list = []
            existing_data["dataset_info_list"] = dataset_info_list
            existing_dataset_info_ids = {
                dataset_id.strip()
                for ds in dataset_info_list
                if (
                    isinstance(ds, dict)
                    and isinstance((dataset_id := ds.get("dataset_id")), str)
                    and dataset_id.strip()
                )
            }
            for ds_id in added_dataset_ids:
                if ds_id not in existing_dataset_info_ids:
                    dataset_info_list.append({"dataset_id": ds_id, "purpose": ""})

            updated_at = (
                datetime.datetime.now()
                .astimezone(datetime.timezone(datetime.timedelta(hours=9)))
                .strftime("%Y-%m-%d %H:%M:%S")
            )
            existing_data["updated_at"] = updated_at
            _atomic_write_yaml(yml_path, existing_data)

        skipped_ids = [ds_id for ds_id in normalized_dataset_ids if ds_id not in added_dataset_ids]
        warning_ids = [ds_id for ds_id in datasets_to_add if ds_id not in analyzed_dataset_ids]

        if len(warning_ids) > 0:
            status = "warning"
            message = f"処理できないデータセットIDがありました: {warning_ids}"
            task_logger.warning(message)
        else:
            message = f"Successfully added {len(added_dataset_ids)} datasets"

        task_logger.info(
            f"Added {len(added_dataset_ids)} datasets to application {task_id}, Skipped: {len(skipped_ids)}"
        )

        return {
            "status": status,
            "message": message,
            "added_count": len(added_dataset_ids),
            "added_datasets": added_dataset_ids,
            "skipped_datasets": skipped_ids,
            "warning_datasets": warning_ids,
        }

    except Exception:
        # Log error
        error_stacktrace = traceback.format_exc()
        with open(error_file_path, "w", encoding="utf-8") as f:
            f.write(error_stacktrace)
        task_logger.error(error_stacktrace)
        raise


async def remove_dataset_from_application_task(task_id: str, dataset_id: str):
    """Remove a dataset from an existing application

    Args:
        task_id: Task ID of the existing application
        dataset_id: Dataset ID to remove

    Returns:
        Dict with status and message
    """
    error_file_path = get_task_error_path(task_id, "dataset_remove")
    if error_file_path.exists():
        os.remove(error_file_path)

    try:
        task_logger = get_task_logger(f"{task_id}_dataset_remove")
        task_logger.info(f"Removing dataset {dataset_id} from application {task_id}")

        normalized_dataset_ids = _normalize_dataset_ids([dataset_id])
        normalized_dataset_id = normalized_dataset_ids[0] if normalized_dataset_ids else ""
        if not normalized_dataset_id:
            return {
                "status": "not_found",
                "message": "データセットIDが指定されていません",
                "removed_count": 0,
                "dataset_id": normalized_dataset_id,
            }

        yml_path = get_task_result_path(task_id)
        async with _get_application_result_lock(task_id):
            existing_data = _load_application_data(yml_path, task_id)
            dataset_analysis_list = existing_data.get("dataset_analysis_list", [])
            dataset_info_list = existing_data.get("dataset_info_list", [])
            if not isinstance(dataset_analysis_list, list):
                dataset_analysis_list = []
            if not isinstance(dataset_info_list, list):
                dataset_info_list = []

            updated_dataset_analysis_list = [
                ds
                for ds in dataset_analysis_list
                if not isinstance(ds, dict) or ds.get("id") != normalized_dataset_id
            ]
            updated_dataset_info_list = [
                ds
                for ds in dataset_info_list
                if not isinstance(ds, dict) or ds.get("dataset_id") != normalized_dataset_id
            ]

            removed_analysis_count = len(dataset_analysis_list) - len(updated_dataset_analysis_list)
            removed_info_count = len(dataset_info_list) - len(updated_dataset_info_list)
            removed_count = max(removed_analysis_count, removed_info_count)

            if removed_count == 0:
                task_logger.info(f"Dataset {normalized_dataset_id} was not found in application {task_id}")
                return {
                    "status": "not_found",
                    "message": f"データセットID {normalized_dataset_id} は対象申請に存在しません",
                    "removed_count": 0,
                    "dataset_id": normalized_dataset_id,
                }

            existing_data["dataset_analysis_list"] = updated_dataset_analysis_list
            existing_data["dataset_info_list"] = updated_dataset_info_list
            updated_at = (
                datetime.datetime.now()
                .astimezone(datetime.timezone(datetime.timedelta(hours=9)))
                .strftime("%Y-%m-%d %H:%M:%S")
            )
            existing_data["updated_at"] = updated_at
            _atomic_write_yaml(yml_path, existing_data)

        task_logger.info(
            f"Removed dataset {normalized_dataset_id} from application {task_id} (analysis_list: {removed_analysis_count}, info_list: {removed_info_count})"
        )

        return {
            "status": "success",
            "message": f"データセットID {normalized_dataset_id} を削除しました",
            "dataset_id": normalized_dataset_id,
            "updated_at": updated_at,
        }
    except Exception:
        error_stacktrace = traceback.format_exc()
        with open(error_file_path, "w", encoding="utf-8") as f:
            f.write(error_stacktrace)
        task_logger.error(error_stacktrace)
        raise
