from __future__ import annotations

from src.models import (
    ApplicationData,
    EthicsDocumentInfo,
    EthicsDocumentLLMValidationResult,
    EthicsDocumentValidationResult,
)
from src.prompts import load_prompt
from src.services.institution_head_verification import verify_institution_head_position
from src.services.llm_service import extract_output_from_openai
from src.utils import get_task_logger


class EthicsDocumentValidator:
    def __init__(self, task_id: str | None = None):
        self.task_id = task_id
        self.task_logger = get_task_logger(task_id)

    async def validate(
        self,
        application_data: ApplicationData,
        ethics_document: EthicsDocumentInfo,
        institution_domain: str | None = None,
    ) -> EthicsDocumentValidationResult:
        """
        研究実施許可書の情報を検証する

        Args:
            application_data: 申請書のデータ
            ethics_document: 研究実施許可書から抽出された情報
            institution_domain: 所属機関のドメイン（機関長役職検証用）

        Returns:
            EthicsDocumentValidationResult: 検証結果
        """
        # 研究題目の一致チェック
        application_data_text = self.format_application_data_for_prompt(application_data)
        ethics_document_text = self.format_ethics_document_for_prompt(ethics_document)

        prompt = load_prompt(
            "ethics_document_validation.txt",
            application_data_text=application_data_text,
            ethics_document_text=ethics_document_text,
        )

        # LLMで研究題目の一致チェックを実行
        validation_result = await extract_output_from_openai(prompt, EthicsDocumentLLMValidationResult)

        if not validation_result:
            self.task_logger.warning("LLMからの応答が不正です。空の結果を返します。")
            return EthicsDocumentValidationResult(
                research_title_matches=None,
                research_title_message="LLMからの応答が不正です",
                institution_head_position_verification_result=None,
            )

        # 所属機関長の役職検証（倫理書類に機関長の役職情報がある場合）
        if ethics_document.institution_head_position:
            self.task_logger.info("Starting head of institution position verification...")
            name = (
                application_data.head_of_institution_info.name_jp or application_data.head_of_institution_info.name_en
            )
            institution_name = (
                application_data.researcher_info.organization_jp
                or application_data.researcher_info.organization_en
                or ethics_document.institution_name
                or ""
            )
            head_of_institution_position_verification_result = await verify_institution_head_position(
                name,
                ethics_document.institution_head_position,
                institution_name,
                institution_domain,
                logger=self.task_logger,
            )
            self.task_logger.info(
                "Head of institution position verification completed: %s",
                head_of_institution_position_verification_result,
            )
        else:
            head_of_institution_position_verification_result = None

        return EthicsDocumentValidationResult(
            **validation_result.model_dump(),
            institution_head_position_verification_result=head_of_institution_position_verification_result,
        )

    def format_application_data_for_prompt(self, application_data: ApplicationData) -> str:
        """
        申請書データをプロンプト用にフォーマットする

        Args:
            application_data: 申請書のデータ

        Returns:
            str: フォーマットされたテキスト
        """
        parts = []

        if application_data.research_title_jp:
            parts.append(f"研究題目（日本語）: {application_data.research_title_jp}")
        if application_data.research_title_en:
            parts.append(f"研究題目（英語）: {application_data.research_title_en}")

        return "\n".join(parts)

    def format_ethics_document_for_prompt(self, ethics_document: EthicsDocumentInfo) -> str:
        """
        研究実施許可書の情報をプロンプト用にフォーマットする

        Args:
            ethics_document: 研究実施許可書から抽出された情報

        Returns:
            str: フォーマットされたテキスト
        """
        parts = []

        if ethics_document.research_project_title_jp:
            parts.append(f"研究プロジェクトのタイトル（日本語）: {ethics_document.research_project_title_jp}")
        if ethics_document.research_project_title_en:
            parts.append(f"研究プロジェクトのタイトル（英語）: {ethics_document.research_project_title_en}")

        return "\n".join(parts)
