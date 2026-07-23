# models.py

from typing import Any, Literal

from pydantic import BaseModel, Field


class PaperInfo(BaseModel):
    title: str | None = Field(..., description="Title of the paper")
    doi: str | None = Field(None, description="DOI of the paper, if available")
    pmid: str | None = Field(None, description="PubMed ID of the paper, if available")


class EthicsDocumentInfo(BaseModel):
    """倫理関係書類から抽出される情報"""

    institution_head_position: str | None = Field(None, description="所属機関長の役職")
    institution_name: str | None = Field(None, description="所属機関名")
    research_project_title_jp: str | None = Field(None, description="研究プロジェクトのタイトル")
    research_project_title_en: str | None = Field(None, description="研究プロジェクトのタイトル（英語）")
    approval_period_start: str | None = Field(None, description="研究許可期間の開始日")
    approval_period_end: str | None = Field(None, description="研究許可期間の終了日")


class PersonalInfo(BaseModel):
    name_jp: str | None = Field(..., description="Name of the person in Japanese")
    name_en: str | None = Field(..., description="Name of the person in English")
    title_jp: str | None = Field(None, description="Title of the person in Japanese, if available")
    title_en: str | None = Field(None, description="Title of the person in English, if available")
    organization_jp: str | None = Field(..., description="organization of the person in Japanese")
    organization_en: str | None = Field(None, description="organization of the person in English")
    email: str = Field(..., description="Email address of the person")
    phone: str | None = Field(None, description="Phone number of the person, if available")
    address: str | None = Field(None, description="Address of the person, if available")


class AddressComponent(BaseModel):
    """住所コンポーネント"""

    long_name: str
    short_name: str
    types: list[str]


class GeocodeResult(BaseModel):
    """ジオコード結果"""

    formatted_address: str
    components: list[AddressComponent]
    location: dict[str, float]  # {"lat": float, "lng": float}
    location_type: str
    place_id: str
    country_code: str


class AddressValidationResult(BaseModel):
    """住所検証結果"""

    address_exists: bool = Field(..., description="Whether the address exists")
    in_english: bool | None = Field(False, description="Whether the address is in English")
    country_code: str | None = Field(None, description="Country code of the verified address")
    formatted_address: str | None = Field(None, description="Formatted address from the validation service")
    organization_match: Literal["一致", "関連あり", "不一致"] | None = Field(
        None,
        description="住所と所属機関の関係性（一致/関連あり/不一致）",
    )
    organization_distance_km: float | None = Field(None, description="Distance to organization in kilometers")
    address_geocode: GeocodeResult | None = Field(None, description="Geocode result of the address")
    organization_geocode: GeocodeResult | None = Field(None, description="Geocode result of the organization")
    message: str = Field(..., description="Validation message")
    google_map_urls: list[tuple[str, str, str]] = Field(
        None, description="Google Maps URLs for the address. Each tuple contains (url, title, place_id)"
    )


class PhoneValidationResult(BaseModel):
    country_code: str | None = Field(None, description="Country code of the verified phone number")
    country_code_matched_with_address: bool = Field(
        False, description="Whether the phone number's country code matches the address"
    )
    country_code_message: str | None = Field(
        None, description="Message regarding the country code verification, if available"
    )
    judge_about_cell_phone: str = Field(None, description="Judgment about whether the phone number is a cell phone")
    related_to_researcher_or_organization: bool = Field(
        False, description="Whether the phone number is related to the researcher or organization"
    )
    researcher_phone_url: str | None = Field(None, description="URL of the researcher's phone page, if available")
    researcher_phone_message: str | None = Field(
        None, description="Message regarding the researcher's phone verification, if available"
    )
    researcher_phone_last_updated_year: str | None = Field(
        None, description="Last updated year of the researcher's phone page, if available"
    )
    corrected_phone_number: str | None = Field(
        None,
        description="Formatted phone number, if the original number cannot be used from Japan (mainly because of international access code)",
    )


class ResearchPlanConsistencyCheckResult(BaseModel):
    researcher_name_is_included: bool = Field(
        ..., description="研究計画に申請書に記載された研究代表者の名前が含まれているか"
    )
    researcher_name_message: str | None = Field(
        ..., description="researcher_name_is_includedの根拠が計画書のどこに含まれているかを示すメッセージ"
    )
    researcher_affiliation_matches: str = Field(
        ...,
        description='申請書に記載されている研究代表者の所属機関・部署名・役職が、研究計画書の表記と一致しているか。空白文字の有無を除いて判定する。完全に一致している場合は"full_match"、意味的には同じで表記が異なる場合は"similar"、全く異なる場合は"no_match"を返すこと',
    )
    researcher_affiliation_message: str | None = Field(
        ...,
        description="researcher_affiliation_matchesの判断根拠に関するメッセージ。",
    )
    research_title_matches: bool = Field(
        ...,
        description="研究計画書に記載された研究題目が申請書の題目と一致するか。どちらか一方のみが記載されている場合は、記載されているものの一致のみを確認すればよい。",
    )
    research_title_message: str | None = Field(
        ...,
        description="research_title_matchesの判断に関するメッセージ。異なる場合には、どのように異なるかを記載すること。",
    )


class ResearchPlanExtractionResult(BaseModel):
    public_db_use_description: list[str] = Field(
        ...,
        description="公共データベースの利用に関する記載内容。NBDCのデータベースに関する言及は除くこと。複数の記載がある場合はすべて抽出し、該当がない場合は空リストとすること。",
    )
    data_retention_description: list[str] = Field(
        ...,
        description="データの保存期間や保存場所、廃棄に関する記載内容。複数の記載がある場合はすべて抽出し、該当がない場合は空リストとすること。",
    )
    outsourcing_description: list[str] = Field(
        ...,
        description="解析の外部実施や委託に関する記載内容。複数の記載がある場合はすべて抽出し、該当がない場合は空リストとすること。",
    )
    cloud_use_description: list[str] = Field(
        ...,
        description="データ保管のためのクラウドサービス利用に関する記載内容。クラウドサービスの利用が無いと判断される場合は空リストとすること。",
    )
    joint_research_description: list[str] = Field(
        ...,
        description="共同研究先の記載内容。該当がない場合は空リストとすること。",
    )


class ResearchPlanValidationResult(ResearchPlanExtractionResult, ResearchPlanConsistencyCheckResult):
    """研究計画書の検証結果"""

    pass


class HeadOfInstitutionVerificationResult(BaseModel):
    """所属機関長の役職検証結果"""

    position_verified: bool = Field(..., description="Whether the head of institution's position is verified")
    position_evidence_url: str | None = Field(None, description="Evidence URL for the position verification")
    position_message: str = Field(..., description="Message regarding the position verification")
    current_position_holder: str | None = Field(None, description="Current position holder found from web search")
    search_query_used: str | None = Field(None, description="Search query used for verification")


class EthicsDocumentLLMValidationResult(BaseModel):
    research_title_matches: bool = Field(
        ...,
        description="倫理関係書類に記載された研究題目が申請書の題目と一致するか。和名と英名が両方記載されている場合は、両方とも完全に一致しているかを確認すること。",
    )
    research_title_message: str | None = Field(
        ...,
        description="research_title_matchesの判断に関する判断根拠を記載するメッセージ。異なる場合には、どのように異なるかを記載すること。",
    )


class EthicsDocumentValidationResult(EthicsDocumentLLMValidationResult):
    institution_head_position_verification_result: HeadOfInstitutionVerificationResult | None = Field(
        None, description="Result of the head of institution position verification"
    )


class ChecklistItemResult(BaseModel):
    key: str = Field(..., description="チェック項目のキー")
    description: str = Field(..., description="チェック項目の説明")
    status: Literal["ok", "warning", "alert"] = Field(..., description="チェック結果のステータス")
    message: str | None = Field(None, description="チェック結果の補足メッセージ")


class SubmissionApplicationFormData(BaseModel):
    contact_email_consent: bool = Field(None, description="メールアドレスの連絡先としての使用への同意が明記されている")
    email_consent_message: str | None = Field(
        None,
        description="メールアドレスの連絡先としての使用に同意がある場合は同意に関する記載の文面、同意がない場合は判断根拠を記載したメッセージ",
    )
    provided_data_purpose_jp: str | None = Field(None, description="提供データの目的（日本語）")
    provided_data_purpose_en: str | None = Field(None, description="提供データの目的（英語）")
    provided_data_purpose_matches: bool | None = Field(
        None,
        description="提供データの目的が日本語と英語で意味的に完全一致している",
    )
    provided_data_purpose_diff: str | None = Field(
        None, description="一致していない場合、どちらか一方にのみ含まれる表現の差分を記載すること"
    )
    provided_data_target_jp: str | None = Field(None, description="提供データの対象（日本語）")
    provided_data_target_en: str | None = Field(None, description="提供データの対象（英語）")
    provided_data_target_matches: bool | None = Field(
        None,
        description="提供データの対象が日本語と英語で意味的に完全一致している",
    )
    provided_data_target_diff: str | None = Field(
        None, description="一致していない場合、どちらか一方にのみ含まれる表現の差分を記載すること"
    )
    provided_data_method_jp: str | None = Field(None, description="提供データの方法（日本語）")
    provided_data_method_en: str | None = Field(None, description="提供データの方法（英語）")
    provided_data_method_matches: bool | None = Field(
        None,
        description="提供データの方法が日本語と英語で意味的に完全一致している",
    )
    provided_data_method_diff: str | None = Field(
        None, description="一致していない場合、どちらか一方にのみ含まれる表現の差分を記載すること"
    )
    icd10_code_list: list[str] = Field(default_factory=list, description="ICD-10分類コード（1つ以上）")
    icd10_target_relevance: bool | None = Field(None, description="ICD-10コードと提供データの対象が関連しているか")
    icd10_target_relevance_message: str | None = Field(
        None, description="ICD-10コードと提供データの対象の関連性に関するメッセージ"
    )
    publication_title: str | None = Field(
        None, description="発表論文のタイトル（未定・ハイフンも含め記載内容をそのまま抽出すること）"
    )
    data_restrictions_jp: str | None = Field(None, description="データの種類および量の制限事項（日本語）")
    data_restrictions_en: str | None = Field(None, description="データの種類および量の制限事項（英語）")
    data_restrictions_matches: bool | None = Field(
        None, description="データの種類および量の制限事項が日本語と英語で意味的に一致している"
    )
    data_type: str | None = Field(None, description=" Type of dataの値")
    data_type_is_unrestricted: bool | None = Field(None, description="Type of dataが「非制限」を含むかどうか")
    projected_release_date: str | None = Field(None, description="データ公開予定日")
    type_of_study: str | None = Field(None, description="Type of studyの値")
    target_region_is_limited: bool = Field(
        None,
        description="Type of studyがTarget CaptureやVisium解析など、解析対象の領域が限定されていると判断されるかどうか",
    )
    target_region: str | None = Field(None, description="対象領域（解析対象の領域が限定されている場合）")
    file_format: str = Field(None, description="ファイル形式")
    total_data_amount: str | None = Field(None, description="総データ量")
    total_data_amount_is_valid: bool = Field(None, description="総データ量が数値＋単位で記載されているか")
    guidelines_confirmation: str | None = Field(None, description="NBDCガイドライン確認状況")
    research_title_jp: str | None = Field(None, description="提供データを取得した研究題目（日本語）")
    research_title_en: str | None = Field(None, description="提供データを取得した研究題目（英語）")
    research_title_matches: bool | None = Field(
        None, description="提供データを取得した研究題目が日本語と英語で一致している"
    )
    anonymization_status: str | None = Field(None, description="データの匿名化の実施についての選択")
    ethics_review_status: str | None = Field(None, description="データ提供に関する倫理審査の状況")
    private_company_use: str | None = Field(None, description="民間企業でのデータ利用についての承諾")
    multi_center_data_provision: str | None = Field(None, description="多施設共同研究からのデータ提供についての選択")
    dbcls_ddbj_processing: str | None = Field(None, description="DBCLS/DDBJでのデータ加工についての承諾")


class SubmissionApplicationCheckResult(BaseModel):
    items: list[ChecklistItemResult] = Field(default_factory=list, description="提供申請チェック結果一覧")


class EmailDomainConsistencyResult(BaseModel):
    """3者間のメールドメイン整合性チェック結果"""

    all_match: bool = Field(..., description="Whether all email domains match")
    summary: str = Field(..., description="Summary of the domain consistency check (e.g., '全員一致', '不一致あり')")
    researcher_domain: str | None = Field(None, description="Email domain of the researcher")
    submitter_domain: str | None = Field(None, description="Email domain of the submitter")
    head_of_institution_domain: str | None = Field(None, description="Email domain of the head of institution")
    researcher_submitter_match: bool | None = Field(
        None, description="Whether researcher and submitter email domains match"
    )
    researcher_head_match: bool | None = Field(
        None, description="Whether researcher and head of institution email domains match"
    )
    submitter_head_match: bool | None = Field(
        None, description="Whether submitter and head of institution email domains match"
    )
    details: list[str] = Field(default_factory=list, description="Detailed comparison results for each pair")


class PhoneConsistencyResult(BaseModel):
    """3者間の電話番号整合性チェック結果"""

    all_match: bool = Field(..., description="Whether all phone numbers match (exact or area code)")
    summary: str = Field(..., description="Summary of the consistency check (e.g., '全員完全一致', '全員市外局番一致')")
    researcher_area_code: str | None = Field(None, description="Area code of researcher's phone number")
    submitter_area_code: str | None = Field(None, description="Area code of submitter's phone number")
    head_of_institution_area_code: str | None = Field(
        None, description="Area code of head of institution's phone number"
    )
    researcher_submitter_match: str | None = Field(
        None, description="Match type between researcher and submitter: 'exact_match', 'area_code_match', or 'no_match'"
    )
    researcher_head_match: str | None = Field(
        None,
        description="Match type between researcher and head of institution: 'exact_match', 'area_code_match', or 'no_match'",
    )
    submitter_head_match: str | None = Field(
        None,
        description="Match type between submitter and head of institution: 'exact_match', 'area_code_match', or 'no_match'",
    )
    details: list[str] = Field(default_factory=list, description="Detailed comparison results for each pair")
    head_phone_is_different_from_others: bool | None = Field(
        None, description="Whether the head of institution's phone number is different from the other two"
    )
    head_phone_is_representative_number: bool | None = Field(
        None,
        description="Whether the head of institution's phone number is the representative number of the organization",
    )


class ResearcherVerificationResult(BaseModel):
    mx_domain_verified: bool = Field(..., description="Whether the MX domain of the email is verified")
    mx_domain_failure_reason: str | None = Field(None, description="Reason for MX domain failure, if any")
    organization_domain_verified: bool = Field(
        ..., description="Whether the email domain matches the organization domain"
    )
    organization_domain_message: str | None = Field(
        None, description="Message regarding the organization domain verification, if available"
    )
    organization_domain_evidence_url: str | None = Field(
        None, description="Evidence URL for the organization domain verification, if available"
    )
    researcher_email_verified: bool = Field(..., description="Whether the email is verified with the researcher's page")
    researcher_email_evidence_url: str | None = Field(
        None, description="Evidence URL for the researcher's page verification, if available"
    )
    researcher_email_message: str | None = Field(
        None, description="Message regarding the researcher's page verification, if available"
    )
    researcher_profile_url: str | None = Field(None, description="URL of the researcher's profile page, if available")
    researcher_profile_message: str | None = Field(
        None, description="Message regarding the researcher's profile verification, if available"
    )
    researcher_profile_last_updated: str | None = Field(
        None, description="Last updated date of the researcher's profile, if available"
    )
    orcid_url: str | None = Field(None, description="ORCID URL of the researcher")
    address_validation_result: AddressValidationResult | None = Field(None, description="Result of address validation")
    phone_validation_result: PhoneValidationResult | None = Field(None, description="Result of phone number validation")
    email_address_is_different_from_others: bool | None = Field(
        None, description="Whether the email address is different from other parties (only for head of institution)"
    )
    organization_legal_entity_type: str | None = Field(
        None, description="所属機関の法人格（例: 国立大学法人、学校法人、株式会社など）"
    )
    organization_legal_entity_urls: list[str] | None = Field(None, description="所属機関の法人格の根拠となるURLリスト")
    organization_legal_entity_message: str | None = Field(None, description="所属機関の法人格の判断根拠")


class DataSetInfo(BaseModel):
    dataset_id: str = Field(..., description="ID of the dataset")
    purpose: str = Field(..., description="Purpose of the dataset usage")


class ResearchAbstractSentencePair(BaseModel):
    pair_id: str | None = Field(None, description="Stable identifier for a pair of aligned sentences")
    source_sentence: str = Field(..., description="Original English sentence from the research abstract")
    translated_sentence: str = Field(..., description="Japanese translation aligned to the source sentence")


class ResearchAbstractTranslation(BaseModel):
    translated_abstract: str = Field(..., description="Full Japanese translation of the research abstract")
    sentence_pairs: list[ResearchAbstractSentencePair] = Field(
        default_factory=list,
        description="Aligned sentence pairs between the original abstract and its Japanese translation",
    )


class ResearchAbstractSentenceTranslationList(BaseModel):
    translated_sentences: list[str] = Field(
        default_factory=list,
        description="Japanese translated sentences aligned by index to the input English sentence list",
    )


class ApplicationData(BaseModel):
    application_id: str = Field(..., description="ID of the application")
    form_language: str | None = Field(None, description="Language of application form (ja/en)")

    researcher_info: PersonalInfo = Field(
        ..., description="Information about the researcher including name, organization, email, and phone number"
    )

    submitter_info: PersonalInfo = Field(
        ...,
        description="Information about the application submitter including name, organization, email, and phone number",
    )

    head_of_institution_info: PersonalInfo = Field(
        ..., description="Information about the head of institution including name, email, and phone number"
    )

    dataset_info_list: list[DataSetInfo] = Field(..., description="List of datasets with their usage purposes")
    analysis_method: str = Field(
        ...,
        description="Analysis method used in the research. e.g. 'Whole genome sequencing', 'RNA-Seq', 'Single-cell RNA-Seq', 'Metagenomics', 'Proteomics', 'Metabolomics', 'Epigenomics', 'Transcriptomics', 'Genotyping arrays'",
    )
    related_paper_list: list[PaperInfo] = Field(
        ...,
        description="List of related papers with their PubMed IDs, DOI or titles. For each paper, at least one of the fields should be available. e.g. [{'doi': '10.1234/abcd', 'title': 'Study on XYZ'}, {'pmid': '12345678', 'title': 'Another Study'}, {'title': 'Study without DOI or PMID'}]",
    )
    research_title_jp: str | None = Field(
        None,
        description="Title of the study in Japanese for which the researcher would like to use the datasets. Extract as-is from the application form.",
    )
    research_title_en: str | None = Field(
        None,
        description="Title of the study in English for which the researcher would like to use the datasets. Extract as-is from the application form.",
    )
    research_abstract: str = Field(
        ...,
        description="Summary of the study for which the researcher would like to use the datasets. Extract as-is from the application form.",
    )
    research_purpose: str = Field(..., description="Purpose of the requested dataset usage in Japanese")
    period_of_data_use_end: str | None = Field(
        None, description="End date of the period of data use as specified in the application"
    )


class ApplicationVerificationData(ApplicationData):
    application_type: str = Field(..., description="Type of application (e.g., 利用申請, 提供申請)")

    research_abstract_translation: ResearchAbstractTranslation | None = Field(
        None,
        description="Japanese translation of the research abstract with sentence-level alignment when the original abstract is in English",
    )

    researcher_verification_result: ResearcherVerificationResult = Field(
        ..., description="Result of the researcher information verification"
    )

    submitter_verification_result: ResearcherVerificationResult = Field(
        ..., description="Result of the submitter information verification"
    )

    head_of_institution_verification_result: ResearcherVerificationResult = Field(
        ..., description="Result of the head of institution information verification"
    )

    ethics_document: EthicsDocumentInfo | None = Field(
        None, description="Information about the ethics document if provided"
    )

    ethics_file_path: str | None = Field(None, description="File path of the ethics document if provided")

    research_plan_path: str | None = Field(None, description="File path of the research plan document if provided")

    researcher_history: str | None = Field(None, description="Investigation result of the researcher's history")
    researcher_history_urls: list[str] | None = Field(
        None, description="URLs used for the researcher's history investigation"
    )

    phone_consistency_result: PhoneConsistencyResult | None = Field(
        None,
        description="Result of phone number consistency check among researcher, submitter, and head of institution",
    )

    email_domain_consistency_result: EmailDomainConsistencyResult | None = Field(
        None,
        description="Result of email domain consistency check among researcher, submitter, and head of institution",
    )

    research_plan_validation_result: ResearchPlanValidationResult | None = Field(
        None, description="Result of the research plan validation against the application data"
    )

    ethics_document_validation_result: EthicsDocumentValidationResult | None = Field(
        None, description="Result of the ethics document validation against the application data"
    )

    submission_application_check_result: SubmissionApplicationCheckResult | None = Field(
        None, description="Checklist result for submission-application-only items"
    )


class DatasetAPIRetrievalResult(BaseModel):
    study_id_list: list[str] = Field(..., description="List of study(JGAS) IDs associated with the dataset")
    study_id_list_from_ddbj: list[str] = Field(
        default_factory=list, description="List of study(JGAS) IDs retrieved from DDBJ search API"
    )
    hum_id_list_from_ddbj: list[str] = Field(
        default_factory=list, description="List of humID values retrieved from DDBJ search API"
    )
    hum_id: str = Field(..., description="Corresponding humID of the dataset")
    info_dict: dict[str, Any] = Field(..., description="Information about the dataset")


class DatasetAnalysisResult(BaseModel):
    id: str = Field(..., description="ID of the dataset")
    found_in_database: bool = Field(description="Whether the dataset was found in the database", default=True)
    icd10_code_list: list[str] = Field(
        ...,
        description="ICD-10 code related to the dataset. If not available, it will be empty.",
    )
    purpose_similarity_icd10: tuple[str, str] | None = Field(
        ...,
        description="Similarity of the dataset purpose to the research purpose based on ICD-10 matching. If similar, it contains the matched ICD-10 code pair.",
    )
    paper_similarity: str = Field(..., description="Similarity of the dataset paper to the research paper")
    paper_similarity_reason: str = Field(..., description="Reason for the dataset paper similarity")
    paper_similarity_icd10: tuple[str, str] | None = Field(
        ...,
        description="Similarity of the dataset paper to the research paper based on ICD-10 matching. If similar, it contains the matched ICD-10 code pair.",
    )
    analysis_method_similarity: str = Field(
        ..., description="Similarity of the analysis method to the research analysis"
    )
    analysis_method_similarity_reason: str = Field(..., description="Reason for the analysis method similarity")
    analysis_method_list: list[str] = Field(..., description="List of analysis methods used in the research")
    url: str = Field(..., description="URL of the dataset")
    dataset_api_retrieval_result: DatasetAPIRetrievalResult | None = Field(
        None, description="Dataset API retrieval result"
    )


class ResearchInfo(BaseModel):
    title: str = Field(..., description="Title of the research paper")
    summary_jp: str | None | None = Field(None, description="Summary of the research contribution in Japanese")
    paper_id: str | None = Field(..., description="id of the paper")
    authors: list[str] = Field(..., description="List of authors of the paper")
    abstract: str = Field(..., description="Abstract of the paper")
    url: str = Field(..., description="URL of the paper")
    handles_human_data: bool | None = Field(None, description="Whether the paper handles human data")
    human_data_reason: str | None = Field(
        None,
        description="Reason for the human-data judgment in Japanese",
    )
    human_data_evidence: str | None = Field(
        None,
        description="Evidence excerpt used to judge that the paper handles human data",
    )
    icd10_code_list: list[str] = Field(
        ...,
        description="ICD-10 code related to the research. If not available, it will be empty.",
    )
    analysis_method_list: list[str] | None | None = Field(
        ...,
        description="List of analysis methods in Japanese used in the research. Each element is a string representing the method name. e.g. ['手法1', '手法2']",
    )


class AssessmentResult(BaseModel):
    dataset_summary: list[dict[str, Any]] = Field(..., description="Summary of the datasets")
    related_studies: list[str] = Field(..., description="Summary of related studies")
    assessment: str = Field(..., description="Assessment of the application compatibility")


# Models for LLM structured output
class DataSetSummary(BaseModel):
    id: str = Field(..., description="データセットのID")
    description: str = Field(..., description="データセットの説明")
    icd10_code_list: list[str] = Field(..., description="データセットに関連するICD-10コード")
    analysis_method_list: list[str] = Field(
        ..., description="データセット作成に用いられた解析手法。各要素は手法名の文字列。例: ['手法1', '手法2']"
    )


class Similarity(BaseModel):
    similarity: bool = Field(
        ..., description="Indicates whether there is a similarity between the two items. True if similar, False if not."
    )
    reason: str = Field(..., description="Reason for the similarity in Japanese.")


class ICD10TargetRelevance(BaseModel):
    """ICD10コードと提供データの対象の関連性判定結果"""

    is_relevant: bool = Field(
        ...,
        description="ICD-10コードと提供データの対象が関連しているかどうか。関連している場合はTrue、関連していない場合はFalse。",
    )
    reason: str = Field(..., description="関連性の判定理由を日本語で記載。")


class ICD10Suggestion(BaseModel):
    icd10_code_list: list[str] = Field(..., description="ICD-10 codes suggested by OpenAI")


class ResearchInfoSuggestionResult(ICD10Suggestion):
    summary_jp: str = Field(..., description="Summary of the research contribution in Japanese")
    analysis_method_list: list[str] = Field(
        ...,
        description="List of analysis methods in Japanese used in the research. Each element is a string representing the method name. e.g. ['手法1', '手法2']",
    )
    handles_human_data: bool = Field(..., description="Whether the paper handles human data")
    human_data_reason: str | None = Field(
        None,
        description="判断理由を日本語で簡潔に記述。ヒトデータを扱っているか否かにかかわらず必ず記述すること。",
    )
    evidence_excerpt: str | None = Field(
        None,
        description="Excerpt from title/abstract supporting the human-data judgment. Return empty string when not applicable.",
    )


class PaperInfoExtractionResult(BaseModel):
    title: str = Field(..., description="Title of the paper")
    authors: list[str] = Field(..., description="List of authors of the paper")
    abstract: str = Field(..., description="Abstract of the paper")
    url: str = Field(..., description="URL of the paper")
