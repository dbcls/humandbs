import type { messagesFor } from "~/i18n/messages"

export type AssistantWords = ReturnType<typeof messagesFor>["admin"]["assistant"]

export type Status = "processing" | "completed" | "error" | "pending"

export interface Task {
  task_id: string
  status: Status
  created_at?: string
  updated_at?: string
  application_type?: string
}

export interface TaskDetail extends Task {
  filename?: string
  assessment_data?: AssessmentData | null
  error?: string
  message?: string
}

export interface Person {
  name_jp?: string | null
  name_en?: string | null
  title_jp?: string | null
  title_en?: string | null
  organization_jp?: string | null
  organization_en?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
}

export interface Link {
  url: string
  label?: string | null
}

export interface PhoneVerification {
  country_code_matched_with_address?: boolean | null
  country_code_message?: string | null
  judge_about_cell_phone?: string | null
  related_to_researcher_or_organization?: boolean | null
  researcher_phone_url?: string | null
  researcher_phone_message?: string | null
  researcher_phone_last_updated_year?: string | null
  corrected_phone_number?: string | null
}

export interface AddressVerification {
  address_exists?: boolean | null
  formatted_address?: string | null
  organization_match?: string | null
  message?: string | null
  google_map_urls?: (readonly [string, string, string] | Link)[]
}

export interface VerificationResult {
  mx_domain_verified?: boolean | null
  mx_domain_failure_reason?: string | null
  organization_domain_verified?: boolean | null
  organization_domain_message?: string | null
  organization_domain_evidence_url?: string | null
  researcher_email_verified?: boolean | null
  researcher_email_evidence_url?: string | null
  researcher_email_message?: string | null
  researcher_profile_url?: string | null
  researcher_profile_message?: string | null
  researcher_profile_last_updated?: string | null
  orcid_url?: string | null
  organization_legal_entity_type?: string | null
  organization_legal_entity_urls?: string[] | null
  organization_legal_entity_message?: string | null
  email_address_is_different_from_others?: boolean | null
  phone_validation_result?: PhoneVerification | null
  address_validation_result?: AddressVerification | null
}

export interface PersonValidation {
  person: Person | undefined
  verification: VerificationResult | undefined
}

export interface ChecklistItem {
  description: string
  status: "ok" | "warning" | "alert"
  message?: string | null
}

export interface EthicsDocument {
  research_project_title_jp?: string | null
  research_project_title_en?: string | null
  approval_period_start?: string | null
  approval_period_end?: string | null
  institution_name?: string | null
  institution_head_position?: string | null
}

export interface PositionVerification {
  position_verified?: boolean | null
  position_evidence_url?: string | null
  position_message?: string | null
  current_position_holder?: string | null
}

export interface EthicsValidation {
  research_title_matches?: boolean | null
  research_title_message?: string | null
  institution_head_position_verification_result?: PositionVerification | null
}

export interface ResearchPlanValidation {
  researcher_name_is_included?: boolean | null
  researcher_name_message?: string | null
  researcher_affiliation_matches?: string | null
  researcher_affiliation_message?: string | null
  research_title_matches?: boolean | null
  research_title_message?: string | null
  public_db_use_description?: string[] | null
  data_retention_description?: string[] | null
  outsourcing_description?: string[] | null
  cloud_use_description?: string[] | null
}

export interface DatasetApiRetrieval {
  hum_id?: string | null
  hum_id_list_from_ddbj?: string[] | null
  study_id_list?: string[] | null
  study_id_list_from_ddbj?: string[] | null
}

export interface DatasetAnalysis {
  id: string
  found_in_database?: boolean | null
  url?: string | null
  icd10_code_list?: string[] | null
  purpose_similarity_icd10?: string[] | null
  paper_similarity_icd10?: string[] | null
  analysis_method_similarity?: string | null
  analysis_method_similarity_reason?: string | null
  analysis_method_list?: string[] | null
  paper_similarity?: string | null
  paper_similarity_reason?: string | null
  dataset_api_retrieval_result?: DatasetApiRetrieval | null
}

export interface RequestedDataset {
  dataset_id: string
  purpose?: string | null
}

export interface AssessmentData {
  application_id?: string | null
  title?: string
  abstract?: string
  abstract_translation?: {
    translated_abstract?: string | null
  } | null
  abstract_sentence_pairs?: {
    pair_id?: string | null
    source_sentence?: string | null
    translated_sentence?: string | null
  }[]
  abstract_icd10_list?: string[] | null
  application_analysis_method?: string | null
  paper_analysis_method_list?: string[] | null
  researcher_info?: Person
  submitter_info?: Person
  head_of_institution_info?: Person
  researcher_verification_result?: VerificationResult
  submitter_verification_result?: VerificationResult
  head_of_institution_verification_result?: VerificationResult
  phone_consistency_result?: {
    all_match?: boolean | null
    summary?: string
    details?: string[] | null
    head_phone_is_different_from_others?: boolean | null
    head_phone_is_representative_number?: boolean | null
    head_phone_difference_message?: string | null
  } | null
  email_domain_consistency_result?: {
    all_match?: boolean | null
    summary?: string
    details?: string[] | null
  } | null
  submission_application_check_result?: { items?: ChecklistItem[] } | null
  research_plan_validation_result?: ResearchPlanValidation | null
  ethics_document_info?: EthicsDocument | null
  ethics_document_validation_result?: EthicsValidation | null
  papers?: {
    title: string
    summary_jp?: string | null
    url?: string | null
    icd10_code_list?: string[] | null
    handles_human_data?: boolean | null
    human_data_reason?: string | null
    human_data_evidence?: string | null
  }[]
  dataset_analysis_list?: DatasetAnalysis[]
  dataset_info_list?: RequestedDataset[]
  dataset_policy_groups?: {
    dataset_ids: string[]
    policy_text: string
  }[]
  period_of_data_use_end?: string | null
}
