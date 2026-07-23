#!/usr/bin/env python3
"""
電話番号検証モジュール

研究者の電話番号が適切かどうかを検証するための機能を提供します。
python-phonenumbersライブラリを使用して標準的な電話番号検証を実行します。
"""

import argparse
import asyncio
import re
from enum import Enum

import phonenumbers
from phonenumbers import PhoneNumberType
from pydantic import BaseModel, Field

from src.models import PhoneConsistencyResult, PhoneValidationResult
from src.prompts import load_prompt
from src.services.google_genai_service import extract_output_from_genai
from src.utils import add_text_fragment_to_url, get_task_logger


class PhoneMatchType(Enum):
    """電話番号の一致タイプ"""

    EXACT_MATCH = "exact_match"  # 完全一致
    AREA_CODE_MATCH = "area_code_match"  # 市外局番まで一致
    NO_MATCH = "no_match"  # 不一致


class MobileCheckResult(Enum):
    IS_MOBILE = "is_mobile"
    IS_NOT_MOBILE = "is_not_mobile"
    UNDETERMINED = "undetermined"


class PhoneValidator:
    """電話番号検証クラス（python-phonenumbersを使用）"""

    def __init__(self, task_id: str = None):
        self.task_logger = get_task_logger(task_id)
        self.task_id = task_id

    async def check_if_organization_main_phone(
        self, phone_number: str, organization_name: str | None
    ) -> tuple[bool | None, str | None, str, str | None]:
        """
        電話番号が所属機関の代表電話かどうかをチェック

        Args:
            phone_number: 電話番号
            organization_name: 所属機関名

        Returns:
            Tuple[Optional[bool], Optional[str], str, Optional[str]]:
                (代表電話かどうか, 根拠URL, メッセージ, 最終更新年)
        """
        if not organization_name:
            return None, None, "所属機関名が提供されていないため代表電話判定をスキップしました", None

        class OrganizationMainPhoneResult(BaseModel):
            is_main_phone: bool = Field(..., description="電話番号が所属機関の代表電話として掲載されているかどうか")
            reason: str = Field(..., description="判定理由の日本語での説明")
            last_updated_year: str | None = Field(None, description="情報の最終更新年（見つかった場合）")

        task_instruction = load_prompt(
            "phone_main_number_check.txt",
            phone_number=phone_number,
            organization_name=organization_name,
        )

        result, evidence_urls = await extract_output_from_genai(
            prompt=task_instruction, output_model=OrganizationMainPhoneResult, logger=self.task_logger
        )

        if not result:
            return None, None, "代表電話としての根拠が確認できませんでした", None

        evidence_url = evidence_urls[0] if evidence_urls else None
        if evidence_url:
            evidence_url = add_text_fragment_to_url(evidence_url, phone_number)

        return result.is_main_phone, evidence_url, result.reason, result.last_updated_year

    def parse_phone_number(self, phone_number: str, region_code: str) -> tuple[phonenumbers.PhoneNumber | None, str]:
        """
        電話番号をパースして標準化

        Args:
            phone_number: 電話番号文字列
            region_code: 国コード（例: "JP"）

        Returns:
            (パースされた電話番号オブジェクト, エラーメッセージ) のタプル
        """

        error_messages = {
            phonenumbers.NumberParseException.INVALID_COUNTRY_CODE: "無効な国番号です",
            phonenumbers.NumberParseException.NOT_A_NUMBER: "電話番号として認識できません",
            phonenumbers.NumberParseException.TOO_SHORT_NSN: "電話番号が短すぎます",
            phonenumbers.NumberParseException.TOO_SHORT_AFTER_IDD: "国際番号として短すぎます",
            phonenumbers.NumberParseException.TOO_LONG: "電話番号が長すぎます",
        }
        try:
            parsed = phonenumbers.parse(phone_number, region_code) if region_code else phonenumbers.parse(phone_number)
            return parsed, ""
        except phonenumbers.NumberParseException as e:
            return None, error_messages.get(e.error_type, str(e))

    async def check_phone_association(self, phone_number: str, researcher_name: str, organization: str):
        """
        電話番号と研究者・所属機関の関連性をチェック

        Args:
            phone_number: 電話番号
            researcher_name: 研究者名
            organization: 所属機関名

        Returns:
            Tuple[bool, Optional[str], Optional[str], Optional[str]]:
                (関連しているかどうか, 関連性のあるURL, メッセージ, 最終更新年)
        """

        class PhoneAssociationResult(BaseModel):
            is_related: bool = Field(..., description="電話番号が研究者または所属機関に関連しているかどうか")
            reason: str = Field(..., description="判定理由の日本語での説明")
            last_updated_year: str | None = Field(None, description="情報の最終更新年（見つかった場合）")

        task_instruction = load_prompt(
            "phone_association_check.txt",
            phone_number=phone_number,
            researcher_name=researcher_name,
            organization=organization,
        )

        result, evidence_urls = await extract_output_from_genai(
            prompt=task_instruction, output_model=PhoneAssociationResult, logger=self.task_logger
        )

        if not result:
            return False, None, "電話番号の関連性が確認できませんでした", None

        evidence_url = evidence_urls[0] if evidence_urls else None

        if evidence_url:
            # URLにテキストフラグメントを追加
            evidence_url = add_text_fragment_to_url(evidence_url, phone_number)

        return result.is_related, evidence_url, result.reason, result.last_updated_year

    async def validate_phone_number(
        self, phone_number: str, researcher_name: str, organization: str, expected_country_code: str
    ) -> PhoneValidationResult:
        log_msg = f"Starting phone validation for {researcher_name} at {organization}"
        self.task_logger.info(log_msg)

        country_code_message = None

        corrected_phone_number = None

        parsed_phone_number, error = self.parse_phone_number(phone_number, None)

        expected_country_number = (
            phonenumbers.country_code_for_region(expected_country_code) if expected_country_code else None
        )
        if not parsed_phone_number and expected_country_code:
            parsed_phone_number, error = self.parse_phone_number(phone_number, expected_country_code)
            country_code_message = f"国番号が書かれていませんが、住所から推定される国番号は {expected_country_number} ({expected_country_code})です"
            if parsed_phone_number and expected_country_code != 'JP':
                # 海外の番号で、かつ国番号から始まっていない番号の場合は補正した番号も返却する
                if not phone_number.startswith(f"+{expected_country_number}") and not phone_number.startswith(str(expected_country_number)):
                    corrected_phone_number = phonenumbers.format_number(
                        parsed_phone_number, phonenumbers.PhoneNumberFormat.INTERNATIONAL
                    )
                    # さらに、国番号が本当に含まれていないのかをチェックする。まず元の入力から数字のみを抽出
                    digits_only_input = re.sub(r'\D', '', phone_number)
                    digits_only_formatted = re.sub(r'\D', '', corrected_phone_number)
                    if digits_only_input.endswith(digits_only_formatted):
                        country_code_message = None


        if not parsed_phone_number:
            return PhoneValidationResult(
                country_code=None,
                country_code_matched_with_address=False,
                country_code_message=f"無効な電話番号です: {error}",
            )
        self.task_logger.info(f"Parsed phone number: {parsed_phone_number}")

        # 各種チェックを実行
        actual_country_code = phonenumbers.region_code_for_country_code(parsed_phone_number.country_code)

        country_code_matched_with_address = (
            expected_country_number is not None and parsed_phone_number.country_code == expected_country_number
        )

        if not country_code_message:
            if country_code_matched_with_address:
                country_code_message = f"国番号は {parsed_phone_number.country_code} で、住所の示す値（{expected_country_code}）と一致しました"
            elif expected_country_code:
                country_code_message = (
                    f"国番号が住所の示す値と異なります: {expected_country_code} vs {actual_country_code}"
                )
            else:
                country_code_message = f"国番号は {actual_country_code}（{parsed_phone_number.country_code}） です"

        number_type = phonenumbers.number_type(parsed_phone_number)

        if number_type == PhoneNumberType.MOBILE:
            judge_about_cell_phone = "携帯電話番号です"
        elif number_type == PhoneNumberType.FIXED_LINE_OR_MOBILE or number_type == PhoneNumberType.PERSONAL_NUMBER:
            judge_about_cell_phone = "携帯電話または固定電話の両方の可能性があります"
        elif number_type == PhoneNumberType.FIXED_LINE:
            judge_about_cell_phone = "固定電話番号です"
        elif number_type == PhoneNumberType.VOIP:
            judge_about_cell_phone = "IP電話です"
        elif number_type == PhoneNumberType.UAN:
            judge_about_cell_phone = "ユニバーサルアクセス番号、もしくは企業番号です"
        else:
            judge_about_cell_phone = (
                f"電話番号のタイプが不明です: {PhoneNumberType.to_string(number_type) if number_type else 'UNKNOWN'}"
            )

        related, url, url_message, last_updated_year = await self.check_phone_association(
            phone_number, researcher_name, organization
        )

        return PhoneValidationResult(
            country_code=actual_country_code,
            country_code_matched_with_address=country_code_matched_with_address,
            country_code_message=country_code_message,
            judge_about_cell_phone=judge_about_cell_phone,
            related_to_researcher_or_organization=related,
            researcher_phone_url=url,
            researcher_phone_message=url_message,
            researcher_phone_last_updated_year=last_updated_year,
            corrected_phone_number=corrected_phone_number
        )

    def extract_area_code(self, phone_number: str, default_region: str = "JP") -> str | None:
        """
        電話番号から市外局番（エリアコード）を抽出

        Args:
            phone_number: 電話番号文字列
            default_region: デフォルトの国コード（例: "JP"）

        Returns:
            市外局番（例: "03", "06", "078"）。抽出できない場合はNone
        """
        if not phone_number:
            return None

        parsed, error = self.parse_phone_number(phone_number, default_region)
        if not parsed:
            return None

        try:
            # NATIONAL形式でフォーマットし、最初のハイフンまでの部分を取得
            national_formatted = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.NATIONAL)
            # スペースやハイフンで分割して最初の部分を取得
            parts = national_formatted.replace(" ", "-").split("-")
            return parts[0] if parts else None
        except Exception:
            return None

    def normalize_phone_number(self, phone_number: str, default_region: str = "JP") -> str | None:
        """
        電話番号を正規化（比較用に統一した形式に変換）

        Args:
            phone_number: 電話番号文字列
            default_region: デフォルトの国コード（例: "JP"）

        Returns:
            E.164形式の電話番号（例: "+81312345678"）。正規化できない場合はNone
        """
        if not phone_number:
            return None

        parsed, error = self.parse_phone_number(phone_number, default_region)
        if not parsed:
            return None

        try:
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
        except Exception:
            return None

    def compare_phone_numbers(self, phone1: str, phone2: str, default_region: str = "JP") -> PhoneMatchType:
        """
        2つの電話番号を比較し、一致タイプを返す

        Args:
            phone1: 1つ目の電話番号
            phone2: 2つ目の電話番号
            default_region: デフォルトの国コード

        Returns:
            PhoneMatchType: 一致タイプ（完全一致、市外局番一致、不一致）
        """
        if not phone1 or not phone2:
            return PhoneMatchType.NO_MATCH

        # 正規化して比較
        normalized1 = self.normalize_phone_number(phone1, default_region)
        normalized2 = self.normalize_phone_number(phone2, default_region)

        if normalized1 and normalized2 and normalized1 == normalized2:
            return PhoneMatchType.EXACT_MATCH

        # 市外局番を比較
        area_code1 = self.extract_area_code(phone1, default_region)
        area_code2 = self.extract_area_code(phone2, default_region)

        if area_code1 and area_code2 and area_code1 == area_code2:
            return PhoneMatchType.AREA_CODE_MATCH

        return PhoneMatchType.NO_MATCH

    async def check_phone_consistency(
        self,
        researcher_phone: str | None,
        submitter_phone: str | None,
        head_of_institution_phone: str | None,
        default_region: str = None,
        organization_name: str | None = None,
    ) -> PhoneConsistencyResult:
        """
        研究代表者、申請者、所属機関長の3者間の電話番号整合性をチェック

        Args:
            researcher_phone: 研究代表者の電話番号
            submitter_phone: 申請者の電話番号
            head_of_institution_phone: 所属機関長の電話番号
            default_region: デフォルトの国コード（Noneの場合は"JP"をフォールバック）

        Returns:
            PhoneConsistencyResult: 整合性チェック結果
        """
        if default_region is None:
            default_region = "JP"

        # 各電話番号の市外局番を抽出
        researcher_area_code = self.extract_area_code(researcher_phone, default_region) if researcher_phone else None
        submitter_area_code = self.extract_area_code(submitter_phone, default_region) if submitter_phone else None
        head_area_code = (
            self.extract_area_code(head_of_institution_phone, default_region) if head_of_institution_phone else None
        )

        # 各ペア間の一致タイプを判定
        researcher_submitter_match = (
            self.compare_phone_numbers(researcher_phone, submitter_phone, default_region)
            if researcher_phone and submitter_phone
            else PhoneMatchType.NO_MATCH
        )

        researcher_head_match = (
            self.compare_phone_numbers(researcher_phone, head_of_institution_phone, default_region)
            if researcher_phone and head_of_institution_phone
            else PhoneMatchType.NO_MATCH
        )

        submitter_head_match = (
            self.compare_phone_numbers(submitter_phone, head_of_institution_phone, default_region)
            if submitter_phone and head_of_institution_phone
            else PhoneMatchType.NO_MATCH
        )

        # 詳細メッセージを作成
        details = []

        def format_match_detail(
            role1: str, role2: str, match_type: PhoneMatchType, area_code1: str | None, area_code2: str | None
        ) -> str:
            if match_type == PhoneMatchType.EXACT_MATCH:
                return f"{role1} ↔ {role2}: 完全一致"
            if match_type == PhoneMatchType.AREA_CODE_MATCH:
                return f"{role1} ↔ {role2}: 市外局番一致（{area_code1}）"
            codes = []
            if area_code1:
                codes.append(f"{role1}: {area_code1}")
            if area_code2:
                codes.append(f"{role2}: {area_code2}")
            code_info = f"（{', '.join(codes)}）" if codes else ""
            return f"{role1} ↔ {role2}: 不一致{code_info}"

        details.append(
            format_match_detail(
                "研究代表者", "申請者", researcher_submitter_match, researcher_area_code, submitter_area_code
            )
        )
        details.append(
            format_match_detail("研究代表者", "所属機関長", researcher_head_match, researcher_area_code, head_area_code)
        )
        details.append(
            format_match_detail("申請者", "所属機関長", submitter_head_match, submitter_area_code, head_area_code)
        )

        # 結果のサマリーを判定
        matches = [researcher_submitter_match, researcher_head_match, submitter_head_match]
        exact_count = sum(1 for m in matches if m == PhoneMatchType.EXACT_MATCH)
        area_code_count = sum(1 for m in matches if m == PhoneMatchType.AREA_CODE_MATCH)
        no_match_count = sum(1 for m in matches if m == PhoneMatchType.NO_MATCH)

        # サマリーを決定
        if exact_count == 3:
            summary = "全員完全一致"
            all_match = True
        elif exact_count == 0 and area_code_count == 3:
            # 全員市外局番一致の場合、共通の市外局番を表示
            common_area_code = researcher_area_code or submitter_area_code or head_area_code
            summary = f"全員市外局番一致（{common_area_code}）"
            all_match = True
        elif exact_count > 0 and no_match_count == 0:
            # 1ペア以上完全一致、残りは市外局番一致
            exact_pairs = []
            if researcher_submitter_match == PhoneMatchType.EXACT_MATCH:
                exact_pairs.append("研究代表者-申請者")
            if researcher_head_match == PhoneMatchType.EXACT_MATCH:
                exact_pairs.append("研究代表者-所属機関長")
            if submitter_head_match == PhoneMatchType.EXACT_MATCH:
                exact_pairs.append("申請者-所属機関長")
            common_area_code = researcher_area_code or submitter_area_code or head_area_code
            summary = f"{', '.join(exact_pairs)}が完全一致、他は市外局番一致（{common_area_code}）"
            all_match = True
        elif exact_count > 0 and no_match_count > 0:
            # 1ペア以上完全一致、残りは不一致
            exact_pairs = []
            if researcher_submitter_match == PhoneMatchType.EXACT_MATCH:
                exact_pairs.append("研究代表者-申請者")
            if researcher_head_match == PhoneMatchType.EXACT_MATCH:
                exact_pairs.append("研究代表者-所属機関長")
            if submitter_head_match == PhoneMatchType.EXACT_MATCH:
                exact_pairs.append("申請者-所属機関長")
            summary = f"{', '.join(exact_pairs)}が完全一致、他は不一致"
            all_match = False
        elif area_code_count > 0 and no_match_count > 0:
            # 1ペア以上市外局番一致、残りは不一致
            area_code_pairs = []
            if researcher_submitter_match == PhoneMatchType.AREA_CODE_MATCH:
                area_code_pairs.append(f"研究代表者-申請者（{researcher_area_code}）")
            if researcher_head_match == PhoneMatchType.AREA_CODE_MATCH:
                area_code_pairs.append(f"研究代表者-所属機関長（{researcher_area_code}）")
            if submitter_head_match == PhoneMatchType.AREA_CODE_MATCH:
                area_code_pairs.append(f"申請者-所属機関長（{submitter_area_code}）")
            summary = f"{', '.join(area_code_pairs)}が市外局番一致、他は不一致"
            all_match = False
        else:
            # 全員不一致
            area_codes = []
            if researcher_area_code:
                area_codes.append(f"研究代表者: {researcher_area_code}")
            if submitter_area_code:
                area_codes.append(f"申請者: {submitter_area_code}")
            if head_area_code:
                area_codes.append(f"所属機関長: {head_area_code}")
            area_code_info = f"（{', '.join(area_codes)}）" if area_codes else ""
            summary = f"全員不一致{area_code_info}"
            all_match = False

        head_phone_is_different_from_others = None
        head_phone_difference_message = None
        head_phone_is_representative_number = False

        if head_of_institution_phone and (researcher_phone or submitter_phone):
            head_matches_others = (
                researcher_head_match == PhoneMatchType.EXACT_MATCH
                or submitter_head_match == PhoneMatchType.EXACT_MATCH
            )

            if head_matches_others:
                try:
                    (
                        is_main_phone,
                        evidence_url,
                        reason,
                        last_updated_year,
                    ) = await self.check_if_organization_main_phone(head_of_institution_phone, organization_name)
                except Exception:
                    self.task_logger.exception("代表電話番号の判定中にエラーが発生しました")
                    is_main_phone, evidence_url, reason, last_updated_year = (
                        None,
                        None,
                        "代表電話判定中にエラーが発生しました",
                        None,
                    )

                if is_main_phone is True:
                    head_phone_is_different_from_others = True
                    evidence_text = f" 根拠URL: {evidence_url}" if evidence_url else ""
                    updated_text = f"（最終更新年: {last_updated_year}）" if last_updated_year else ""
                    head_phone_is_representative_number = True
                    head_phone_difference_message = f"研究代表者・申請者と一致していますが、所属機関の代表電話として確認されました: {reason}{updated_text}{evidence_text}"
                elif is_main_phone is False:
                    head_phone_is_different_from_others = False
                    head_phone_difference_message = (
                        f"研究代表者・申請者と一致しており、所属機関の代表電話として確認されませんでした: {reason}"
                    )
                else:
                    head_phone_is_different_from_others = None
                    head_phone_difference_message = reason
            else:
                head_phone_is_different_from_others = True
                head_phone_difference_message = "所属機関長の電話番号は研究代表者・申請者と異なります"

        return PhoneConsistencyResult(
            all_match=all_match,
            summary=summary,
            researcher_area_code=researcher_area_code,
            submitter_area_code=submitter_area_code,
            head_of_institution_area_code=head_area_code,
            researcher_submitter_match=researcher_submitter_match.value,
            researcher_head_match=researcher_head_match.value,
            submitter_head_match=submitter_head_match.value,
            details=details,
            head_phone_is_different_from_others=head_phone_is_different_from_others,
            head_phone_is_representative_number=head_phone_is_representative_number,
            head_phone_difference_message=head_phone_difference_message,
        )


def _build_cli_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="validate_phone_number を単体で実行するユーティリティ"
    )
    parser.add_argument("phone_number", help="電話番号")
    parser.add_argument("researcher_name", help="研究者名")
    parser.add_argument("organization", help="所属機関名")
    parser.add_argument(
        "expected_country_code",
        help="住所から推定される国コード（例: JP）",
    )
    parser.add_argument(
        "--task-id",
        default=None,
        help="任意のタスクID（ログ出力用）",
    )
    return parser


async def _run_cli(args: argparse.Namespace) -> None:
    validator = PhoneValidator(task_id=args.task_id)
    result = await validator.validate_phone_number(
        phone_number=args.phone_number,
        researcher_name=args.researcher_name,
        organization=args.organization,
        expected_country_code=args.expected_country_code,
    )
    print(result.model_dump_json(indent=2, ensure_ascii=False))


if __name__ == "__main__":
    parser = _build_cli_parser()
    cli_args = parser.parse_args()
    asyncio.run(_run_cli(cli_args))

