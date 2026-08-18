import asyncio
import datetime
import logging
import os
import re
import traceback
from typing import Any

import yaml  # Added PyYAML for YAML serialization
from fastapi import BackgroundTasks

from src.models import (
    ApplicationData,
    ApplicationVerificationData,
    EmailDomainConsistencyResult,
    EthicsDocumentInfo,
    ResearchAbstractSentencePair,
    ResearchAbstractTranslation,
)
from src.phone_validator import PhoneValidator
from src.prompts import load_prompt
from src.services.dataset_service import analyze_dataset
from src.services.email_check import validate_email
from src.services.ethics_document_validator import EthicsDocumentValidator
from src.services.google_genai_service import investigate_researcher_history
from src.services.llm_service import suggest_icd10_code_list, translate_research_abstract_sentences
from src.services.research_plan_validator import ResearchPlanValidator
from src.services.research_service import get_paper_info
from src.services.submission_application_checks import run_submission_application_checks
from src.utils import get_task_logger, is_english_text


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
    application_data: ApplicationData,
    ethics_document: EthicsDocumentInfo,
    background_tasks: BackgroundTasks,
    task_id: str,
    filename: str,
    output_path: str,
    ethics_file_path: str,
    research_plan_path: str,
    application_type: str,
):
    """Process application data in background"""
    error_file_path = f"results/{task_id}_error.txt"
    if os.path.exists(error_file_path):
        os.remove(error_file_path)

    try:
        # Set up file handler for this task
        os.makedirs("logs", exist_ok=True)
        task_logger = get_task_logger(task_id)

        # Start logging
        task_logger.info("Starting application processing...")

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

            if translated_sentences:
                if len(translated_sentences) != len(source_sentences):
                    task_logger.warning(
                        "Research abstract translation sentence count mismatch: source=%s translated=%s",
                        len(source_sentences),
                        len(translated_sentences),
                    )

                sentence_pairs = [
                    ResearchAbstractSentencePair(
                        pair_id=f"abstract-sentence-{index}",
                        source_sentence=source_sentence,
                        translated_sentence=translated_sentences[index - 1]
                        if index - 1 < len(translated_sentences)
                        else "",
                    )
                    for index, source_sentence in enumerate(source_sentences, start=1)
                ]
                research_abstract_translation = ResearchAbstractTranslation(
                    translated_abstract="\n".join([sentence for sentence in translated_sentences if sentence.strip()]),
                    sentence_pairs=sentence_pairs,
                )
            task_logger.info("Research abstract translated to Japanese with sentence alignment")

        research_info_tasks = []
        for related_paper_info in application_data.related_paper_list:
            research_info = None
            if related_paper_info.doi:
                research_info = get_paper_info(related_paper_info.doi, related_paper_info.title, "doi", task_id=task_id)
            elif related_paper_info.pmid:
                research_info = get_paper_info(
                    related_paper_info.pmid, related_paper_info.title, "pubmed", task_id=task_id
                )
            elif related_paper_info.title:
                research_info = get_paper_info(None, related_paper_info.title, "title", task_id=task_id)
            if not research_info:
                task_logger.warning(f"Invalid paper info: {related_paper_info}")
            else:
                research_info_tasks.append(research_info)

        research_info_results = await asyncio.gather(*research_info_tasks)
        research_info_list = [ri for ri in research_info_results if ri]
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
        application_file_path = f"uploads/{filename}"
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

        if os.path.exists(output_path):
            try:
                with open(output_path, encoding="utf-8") as f:
                    existing_data = yaml.safe_load(f)
                created_at = existing_data["created_at"]
            except (FileNotFoundError, KeyError):
                created_at = updated_at
        else:
            created_at = updated_at

        # Store result - merge application data with verification data and additional metadata
        result = {
            "created_at": created_at,
            "updated_at": updated_at,
            "status": "completed",
            "filename": filename,
            # Include all application verification data (which includes application data)
            **application_verification_data.model_dump(),
            # Additional processing results
            "abstract_icd10_list": abstract_icd10_list,
            "research_info_list": [info.model_dump() for info in research_info_list],
            "dataset_analysis_list": [dataset.model_dump() for dataset in dataset_analysis_result],
        }

        # Save result to a file or database
        os.makedirs("results", exist_ok=True)
        with open(f"results/{task_id}.yml", "w", encoding="utf-8") as f:
            yaml.safe_dump(result, f, allow_unicode=True, sort_keys=False)
        task_logger.info("Result saved successfully.")

    except Exception:
        # Log error
        error_stacktrace = traceback.format_exc()
        os.makedirs("results", exist_ok=True)
        with open(error_file_path, "w", encoding="utf-8") as f:
            f.write(error_stacktrace)
        if "task_logger" in locals():
            task_logger.error(error_stacktrace)
        else:
            logging.getLogger("app").error(error_stacktrace)


async def add_datasets_to_application_task(
    task_id: str, new_dataset_ids: list[str], background_tasks: BackgroundTasks = None
):
    """Add new datasets to an existing application and analyze them

    Args:
        task_id: Task ID of the existing application
        new_dataset_ids: List of new dataset IDs to add
        background_tasks: FastAPI BackgroundTasks (optional)

    Returns:
        Dict with status and message
    """
    error_file_path = f"results/{task_id}_dataset_add_error.txt"
    if os.path.exists(error_file_path):
        os.remove(error_file_path)

    try:
        # Set up file handler for this task
        task_logger = get_task_logger(f"{task_id}_dataset_add")
        task_logger.info(f"Adding datasets {new_dataset_ids} to application {task_id}")

        # Load existing application data from YML
        yml_path = f"results/{task_id}.yml"
        if not os.path.exists(yml_path):
            raise FileNotFoundError(f"Application {task_id} not found")

        with open(yml_path, encoding="utf-8") as f:
            existing_data = yaml.safe_load(f)

        # Extract necessary data for analysis
        abstract_icd10_list = existing_data.get("abstract_icd10_list", [])
        research_info_list_data = existing_data.get("research_info_list", [])
        analysis_method = existing_data.get("analysis_method", "")

        # Convert research_info_list back to objects
        from src.models import ResearchInfo

        research_info_list = [ResearchInfo(**info) for info in research_info_list_data]

        # Filter out datasets that already exist
        existing_dataset_ids = [ds["id"] for ds in existing_data.get("dataset_analysis_list", [])]
        datasets_to_add = [ds_id for ds_id in new_dataset_ids if ds_id not in existing_dataset_ids]

        status = "success"

        if not datasets_to_add:
            task_logger.info("No new datasets to add (all already exist)")
            return {
                "status": status,
                "message": "All specified datasets already exist in the application",
                "added_count": 0,
                "skipped_datasets": new_dataset_ids,
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

        added_dataset_ids = [ds.id for ds in dataset_analysis_result]

        # Append new analysis results to existing dataset_analysis_list
        if "dataset_analysis_list" not in existing_data:
            existing_data["dataset_analysis_list"] = []

        for analysis in dataset_analysis_result:
            existing_data["dataset_analysis_list"].append(analysis.model_dump())

        # Update the dataset_info_list
        if "dataset_info_list" not in existing_data:
            existing_data["dataset_info_list"] = []
        existing_dataset_id_set = {ds["dataset_id"] for ds in existing_data["dataset_info_list"]}
        for ds_id in added_dataset_ids:
            if ds_id not in existing_dataset_id_set:
                existing_data["dataset_info_list"].append({"dataset_id": ds_id, "purpose": ""})

        # Update timestamp
        updated_at = (
            datetime.datetime.now()
            .astimezone(datetime.timezone(datetime.timedelta(hours=9)))
            .strftime("%Y-%m-%d %H:%M:%S")
        )
        existing_data["updated_at"] = updated_at

        # Save updated data back to YML file
        with open(yml_path, "w", encoding="utf-8") as f:
            yaml.safe_dump(existing_data, f, allow_unicode=True, sort_keys=False)

        skipped_ids = [ds_id for ds_id in datasets_to_add if ds_id not in added_dataset_ids and ds_id]
        warning_ids = [ds_id for ds_id in skipped_ids if ds_id not in existing_dataset_ids]

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
        os.makedirs("results", exist_ok=True)
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
    error_file_path = f"results/{task_id}_dataset_remove_error.txt"
    if os.path.exists(error_file_path):
        os.remove(error_file_path)

    try:
        task_logger = get_task_logger(f"{task_id}_dataset_remove")
        task_logger.info(f"Removing dataset {dataset_id} from application {task_id}")

        yml_path = f"results/{task_id}.yml"
        if not os.path.exists(yml_path):
            raise FileNotFoundError(f"Application {task_id} not found")

        with open(yml_path, encoding="utf-8") as f:
            existing_data = yaml.safe_load(f)

        dataset_analysis_list = existing_data.get("dataset_analysis_list", [])
        dataset_info_list = existing_data.get("dataset_info_list", [])

        updated_dataset_analysis_list = [ds for ds in dataset_analysis_list if ds.get("id") != dataset_id]
        updated_dataset_info_list = [ds for ds in dataset_info_list if ds.get("dataset_id") != dataset_id]

        removed_analysis_count = len(dataset_analysis_list) - len(updated_dataset_analysis_list)
        removed_info_count = len(dataset_info_list) - len(updated_dataset_info_list)
        removed_count = max(removed_analysis_count, removed_info_count)

        if removed_count == 0:
            task_logger.info(f"Dataset {dataset_id} was not found in application {task_id}")
            return {
                "status": "not_found",
                "message": f"データセットID {dataset_id} は対象申請に存在しません",
                "removed_count": 0,
                "dataset_id": dataset_id,
            }

        existing_data["dataset_analysis_list"] = updated_dataset_analysis_list
        existing_data["dataset_info_list"] = updated_dataset_info_list
        updated_at = (
            datetime.datetime.now()
            .astimezone(datetime.timezone(datetime.timedelta(hours=9)))
            .strftime("%Y-%m-%d %H:%M:%S")
        )
        existing_data["updated_at"] = updated_at

        with open(yml_path, "w", encoding="utf-8") as f:
            yaml.safe_dump(existing_data, f, allow_unicode=True, sort_keys=False)

        task_logger.info(
            f"Removed dataset {dataset_id} from application {task_id} (analysis_list: {removed_analysis_count}, info_list: {removed_info_count})"
        )

        return {
            "status": "success",
            "message": f"データセットID {dataset_id} を削除しました",
            "dataset_id": dataset_id,
            "updated_at": updated_at,
        }
    except Exception:
        error_stacktrace = traceback.format_exc()
        os.makedirs("results", exist_ok=True)
        with open(error_file_path, "w", encoding="utf-8") as f:
            f.write(error_stacktrace)
        task_logger.error(error_stacktrace)
        raise
