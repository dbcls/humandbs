import re
import traceback

from src.models import (
    ChecklistItemResult,
    SubmissionApplicationCheckResult,
    SubmissionApplicationFormData,
)
from src.prompts import load_prompt
from src.services.llm_service import check_icd10_target_relevance, extract_output_from_openai
from src.utils import extract_text_from_pdf, get_icd10_description, get_task_logger


def _normalize_text(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", "", text).lower()


def _add_item(
    result: SubmissionApplicationCheckResult,
    key: str,
    description: str,
    status: str,
    message: str | None = None,
) -> None:
    item_message = message or description
    result.items.append(
        ChecklistItemResult(
            key=key,
            description=description,
            status=status,
            message=item_message,
        )
    )


def _get_field_description(model: type, field_name: str) -> str:
    if hasattr(model, "model_fields"):
        field = model.model_fields.get(field_name)
        if field and field.description:
            return field.description
    if hasattr(model, "__fields__"):
        field = model.__fields__.get(field_name)
        if field and field.field_info.description:
            return field.field_info.description
    return field_name


def _bilingual_check(
    result: SubmissionApplicationCheckResult,
    key: str,
    description: str,
    jp_text: str | None,
    en_text: str | None,
    matches: bool | None,
    diff: str | None = None,
) -> None:
    combined_text = f"[日本語] {jp_text}\n[英語] {en_text}"
    if not jp_text or not en_text:
        _add_item(
            result,
            key,
            description,
            "warning",
            f"記載不足を確認: {combined_text}",
        )
        return

    if matches is True:
        _add_item(result, key, description, "ok", combined_text)
    elif matches is False:
        diff_text = f"\n[差分] {diff}" if diff else ""
        _add_item(
            result,
            key,
            description,
            "warning",
            f"日本語・英語の内容が一致しない可能性あり:\n{combined_text}{diff_text}",
        )
    else:
        _add_item(result, key, description, "ok", combined_text)


def _contains_keyword(text: str | None, keyword: str) -> bool:
    if not text:
        return False
    return keyword in _normalize_text(text)


async def _extract_submission_application_form_data(
    application_file_path: str,
    task_id: str | None,
) -> SubmissionApplicationFormData | None:
    form_text = await extract_text_from_pdf(application_file_path, task_id)
    if not form_text:
        return "PDFからテキストを抽出できませんでした"

    prompt = load_prompt("submission_form_extraction.txt", form_text=form_text)

    return await extract_output_from_openai(prompt, SubmissionApplicationFormData, task_id=task_id)


async def run_submission_application_checks(
    application_file_path: str,
    task_id: str | None = None,
    logger=None,
) -> SubmissionApplicationCheckResult | None:
    if logger is None:
        logger = get_task_logger(task_id)

    result = SubmissionApplicationCheckResult()

    try:
        form_data = await _extract_submission_application_form_data(application_file_path, task_id)
        if not form_data or not isinstance(form_data, SubmissionApplicationFormData):
            _add_item(
                result,
                "submission_extraction",
                "例外が発生",
                "warning",
                "提供申請情報の抽出に失敗" + (f"（抽出結果: {form_data}）" if form_data else ""),
            )
            return result

        contact_email_consent_status = "ok" if form_data.contact_email_consent else "alert"
        _add_item(
            result,
            "contact_email_consent",
            _get_field_description(SubmissionApplicationFormData, "contact_email_consent"),
            contact_email_consent_status,
            "承諾済み" if form_data.contact_email_consent else "未承諾",
        )

        _bilingual_check(
            result,
            "provided_data_purpose",
            _get_field_description(SubmissionApplicationFormData, "provided_data_purpose_matches"),
            form_data.provided_data_purpose_jp,
            form_data.provided_data_purpose_en,
            form_data.provided_data_purpose_matches,
            form_data.provided_data_purpose_diff,
        )
        _bilingual_check(
            result,
            "provided_data_target",
            _get_field_description(SubmissionApplicationFormData, "provided_data_target_matches"),
            form_data.provided_data_target_jp,
            form_data.provided_data_target_en,
            form_data.provided_data_target_matches,
            form_data.provided_data_target_diff,
        )
        _bilingual_check(
            result,
            "provided_data_method",
            _get_field_description(SubmissionApplicationFormData, "provided_data_method_matches"),
            form_data.provided_data_method_jp,
            form_data.provided_data_method_en,
            form_data.provided_data_method_matches,
            form_data.provided_data_method_diff,
        )

        if form_data.icd10_code_list and len(form_data.icd10_code_list) > 0:
            icd10_status = "ok"
            icd10_descriptions_list = []
            for code in form_data.icd10_code_list:
                description = get_icd10_description(code)
                if description:
                    icd10_descriptions_list.append(f"{code}({description})")
                else:
                    icd10_descriptions_list.append(code)
            icd10_message = ", ".join(icd10_descriptions_list)
        else:
            icd10_status = "alert"
            icd10_message = "ICD-10分類コードが未記載"
        _add_item(
            result,
            "icd10_code_list",
            "ICD-10分類コードが１つ以上記載されている",
            icd10_status,
            icd10_message,
        )

        # ICD10コードと提供データの対象の関連性をチェック
        if (
            form_data.icd10_code_list
            and len(form_data.icd10_code_list) > 0
            and (form_data.provided_data_target_jp or form_data.provided_data_target_en)
        ):
            is_relevant, relevance_reason = await check_icd10_target_relevance(
                form_data.icd10_code_list,
                form_data.provided_data_target_jp,
                form_data.provided_data_target_en,
                task_id,
            )

            if is_relevant is not None:
                form_data.icd10_target_relevance = is_relevant
                form_data.icd10_target_relevance_message = relevance_reason

                relevance_status = "ok" if is_relevant else "warning"
                _add_item(
                    result,
                    "icd10_target_relevance",
                    "ICD-10コードと提供データの対象が関連している",
                    relevance_status,
                    relevance_reason,
                )

        if form_data.publication_title:
            publication_title_status = "ok"
            publication_title_message = form_data.publication_title
        else:
            publication_title_status = "warning"
            publication_title_message = "発表論文が未記載"
        _add_item(
            result,
            "publication_title",
            "発表論文のタイトルが記載されている（未定含む）",
            publication_title_status,
            publication_title_message,
        )

        _bilingual_check(
            result,
            "data_restrictions",
            _get_field_description(SubmissionApplicationFormData, "data_restrictions_matches"),
            form_data.data_restrictions_jp,
            form_data.data_restrictions_en,
            form_data.data_restrictions_matches,
        )

        if form_data.data_type:
            data_type_status = "ok" if not form_data.data_type_is_unrestricted else "alert"
            data_type_message = form_data.data_type
        else:
            data_type_status = "alert"
            data_type_message = "データの種類が未選択"
        _add_item(
            result,
            "data_type",
            "データの種類が選択されており、かつ非制限ではない",
            data_type_status,
            data_type_message,
        )

        if form_data.type_of_study:
            type_of_study_status = "ok"
            type_of_study_message = form_data.type_of_study
        else:
            type_of_study_status = "alert"
            type_of_study_message = "データの作成タイプが未選択"
        _add_item(
            result,
            "type_of_study",
            "データの作成タイプが選択されている",
            type_of_study_status,
            type_of_study_message,
        )

        if form_data.target_region_is_limited:
            if not form_data.target_region:
                target_region_status = "alert"
                target_region_message = "解析対象領域が限定されるが対象領域の記載がない"
            else:
                target_region_status = "ok"
                target_region_message = form_data.target_region
            _add_item(
                result,
                "target_region",
                "解析対象の領域が限定されている場合は、「対象領域」に記載されている",
                target_region_status,
                target_region_message,
            )

        if form_data.file_format:
            file_format_status = "ok"
            file_format_message = form_data.file_format
        else:
            file_format_status = "warning"
            file_format_message = "ファイル形式が未選択"
        _add_item(
            result,
            "file_format",
            "ファイル形式が選択されている",
            file_format_status,
            file_format_message,
        )

        if form_data.total_data_amount:
            total_data_amount_status = "ok" if form_data.total_data_amount_is_valid else "alert"
            total_data_amount_message = form_data.total_data_amount
        else:
            total_data_amount_status = "alert"
            total_data_amount_message = "総データ量が未記載"
        _add_item(
            result,
            "total_data_amount",
            "総データ量が数値＋単位で記載されている",
            total_data_amount_status,
            total_data_amount_message,
        )

        _add_item(
            result,
            "projected_release_date",
            _get_field_description(SubmissionApplicationFormData, "projected_release_date"),
            "ok" if form_data.projected_release_date else "warning",
            form_data.projected_release_date if form_data.projected_release_date else "データ公開予定日が未記載",
        )

        if form_data.guidelines_confirmation and (
            "確認済み" in form_data.guidelines_confirmation
            and "遵守" in form_data.guidelines_confirmation
            or form_data.guidelines_confirmation == "yes"
        ):
            guidelines_confirmation_status = "ok"
        else:
            guidelines_confirmation_status = "alert"
        _add_item(
            result,
            "guidelines_confirmation",
            _get_field_description(SubmissionApplicationFormData, "guidelines_confirmation"),
            guidelines_confirmation_status,
            form_data.guidelines_confirmation,
        )

        _bilingual_check(
            result,
            "research_title",
            _get_field_description(SubmissionApplicationFormData, "research_title_matches"),
            form_data.research_title_jp,
            form_data.research_title_en,
            form_data.research_title_matches,
        )

        _add_item(
            result,
            "anonymization_status",
            _get_field_description(SubmissionApplicationFormData, "anonymization_status"),
            "ok"
            if (
                _contains_keyword(form_data.anonymization_status, "匿名化実施済み")
                or _contains_keyword(form_data.anonymization_status, "匿名化済み")
            )
            else "alert",
            form_data.anonymization_status,
        )

        _add_item(
            result,
            "ethics_review_status",
            _get_field_description(SubmissionApplicationFormData, "ethics_review_status"),
            "ok" if _contains_keyword(form_data.ethics_review_status, "審査済み") else "alert",
            form_data.ethics_review_status,
        )

        _add_item(
            result,
            "private_company_use",
            _get_field_description(SubmissionApplicationFormData, "private_company_use"),
            "ok" if _contains_keyword(form_data.private_company_use, "承諾") else "alert",
            form_data.private_company_use,
        )

        _add_item(
            result,
            "multi_center_data_provision",
            _get_field_description(SubmissionApplicationFormData, "multi_center_data_provision"),
            "alert" if _contains_keyword(form_data.multi_center_data_provision, "確認していません") else "ok",
            form_data.multi_center_data_provision,
        )

        _add_item(
            result,
            "dbcls_ddbj_processing",
            _get_field_description(SubmissionApplicationFormData, "dbcls_ddbj_processing"),
            "alert" if _contains_keyword(form_data.dbcls_ddbj_processing, "承諾しない") else "ok",
            form_data.dbcls_ddbj_processing,
        )

        return result

    except Exception:
        logger.exception("Submission application checks failed")
        _add_item(
            result,
            "submission_checks",
            _get_field_description(SubmissionApplicationCheckResult, "items"),
            "warning",
            "提供申請チェック中に例外が発生: " + traceback.format_exc(),
        )
        return result
