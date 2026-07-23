from __future__ import annotations

from pydantic import BaseModel, Field

from src.models import (
    ApplicationData,
    ResearchPlanConsistencyCheckResult,
    ResearchPlanExtractionResult,
    ResearchPlanValidationResult,
)
from src.prompts import load_prompt
from src.services.google_genai_service import extract_output_from_genai
from src.services.llm_service import extract_output_from_openai
from src.utils import extract_text_from_pdf, get_task_logger


class ResearcherAffiliationWebCheckResult(BaseModel):
    is_listed_on_web: bool = Field(..., description="研究者の所属情報がWeb上で確認できたか")
    reason: str = Field(..., description="判定理由の日本語での説明")


class ResearchPlanValidator:
    def __init__(self, task_id: str | None = None):
        self.task_id = task_id
        self.task_logger = get_task_logger(task_id)

    async def validate(
        self,
        application_data: ApplicationData,
        research_plan_path: str,
    ) -> ResearchPlanValidationResult:
        research_plan_text = await extract_text_from_pdf(research_plan_path)
        application_data_text = self.format_application_data_for_prompt(application_data)

        prompt = load_prompt(
            "research_plan_consistency_check.txt",
            application_data_text=application_data_text,
            research_plan_text=research_plan_text,
        )

        consistency_result = await extract_output_from_openai(prompt, ResearchPlanConsistencyCheckResult)

        if consistency_result:
            if consistency_result.researcher_affiliation_matches == "full_match":
                consistency_result.researcher_affiliation_message = (
                    f"完全一致\n{consistency_result.researcher_affiliation_message}\n"
                )
            else:
                web_affiliation_message = await self.verify_researcher_affiliation_on_web(application_data)
                consistency_message = (
                    "意味的に一致" if consistency_result.researcher_affiliation_matches == "similar" else "不一致"
                )
                consistency_result.researcher_affiliation_message = f"{consistency_message}\n\n{consistency_result.researcher_affiliation_message}\n\n{web_affiliation_message}\n"

        prompt = load_prompt("research_plan_extraction.txt", research_plan_text=research_plan_text)
        extraction_result = await extract_output_from_openai(prompt, ResearchPlanExtractionResult)

        return ResearchPlanValidationResult(**consistency_result.model_dump(), **extraction_result.model_dump())

    def format_application_data_for_prompt(self, application_data: ApplicationData) -> str:
        parts = []

        researcher_info = application_data.researcher_info

        # Add name (priority: Japanese then English)
        if researcher_info.name_jp:
            parts.append(f"氏名: {researcher_info.name_jp}")
        elif researcher_info.name_en:
            parts.append(f"Name: {researcher_info.name_en}")

        # Add organization (priority: Japanese then English)
        if researcher_info.organization_jp:
            parts.append(f"所属機関: {researcher_info.organization_jp}")
        elif researcher_info.organization_en:
            parts.append(f"所属機関: {researcher_info.organization_en}")

        # Add position/title (priority: Japanese then English)
        if researcher_info.title_jp:
            parts.append(f"役職: {researcher_info.title_jp}")
        elif researcher_info.title_en:
            parts.append(f"役職: {researcher_info.title_en}")

        if application_data.research_title_jp:
            parts.append(f"研究題目（日本語）: {application_data.research_title_jp}")
        if application_data.research_title_en:
            parts.append(f"研究題目（英語）: {application_data.research_title_en}")

        return "\n".join(parts)

    async def verify_researcher_affiliation_on_web(self, application_data: ApplicationData) -> str:
        researcher_info = application_data.researcher_info

        researcher_name_jp = researcher_info.name_jp or ""
        researcher_name_en = researcher_info.name_en or ""
        organization_jp = researcher_info.organization_jp or ""
        organization_en = researcher_info.organization_en or ""
        title_jp = researcher_info.title_jp or ""
        title_en = researcher_info.title_en or ""

        prompt = load_prompt(
            "researcher_affiliation_web_check.txt",
            researcher_name_jp=researcher_name_jp,
            researcher_name_en=researcher_name_en,
            organization_jp=organization_jp,
            organization_en=organization_en,
            title_jp=title_jp,
            title_en=title_en,
        )

        result, evidence_urls = await extract_output_from_genai(
            prompt=prompt,
            output_model=ResearcherAffiliationWebCheckResult,
            logger=self.task_logger,
        )

        if not result:
            return "Web確認: 研究者の所属情報を確認できませんでした。"

        status = "掲載あり" if result.is_listed_on_web else "掲載なし"
        evidence_url = evidence_urls[0] if evidence_urls else None
        evidence_suffix = f"\n参照URL: {evidence_url}" if evidence_url else ""
        return f"Web確認: {status}\n{result.reason}{evidence_suffix}"
