import datetime
import logging
import re
from typing import Any

import dns.resolver
from pydantic import BaseModel, Field

from src.address_validator import AddressValidator
from src.models import AddressValidationResult, PersonalInfo, ResearcherVerificationResult
from src.phone_validator import PhoneValidationResult, PhoneValidator
from src.prompts import load_prompt
from src.services.google_genai_service import extract_output_from_genai, retrieve_original_url
from src.services.llm_service import extract_output_from_openai
from src.utils import (
    add_text_fragment_to_url,
    domain_matches,
    fetch_with_playwright,
    get_search_response,
)

MAX_PAGE_LENGTH = int(1e5)

BLACKLISTED_DOMAINS = [
    "humandbs.dbcls.jp",  # ヒトデータベース自体から取得される情報は信頼しない
]


async def validate_email(
    researcher_info: PersonalInfo, exclude_researcher_name_verification: bool, logger=None, provided_country_code=None
) -> ResearcherVerificationResult:
    """
    研究者についてメールアドレスを含めた検証を行う。

    Args:
        researcher_info (PersonalInfo): 研究者の情報を含むPydanticモデル
        exclude_researcher_name_verification: 研究者名に関する検証を省略する
        logger: ログ記録用のロガーオブジェクト (省略可能)

    Returns:
        ResearcherVerificationResult: 検証結果を含むPydanticモデル
    """

    # 最初に、メールアドレスが全角の @ を含む場合は半角に変換する
    if researcher_info.email and "＠" in researcher_info.email:
        researcher_info.email = researcher_info.email.replace("＠", "@")

    email = researcher_info.email
    researcher_name_en = researcher_info.name_en
    researcher_name_jp = researcher_info.name_jp
    organization_name_en = researcher_info.organization_en
    organization_name_jp = researcher_info.organization_jp

    # MXレコード検証の実行
    mx_valid, mx_message = await verify_email_mx_records(email, logger)

    # ドメイン検証の実行
    domain_verified, domain_evidence_url, domain_message = await verify_email_domain_with_vertex_ai(
        email, organization_name_en, organization_name_jp, logger
    )

    # 研究者ページでのメール検証の実行
    researcher_verification_result = await verify_with_researcher_page(
        email, researcher_name_en, researcher_name_jp, organization_name_en, organization_name_jp, logger
    )

    email_verified, email_evidence_url, email_message, profile_url, profile_message, last_updated_date, orcid_url = (
        researcher_verification_result.get("email_verified", False),
        researcher_verification_result.get("email_evidence_url"),
        researcher_verification_result.get("email_message"),
        researcher_verification_result.get("researcher_evidence_url"),
        researcher_verification_result.get("researcher_message"),
        researcher_verification_result.get("email_last_updated_year"),
        researcher_verification_result.get("orcid_url"),
    )

    # 住所検証の実行（住所が提供されている場合のみ）
    address_validation_result = None
    if researcher_info.address:
        try:
            validator = AddressValidator(logger)

            address_validation_result = await validator.validate_address(
                address=researcher_info.address,
                organization_name_jp=researcher_info.organization_jp,
                organization_name_en=researcher_info.organization_en,
            )

            if logger:
                logger.info(f"Address validation completed: {address_validation_result.message}")

        except Exception as e:
            # エラーが発生した場合のデフォルトの検証結果
            address_validation_result = AddressValidationResult(
                address_exists=False,
                country_code=None,
                formatted_address=None,
                organization_match=None,
                organization_distance_km=None,
                message=f"住所検証中にエラーが発生しました: {str(e)}",
                google_map_urls=[],
            )
            if logger:
                logger.exception("Address validation error")

    # 電話番号検証の実行（電話番号が提供されている場合のみ）
    phone_validation_result = None
    if researcher_info.phone:
        phone_validator = PhoneValidator()

        country_code = provided_country_code or (
            address_validation_result.country_code if address_validation_result else None
        )

        phone_validation_result = await phone_validator.validate_phone_number(
            researcher_info.phone,
            researcher_info.name_jp if researcher_info.name_jp else researcher_info.name_en,
            researcher_info.organization_jp if researcher_info.organization_jp else researcher_info.organization_en,
            country_code,
        )
    else:
        phone_validation_result = PhoneValidationResult(
            country_code=None,
            country_code_matched_with_address=False,
            country_code_message="電話番号が提供されていません",
        )

    # 所属機関の法人格検証
    legal_entity_type, legal_entity_urls, legal_entity_message = await verify_organization_legal_entity(
        researcher_info.organization_jp, researcher_info.organization_en, logger
    )

    return ResearcherVerificationResult(
        mx_domain_verified=mx_valid,
        mx_domain_failure_reason=None if mx_valid else mx_message,
        organization_domain_verified=domain_verified,
        organization_domain_message=domain_message,
        organization_domain_evidence_url=domain_evidence_url,
        researcher_email_verified=email_verified,
        researcher_email_evidence_url=email_evidence_url,
        researcher_email_message=email_message,
        researcher_profile_url=profile_url,
        researcher_profile_message=profile_message,
        researcher_profile_last_updated=last_updated_date,
        orcid_url=orcid_url,
        address_validation_result=address_validation_result,
        phone_validation_result=phone_validation_result,
        organization_legal_entity_type=legal_entity_type,
        organization_legal_entity_urls=legal_entity_urls,
        organization_legal_entity_message=legal_entity_message,
    )


async def verify_email_domain_with_vertex_ai(
    email: str, organization_name_en: str, organization_name_jp: str, logger=None
) -> tuple[bool, str | None, str]:
    """
    Args:
        email (str): 検証するメールアドレス
        organization_name_en (str): 研究者の所属機関の英語名
        organization_name_jp (str): 研究者の所属機関の日本語名
        logger: ログ記録用のロガーオブジェクト (省略可能)

    Returns:
        Tuple[bool, Optional[str], str]: (検証結果, 証拠URL, 詳細メッセージ)
    """
    if not logger:
        logger = logging.getLogger("app")

    logger.info(f"Verifying email domain with Vertex AI: {email}")

    # メールアドレスからドメイン部分を抽出
    domain = email.split("@")[-1]
    if not domain or "." not in domain:
        return False, None, f"無効なメールドメインです: {domain}"

    logger.info(f"Email domain to verify: {domain}")

    query = organization_name_jp if organization_name_jp else organization_name_en

    class DomainAssociationResult(BaseModel):
        is_related: bool = Field(..., description="ドメインが機関の発行したものかどうか")
        reason: str = Field(..., description="判定理由の日本語での説明")
        last_updated_year: str | None = Field(None, description="情報の最終更新年（見つかった場合）")

    task_instruction = load_prompt("email_domain_check.txt", domain=domain, query=query)

    result, evidence_urls = await extract_output_from_genai(
        prompt=task_instruction, output_model=DomainAssociationResult, logger=logger
    )

    if not result:
        return False, None, "ドメインの関連性が確認できませんでした"

    evidence_url = evidence_urls[0] if evidence_urls else None

    if evidence_url:
        # URLにテキストフラグメントを追加
        evidence_url = add_text_fragment_to_url(evidence_url, domain)

    return result.is_related, evidence_url, result.reason


async def verify_email_domain_with_web_search(
    email: str, organization_name_en: str, organization_name_jp: str, logger=None
) -> tuple[bool, str | None, str]:
    """
    Args:
        email (str): 検証するメールアドレス
        organization_name_en (str): 研究者の所属機関の英語名
        organization_name_jp (str): 研究者の所属機関の日本語名
        logger: ログ記録用のロガーオブジェクト (省略可能)

    Returns:
        Tuple[bool, Optional[str], str]: (検証結果, 証拠URL, 詳細メッセージ)
    """
    if not logger:
        logger = logging.getLogger("app")

    # メールアドレスからドメイン部分を抽出
    domain = email.split("@")[-1]
    if not domain or "." not in domain:
        return False, None, f"無効なメールドメインです: {domain}"

    logger.info(f"Verifying email domain: {domain}")

    query = organization_name_jp if organization_name_jp else organization_name_en

    logger.info(f"Search query for organization: {query}")

    search_result = get_search_response(query, num_results=5, preferred_domain=domain)
    if search_result is None:
        logger.error("Failed to fetch search results")
        return False, None, "検索結果の取得に失敗しました"

    logger.info(f"Search results for organization: {len(search_result)} results found")

    found_domains = set()
    for result in search_result:
        if not result:
            continue
        url = result.get("link")
        logger.info(f"Checking URL: {url}")
        domain_in_url = re.search(r"https?://([^/]+)", url)
        if domain_in_url:
            domain_in_url = domain_in_url.group(1).lower()
            if domain_in_url.startswith("www."):
                domain_in_url = domain_in_url[4:]
            if domain_matches(domain, domain_in_url):
                return True, url, f"{domain} と一致するドメインが検索結果に見つかりました: {domain_in_url}"
        found_domains.add(domain_in_url)
    logger.warning(f"No official page found for domain {domain} in the search results")
    return False, None, f"{domain} を含むWebページが見つかりませんでした。検索結果: {', '.join(found_domains)}"


async def search_email_evidence(email: str, logger=None) -> tuple[bool, str | None, str]:
    """
    メールアドレスの証拠をウェブ検索で探します。

    Args:
        email (str): 検証するメールアドレス
        logger: ログ記録用のロガーオブジェクト (省略可能)

    Returns:
        Tuple[bool, Optional[str], str]: (検証結果, 証拠URL, 詳細メッセージ)
    """
    if not logger:
        logger = logging.getLogger("app")

    logger.info(f"Searching for email evidence: {email}")

    # メールアドレスのドメイン部分を優先ドメインとして使用
    email_domain = email.split("@")[1] if "@" in email else None
    preferred_domain = email_domain

    search_result = get_search_response(f'"{email}"', num_results=5, preferred_domain=preferred_domain)
    email_local_part = email.split("@")[0]

    if search_result is None:
        logger.error("Failed to fetch search results")
        return False, None, "Web検索結果の取得に失敗しました"

    for result in search_result:
        if not result:
            continue
        url = result.get("link")
        if not url:
            continue
        page_content = await fetch_with_playwright(url, False)
        if not page_content:
            logger.warning(f"Failed to fetch content from {url}")
            continue

        if len(page_content) >= MAX_PAGE_LENGTH:
            page_content = page_content[:MAX_PAGE_LENGTH]

        # メールアドレスのパターン（@が他の文字に置き換わっている可能性を考慮して、最大8文字まで許容）
        email_pattern = rf"{re.escape(email_local_part)}.{{1,8}}{re.escape(email_domain)}"

        target_mail_is_included = bool(re.search(email_pattern, page_content, re.IGNORECASE))

        if target_mail_is_included:
            logger.info(f"Email {email} found in the page content of {url}")
            # テキストフラグメントをURLに追加
            email_evidence_url = add_text_fragment_to_url(url, email_local_part)
            return True, email_evidence_url, "メールアドレスの記載されているWebページ"
    logger.warning(f"Email {email} not found in any page content")
    return False, None, f"{email} に関連するWebページを見つけることができませんでした"


async def verify_with_researcher_page(
    email: str,
    researcher_name_en: str,
    researcher_name_jp: str,
    organization_name_en: str,
    organization_name_jp: str,
    logger=None,
) -> dict[str, Any]:
    """
    研究者の履歴やメールアドレスがWeb検索で確認できるかを検証します。

    Args:
        email (str): 検証するメールアドレス
        researcher_name_en (str): 研究者の英語名
        researcher_name_jp (str): 研究者の日本語名
        organization_name_en (str): 研究者の所属機関の英語名
        organization_name_jp (str): 研究者の所属機関の日本語名
        logger: ログ記録用のロガーオブジェクト (省略可能)

    Returns:
        Dict[str, Any]: 検証結果を含む辞書
        - email_verified (bool): メールアドレスが確認できたか
        - email_evidence_url (Optional[str]): メールアドレスの証拠URL
        - email_message (str): メールアドレスの検証メッセージ
        - email_last_updated_year (Optional[str]): メールアドレスの最終更新年
        - researcher_verified (bool): 研究者の所属が確認できたか
        - researcher_evidence_url (Optional[str]): 研究者の所属の証拠URL
        - researcher_message (str): 研究者の所属の検証メッセージ
        - researcher_last_updated_year (Optional[str]): 研究者の所属の最終更新年
        - orcid_url (Optional[str]): 研究者のORCID URL（存在する場合）
    """
    if not logger:
        logger = logging.getLogger("app")

    email_verified = False
    email_evidence_url = None
    email_message = None
    email_last_updated_year = None
    profile_url = None
    profile_message = None
    profile_url_is_official = False
    researcher_last_updated_year = None

    if researcher_name_en and organization_name_en:
        orcid_url = f"https://orcid.org/orcid-search/search?searchQuery=%22{researcher_name_en}%22%20%22{organization_name_en}%22"
    else:
        orcid_url = None

    logger.info(f"Searching ORCID for researcher: {researcher_name_en or researcher_name_jp}")

    logger.info(f"Verifying with researcher's page: {email}")
    if researcher_name_jp and organization_name_jp:
        researcher_query = f"{researcher_name_jp} AND {organization_name_jp}"
        email_query = f"{researcher_name_jp} AND {email}"
    else:
        researcher_query = f"{researcher_name_en} AND {organization_name_en}"
        email_query = f"{researcher_name_en} AND {email}"

    minimum_result_count = 5

    logger.info(f"Search researcher_query: {researcher_query}")
    researcher_search_result = get_search_response(researcher_query, num_results=minimum_result_count)

    logger.info(f"Search email_query: {email_query}")
    # メールアドレスを含むクエリの場合、メールドメインを優先ドメインとして使用
    email_domain = email.split("@")[1] if "@" in email else None
    email_search_result = get_search_response(
        email_query, num_results=minimum_result_count, preferred_domain=email_domain
    )

    if researcher_search_result is None and email_search_result is None:
        logger.error("Failed to fetch search results")
        return {
            "email_verified": False,
            "email_evidence_url": None,
            "email_message": "Web検索結果の取得に失敗しました",
            "email_last_updated_year": None,
            "researcher_verified": False,
            "researcher_evidence_url": None,
            "researcher_message": "Web検索結果の取得に失敗しました",
            "researcher_last_updated_year": None,
            "orcid_url": orcid_url,
        }

    if researcher_search_result is None:
        search_result = email_search_result
    elif email_search_result is None:
        search_result = researcher_search_result
    else:
        search_result = researcher_search_result + email_search_result
    if len(search_result) < minimum_result_count:
        researcher_only_query = researcher_name_jp if researcher_name_jp else researcher_name_en
        logger.info(f"Not enough results found, searching with researcher name only: {researcher_only_query}")
        additional_search_result = get_search_response(researcher_only_query, num_results=minimum_result_count)
        if additional_search_result is not None:
            search_result += additional_search_result

    current_year = str(datetime.datetime.now().year)

    for result in search_result:
        if not result:
            continue
        url = result.get("link")
        if not url:
            continue

        url_domain_part = re.search(r"https?://([^/]+)", url)
        if not url_domain_part:
            logger.warning(f"Failed to extract domain from URL: {url}")
            domain_in_url = None
        else:
            domain_in_url = url_domain_part.group(1).lower()

        if domain_in_url and any(
            (domain in domain_in_url or domain_in_url in domain) for domain in BLACKLISTED_DOMAINS
        ):
            logger.info(f"Skipping blacklisted domain: {domain_in_url}")
            continue

        page_content = await fetch_with_playwright(url, False)
        if not page_content:
            logger.warning(f"Failed to fetch content from {url}")
            continue

        logger.info(f"Fetched content from {url}, length: {len(page_content)}")

        if len(page_content) >= MAX_PAGE_LENGTH:
            page_content = page_content[:MAX_PAGE_LENGTH]

        class OrganizationCheckResult(BaseModel):
            including_researcher_name_with_organizaiton: bool = Field(
                False, description="Whether the page indicates that the researcher is affiliated with the organization"
            )
            last_updated_year: str | None = Field(
                None, description="The last year when the page content was updated, if available"
            )

        profile_check_result = await extract_output_from_openai(
            load_prompt(
                "email_affiliation_check.txt",
                researcher_name_en=researcher_name_en,
                researcher_name_jp=researcher_name_jp,
                organization_name_en=organization_name_en,
                organization_name_jp=organization_name_jp,
                url=url,
                page_content=page_content,
            ),
            OrganizationCheckResult,
        )

        if not profile_check_result:
            logger.warning(f"Failed to extract profile check result from OpenAI for {url}")
            continue

        # ドメインを見て、組織の公式ページかどうかを確認する。
        is_official_page = domain_matches(domain_in_url, email_domain)

        if profile_check_result.including_researcher_name_with_organizaiton:
            is_latest = (
                not profile_url
                or profile_check_result.last_updated_year
                and researcher_last_updated_year
                and researcher_last_updated_year < profile_check_result.last_updated_year
                or not researcher_last_updated_year
                and profile_check_result.last_updated_year == current_year
            )
            if not profile_url or is_official_page and (not profile_url_is_official or is_latest):
                logger.info(f"Affiliation page found (last updated: {profile_check_result.last_updated_year}) : {url}")

                profile_url = url
                if researcher_name_en or researcher_name_jp:
                    fragments = []
                    if researcher_name_en:
                        fragments.extend(researcher_name_en.split())
                    if researcher_name_jp:
                        jp_fragments = researcher_name_jp.split()
                        if len(jp_fragments) == 1:
                            # 分割できない場合は、強制的に2文字ずつに分割
                            jp_fragments = [jp_fragments[0][i : i + 2] for i in range(0, len(jp_fragments[0]), 2)]
                            # 最後のフラグメントが1文字だけの場合、前のフラグメントと結合して２文字にする
                            if len(jp_fragments[-1]) == 1 and len(jp_fragments) > 1:
                                jp_fragments[-1] = jp_fragments[-2][-1] + jp_fragments[-1]
                        fragments.extend(jp_fragments)

                    if fragments:
                        profile_url = add_text_fragment_to_url(profile_url, *fragments)

                profile_url_is_official = is_official_page

                if profile_check_result.last_updated_year:
                    researcher_last_updated_year = profile_check_result.last_updated_year

        if profile_url and profile_url_is_official:
            break

    class EmailCheckResult(BaseModel):
        email_found: bool = Field(False, description="Whether the email address is found on the page")
        email_reason: str = Field(
            "",
            description="The reason or context in which the email address was found. The reason should be in Japanese.",
        )
        last_updated_year: str | None = Field(
            None, description="The last year when the page content was updated, if available"
        )

    task_instruction = load_prompt(
        "email_address_check.txt",
        email=email,
        email_domain=email_domain,
        researcher_name=researcher_name_jp if researcher_name_jp else researcher_name_en,
        organization_name=organization_name_jp if organization_name_jp else organization_name_en,
    )

    result, email_evidence_urls = await extract_output_from_genai(
        prompt=task_instruction, output_model=EmailCheckResult, logger=logger
    )
    if not result:
        return {
            "email_verified": False,
            "email_evidence_url": None,
            "email_message": "メールアドレスの確認に失敗しました",
            "email_last_updated_year": None,
            "researcher_verified": profile_url is not None,
            "researcher_evidence_url": profile_url,
            "researcher_message": profile_message,
            "researcher_last_updated_year": researcher_last_updated_year,
            "orcid_url": orcid_url,
        }
    email_evidence_url = email_evidence_urls[0] if email_evidence_urls else None
    if email_evidence_url:
        # URLにテキストフラグメントを追加
        email_evidence_url = add_text_fragment_to_url(email_evidence_url, email.split("@")[0])

    if not email_evidence_url:
        email_message = f"メールアドレス {email} に関連する研究者のWebページを確認できませんでした"
    email_verified = result.email_found
    email_message = result.email_reason
    email_last_updated_year = result.last_updated_year

    profile_message = "研究者の所属情報が確認されました" if profile_url else "所属情報が見つかりませんでした"

    return {
        "email_verified": email_verified,
        "email_evidence_url": email_evidence_url,
        "email_message": email_message,
        "email_last_updated_year": email_last_updated_year,
        "researcher_verified": profile_url is not None,
        "researcher_evidence_url": profile_url,
        "researcher_message": profile_message,
        "researcher_last_updated_year": researcher_last_updated_year,
        "orcid_url": orcid_url,
    }


async def verify_email_mx_records(email: str, logger=None) -> tuple[bool, str]:
    """
    DNSpythonを使用してメールアドレスのドメインにMXレコードが存在するか確認します。

    Args:
        email: 検証するメールアドレス
        task_id: タスクID (ログ記録用)

    Returns:
        Tuple[bool, str]: (検証結果, 詳細メッセージ)
    """
    # ロガーの設定
    if not logger:
        logger = logging.getLogger("app")

    try:
        # メールアドレスの基本的な検証
        if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
            return False, "無効なメールアドレス形式です"

        # ドメイン部分を抽出
        domain = email.split("@")[-1]

        logger.info(f"Checking MX records for domain: {domain}")

        try:
            # MXレコードの取得を試みる
            mx_records = dns.resolver.resolve(domain, "MX")

            if mx_records:
                mx_hosts = [rdata.exchange.to_text() for rdata in mx_records]
                logger.info(f"MX records found for {domain}: {mx_hosts}")
                return True, f"ドメイン {domain} に有効なMXレコードが見つかりました: {', '.join(mx_hosts)}"
            return False, f"ドメイン {domain} にMXレコードが見つかりませんでした"

        except dns.resolver.NoAnswer:
            logger.warning(f"No MX records for domain: {domain}")
            return False, f"ドメイン {domain} にMXレコードがありません"

        except dns.resolver.NXDOMAIN:
            logger.warning(f"Domain {domain} does not exist")
            return False, f"ドメイン {domain} は存在しません"

        except dns.exception.DNSException as e:
            logger.exception(f"DNS error for {domain}")
            return False, f"ドメイン {domain} のDNSエラー: {str(e)}"

    except Exception as e:
        logger.exception("Error checking MX records")
        return False, f"MXレコードの確認中にエラーが発生しました: {str(e)}"


async def verify_organization_legal_entity(
    organization_name_jp: str | None, organization_name_en: str | None, logger=None
) -> tuple[str | None, list[str] | None, str | None]:
    """
    所属機関の法人格をWeb検索で調べる。

    Returns:
        Tuple[Optional[str], Optional[list[str]], Optional[str]]: (法人格, 根拠URLリスト, 判断根拠メッセージ)
    """
    if not logger:
        logger = logging.getLogger("app")

    if not organization_name_jp and not organization_name_en:
        return None, None, "所属機関名が提供されていません"

    logger.info(f"Verifying organization legal entity: {organization_name_jp or organization_name_en}")

    class OrganizationLegalEntityResult(BaseModel):
        legal_entity_type: str | None = Field(
            None, description="所属機関の法人格（例: 国立大学法人、学校法人など）。不明の場合はNone"
        )
        reason: str = Field(..., description="判断根拠の日本語での説明")
        referenced_urls: list[str] = Field(default_factory=list, description="法人格の判断の根拠となるURLのリスト")

    task_instruction = load_prompt(
        "organization_legal_entity_check.txt",
        organization_name_jp=organization_name_jp or "",
        organization_name_en=organization_name_en or "",
    )

    result, _ = await extract_output_from_genai(
        prompt=task_instruction, output_model=OrganizationLegalEntityResult, logger=logger
    )

    if not result:
        return None, None, "法人格の確認に失敗しました"

    reference_urls = result.referenced_urls if result.referenced_urls else []
    reference_original_urls = [await retrieve_original_url(url) for url in reference_urls]
    reference_original_urls = [
        add_text_fragment_to_url(url, result.legal_entity_type)
        for url in reference_original_urls
        if "vertexaisearch.cloud.google.com" not in url
    ]

    return result.legal_entity_type, reference_original_urls, result.reason


if __name__ == "__main__":
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(description="Email validation script")
    parser.add_argument("email", type=str, help="Email address to validate")
    parser.add_argument("name_en", type=str, help="Researcher's name in English")
    parser.add_argument("name_jp", type=str, help="Researcher's name in Japanese")
    parser.add_argument("organization_en", type=str, help="Organization's name in English")
    parser.add_argument("organization_jp", type=str, help="Organization's name in Japanese")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    loop = asyncio.get_event_loop()
    researcher_info = PersonalInfo(
        **vars(args),
    )
    result = loop.run_until_complete(validate_email(researcher_info))
    print(f"検証結果: {result.model_dump_json(indent=2)}")
