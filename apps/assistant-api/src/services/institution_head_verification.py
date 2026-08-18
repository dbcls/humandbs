import datetime
import logging
import re
from urllib.parse import urlparse

from pydantic import BaseModel, Field

from src.models import HeadOfInstitutionVerificationResult
from src.prompts import load_prompt
from src.services.google_genai_service import extract_output_from_genai, retrieve_original_url
from src.utils import add_text_fragment_to_url, domain_matches


def _is_institution_domain(url: str, organization_domain: str = None) -> bool:
    """
    URLが所属機関の公式ドメインかどうかを判定する
    """
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if not domain or not organization_domain:
            return False
        return domain_matches(domain, organization_domain.lower())
    except (ValueError, TypeError, AttributeError):
        return False


class HeadOfInstitutionSearchResult(BaseModel):
    """Model for head of institution search result"""

    names: list[str] = Field(
        default_factory=list, description="現在の就任者の名前のリスト。複数いる場合は全員を含める。"
    )


async def verify_institution_head_position(
    expected_institution_head_name: str,
    institution_head_position: str,
    institution_name: str = None,
    organization_domain: str = None,
    logger: logging.Logger = None,
) -> HeadOfInstitutionVerificationResult:
    # 最新日付での就任者情報を取得するため、日付文字列を作成
    today_date = datetime.datetime.now().strftime("%Y-%m-%d")

    task_instruction = load_prompt(
        "institution_head_verification.txt",
        today_date=today_date,
        institution_name=institution_name,
        institution_head_position=institution_head_position,
    )

    result, position_evidence_url = await extract_output_from_genai(
        prompt=task_instruction, output_model=HeadOfInstitutionSearchResult, logger=logger
    )
    position_evidence_url = position_evidence_url[0] if position_evidence_url else None
    if not result or not result.names:
        return HeadOfInstitutionVerificationResult(
            position_verified=False,
            position_message="Web検索で情報が見つかりませんでした。",
        )

    # 複数の就任者と照合
    position_verified, matched_name = _verify_position_match_multiple(expected_institution_head_name, result.names)

    if position_evidence_url and "vertexaisearch.cloud.google.com" in position_evidence_url:
        position_evidence_url = await retrieve_original_url(position_evidence_url)

    position_message = _generate_verification_message(
        verified=position_verified,
        ethics_name=expected_institution_head_name,
        current_holders=result.names,
        matched_name=matched_name,
        position=institution_head_position,
        source_url=position_evidence_url,
        organization_domain=organization_domain,
    )

    # 証拠URLには一致した名前、または最初の就任者を使用
    evidence_name = matched_name if matched_name else result.names[0]
    position_evidence_url = _generate_evidence_url(position_evidence_url, evidence_name, institution_head_position)

    # 複数就任者の場合は結合して保存
    current_holder_display = "、".join(result.names) if len(result.names) > 1 else result.names[0]

    return HeadOfInstitutionVerificationResult(
        position_verified=position_verified,
        position_evidence_url=position_evidence_url,
        position_message=position_message,
        current_position_holder=current_holder_display,
    )


def _verify_position_match(ethics_name: str | None, current_holder: str) -> bool:
    """
    倫理書類の氏名と現在の役職者が一致するかを確認
    """
    if not ethics_name or not current_holder:
        return False

    # 名前の正規化（大文字小文字の一致、記号の除去）
    ethics_name_normalized = re.sub(r"[\W_]+", "", ethics_name).lower()
    current_holder_normalized = re.sub(r"[\W_]+", "", current_holder).lower()

    # 完全一致
    return ethics_name_normalized == current_holder_normalized


def _verify_position_match_multiple(ethics_name: str | None, current_holders: list[str]) -> tuple[bool, str | None]:
    """
    倫理書類の氏名と複数の現在の役職者が一致するかを確認

    Returns:
        Tuple[bool, Optional[str]]: (一致したかどうか, 一致した名前)
    """
    if not ethics_name or not current_holders:
        return False, None

    # 各就任者と照合
    for holder in current_holders:
        if _verify_position_match(ethics_name, holder):
            return True, holder

    return False, None


def _generate_evidence_url(base_url: str, person_name: str, position: str) -> str:
    """
    証拠URLにテキストフラグメントを追加して生成
    """
    try:
        fragments = []
        if person_name:
            # 人名を分割してフラグメントに追加
            name_parts = person_name.replace("　", " ").split()
            fragments.extend(name_parts)

        if position:
            # 役職名もフラグメントに追加
            fragments.append(position)

        if fragments:
            return add_text_fragment_to_url(base_url, *fragments)
        return base_url

    except (ValueError, TypeError):
        return base_url


def _generate_verification_message(
    verified: bool,
    ethics_name: str | None,
    current_holders: list[str],
    matched_name: str | None,
    position: str,
    source_url: str = None,
    organization_domain: str = None,
) -> str:
    """
    検証結果のメッセージを生成
    """
    # 情報源の詳細を含めるメッセージの構築
    source_info = ""
    source_info = "所属機関公式サイト" if _is_institution_domain(source_url, organization_domain) else "外部サイト"

    source_info += "より確認"

    # 現在の役職者を表示用にフォーマット
    if len(current_holders) > 1:
        holders_display = "、".join([f"「{name}」" for name in current_holders])
    else:
        holders_display = f"「{current_holders[0]}」"

    if verified:
        if ethics_name:
            if len(current_holders) > 1:
                return f"申請書記載の{position}「{ethics_name}」は現在の役職者{holders_display}に含まれています（{source_info}）"
            return (
                f"申請書記載の{position}「{ethics_name}」と現在の役職者{holders_display}が一致しました（{source_info}）"
            )
        return f"現在の{position}は{holders_display}であることを確認しました（{source_info}）"
    if ethics_name:
        return f"申請書記載の{position}「{ethics_name}」と現在の役職者{holders_display}が一致しません（{source_info}、要確認）"
    return f"現在の{position}は{holders_display}ですが、倫理書類に氏名の記載がないため照合できません（{source_info}）"


if __name__ == "__main__":
    import asyncio
    import sys

    from src.utils import get_task_logger

    logger = get_task_logger("institution_head_verification_test")

    result = asyncio.run(
        verify_institution_head_position(
            expected_institution_head_name=sys.argv[1],
            institution_head_position=sys.argv[2],
            institution_name=sys.argv[3],
            organization_domain=sys.argv[4],
            logger=logger,
        )
    )

    print(result)
