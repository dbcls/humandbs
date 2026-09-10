import type {
  AssessmentData,
  ChecklistItem,
  Person,
  Task,
  TaskDetail,
  VerificationResult,
} from "./admin-assistant-model"

export function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined
  return Object.fromEntries(Object.entries(value))
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function flag(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function texts(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined
}

export function field(
  object: Record<string, unknown>,
  name: string,
): string | undefined {
  return text(object[name])
}

function person(value: unknown): Person | undefined {
  const valueRecord = record(value)
  if (valueRecord === undefined) return undefined
  return {
    name_jp: field(valueRecord, "name_jp"),
    name_en: field(valueRecord, "name_en"),
    title_jp: field(valueRecord, "title_jp"),
    title_en: field(valueRecord, "title_en"),
    organization_jp: field(valueRecord, "organization_jp"),
    organization_en: field(valueRecord, "organization_en"),
    email: field(valueRecord, "email"),
    phone: field(valueRecord, "phone"),
    address: field(valueRecord, "address"),
  }
}

function verification(value: unknown): VerificationResult | undefined {
  const valueRecord = record(value)
  if (valueRecord === undefined) return undefined
  const phone = record(valueRecord.phone_validation_result)
  const address = record(valueRecord.address_validation_result)
  const maps = Array.isArray(address?.google_map_urls)
    ? address.google_map_urls.flatMap((item) => {
        if (Array.isArray(item) && typeof item[0] === "string")
          return [{ url: item[0], label: text(item[1]) }]
        const link = record(item)
        const url = link === undefined ? undefined : field(link, "url")
        if (url === undefined || link === undefined) return []
        return [{ url, label: field(link, "label") }]
      })
    : undefined
  return {
    mx_domain_verified: flag(valueRecord.mx_domain_verified),
    mx_domain_failure_reason: field(valueRecord, "mx_domain_failure_reason"),
    organization_domain_verified: flag(
      valueRecord.organization_domain_verified,
    ),
    organization_domain_message: field(
      valueRecord,
      "organization_domain_message",
    ),
    organization_domain_evidence_url: field(
      valueRecord,
      "organization_domain_evidence_url",
    ),
    researcher_email_verified: flag(valueRecord.researcher_email_verified),
    researcher_email_evidence_url: field(
      valueRecord,
      "researcher_email_evidence_url",
    ),
    researcher_email_message: field(valueRecord, "researcher_email_message"),
    researcher_profile_url: field(valueRecord, "researcher_profile_url"),
    researcher_profile_message: field(
      valueRecord,
      "researcher_profile_message",
    ),
    researcher_profile_last_updated: field(
      valueRecord,
      "researcher_profile_last_updated",
    ),
    orcid_url: field(valueRecord, "orcid_url"),
    organization_legal_entity_type: field(
      valueRecord,
      "organization_legal_entity_type",
    ),
    organization_legal_entity_urls: texts(
      valueRecord.organization_legal_entity_urls,
    ),
    organization_legal_entity_message: field(
      valueRecord,
      "organization_legal_entity_message",
    ),
    email_address_is_different_from_others: flag(
      valueRecord.email_address_is_different_from_others,
    ),
    phone_validation_result:
      phone === undefined
        ? undefined
        : {
            country_code_matched_with_address: flag(
              phone.country_code_matched_with_address,
            ),
            country_code_message: field(phone, "country_code_message"),
            judge_about_cell_phone: field(phone, "judge_about_cell_phone"),
            related_to_researcher_or_organization: flag(
              phone.related_to_researcher_or_organization,
            ),
            researcher_phone_url: field(phone, "researcher_phone_url"),
            researcher_phone_message: field(phone, "researcher_phone_message"),
            researcher_phone_last_updated_year: field(
              phone,
              "researcher_phone_last_updated_year",
            ),
            corrected_phone_number: field(phone, "corrected_phone_number"),
          },
    address_validation_result:
      address === undefined
        ? undefined
        : {
            address_exists: flag(address.address_exists),
            formatted_address: field(address, "formatted_address"),
            organization_match: field(address, "organization_match"),
            message: field(address, "message"),
            google_map_urls: maps,
          },
  }
}

function checks(value: unknown): ChecklistItem[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((item) => {
    const itemRecord = record(item)
    if (itemRecord === undefined) return []
    const description = field(itemRecord, "description")
    const status = field(itemRecord, "status")
    if (
      description === undefined
      || (status !== "ok" && status !== "warning" && status !== "alert")
    )
      return []
    return [{ description, status, message: field(itemRecord, "message") }]
  })
}

function consistency(
  value: unknown,
): AssessmentData["phone_consistency_result"] {
  const valueRecord = record(value)
  if (valueRecord === undefined) return undefined
  return {
    all_match: flag(valueRecord.all_match),
    summary: field(valueRecord, "summary"),
    details: texts(valueRecord.details),
    head_phone_is_different_from_others: flag(
      valueRecord.head_phone_is_different_from_others,
    ),
    head_phone_is_representative_number: flag(
      valueRecord.head_phone_is_representative_number,
    ),
    head_phone_difference_message: field(
      valueRecord,
      "head_phone_difference_message",
    ),
  }
}

function papers(value: unknown): AssessmentData["papers"] {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((item) => {
    const itemRecord = record(item)
    if (itemRecord === undefined) return []
    const title = field(itemRecord, "title")
    if (title === undefined) return []
    return [
      {
        title,
        summary_jp: field(itemRecord, "summary_jp"),
        url: field(itemRecord, "url"),
        icd10_code_list: texts(itemRecord.icd10_code_list),
        handles_human_data: flag(itemRecord.handles_human_data),
        human_data_reason: field(itemRecord, "human_data_reason"),
        human_data_evidence: field(itemRecord, "human_data_evidence"),
      },
    ]
  })
}

function requestedDatasets(
  value: unknown,
): AssessmentData["dataset_info_list"] {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((item) => {
    const itemRecord = record(item)
    if (itemRecord === undefined) return []
    const dataset_id = field(itemRecord, "dataset_id")
    return dataset_id === undefined
      ? []
      : [{ dataset_id, purpose: field(itemRecord, "purpose") }]
  })
}

function policies(value: unknown): AssessmentData["dataset_policy_groups"] {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((item) => {
    const itemRecord = record(item)
    if (itemRecord === undefined) return []
    const policy_text = field(itemRecord, "policy_text")
    const dataset_ids = texts(itemRecord.dataset_ids)
    return policy_text === undefined || dataset_ids === undefined
      ? []
      : [{ policy_text, dataset_ids }]
  })
}

export function decodeTask(value: unknown, fallbackTaskId?: string): Task | undefined {
  const valueRecord = record(value)
  if (valueRecord === undefined) return undefined
  const taskId = field(valueRecord, "task_id") ?? fallbackTaskId
  const status = field(valueRecord, "status")
  if (
    taskId === undefined
    || (status !== "processing"
      && status !== "completed"
      && status !== "error"
      && status !== "pending")
  )
    return undefined
  return {
    task_id: taskId,
    status,
    created_at: field(valueRecord, "created_at"),
    updated_at: field(valueRecord, "updated_at"),
    application_type: field(valueRecord, "application_type"),
  }
}

export function decodeTaskDetail(
  value: unknown,
  fallbackTaskId: string,
): TaskDetail | undefined {
  const valueRecord = record(value)
  const taskValue = decodeTask(value, fallbackTaskId)
  if (valueRecord === undefined || taskValue === undefined) return undefined
  return {
    ...taskValue,
    filename: field(valueRecord, "filename"),
    assessment_data: decodeAssessment(valueRecord.assessment_data) ?? null,
    error: field(valueRecord, "error"),
    message: field(valueRecord, "message"),
  }
}

export function decodeAssessment(value: unknown): AssessmentData | undefined {
  const valueRecord = record(value)
  if (valueRecord === undefined) return undefined
  const translation = record(valueRecord.abstract_translation)
  const plan = record(valueRecord.research_plan_validation_result)
  const ethics = record(valueRecord.ethics_document_info)
  const ethicsValidation = record(valueRecord.ethics_document_validation_result)
  const position = record(
    ethicsValidation?.institution_head_position_verification_result,
  )
  const datasets = Array.isArray(valueRecord.dataset_analysis_list)
    ? valueRecord.dataset_analysis_list.flatMap((item) => {
        const itemRecord = record(item)
        if (itemRecord === undefined) return []
        const id = field(itemRecord, "id")
        if (id === undefined) return []
        const retrieval = record(itemRecord.dataset_api_retrieval_result)
        return [
          {
            id,
            found_in_database: flag(itemRecord.found_in_database),
            url: field(itemRecord, "url"),
            icd10_code_list: texts(itemRecord.icd10_code_list),
            purpose_similarity_icd10: texts(
              itemRecord.purpose_similarity_icd10,
            ),
            paper_similarity_icd10: texts(itemRecord.paper_similarity_icd10),
            analysis_method_similarity: field(
              itemRecord,
              "analysis_method_similarity",
            ),
            analysis_method_similarity_reason: field(
              itemRecord,
              "analysis_method_similarity_reason",
            ),
            analysis_method_list: texts(itemRecord.analysis_method_list),
            paper_similarity: field(itemRecord, "paper_similarity"),
            paper_similarity_reason: field(
              itemRecord,
              "paper_similarity_reason",
            ),
            dataset_api_retrieval_result:
              retrieval === undefined
                ? undefined
                : {
                    hum_id: field(retrieval, "hum_id"),
                    hum_id_list_from_ddbj: texts(
                      retrieval.hum_id_list_from_ddbj,
                    ),
                    study_id_list: texts(retrieval.study_id_list),
                    study_id_list_from_ddbj: texts(
                      retrieval.study_id_list_from_ddbj,
                    ),
                  },
          },
        ]
      })
    : undefined
  return {
    application_id: field(valueRecord, "application_id"),
    title: field(valueRecord, "title"),
    abstract: field(valueRecord, "abstract"),
    abstract_translation:
      translation === undefined
        ? undefined
        : { translated_abstract: field(translation, "translated_abstract") },
    abstract_sentence_pairs: Array.isArray(valueRecord.abstract_sentence_pairs)
      ? valueRecord.abstract_sentence_pairs.flatMap((item) => {
          const pair = record(item)
          return pair === undefined
            ? []
            : [
                {
                  pair_id: field(pair, "pair_id"),
                  source_sentence: field(pair, "source_sentence"),
                  translated_sentence: field(pair, "translated_sentence"),
                },
              ]
        })
      : undefined,
    abstract_icd10_list: texts(valueRecord.abstract_icd10_list),
    application_analysis_method: field(
      valueRecord,
      "application_analysis_method",
    ),
    paper_analysis_method_list: texts(valueRecord.paper_analysis_method_list),
    researcher_info: person(valueRecord.researcher_info),
    submitter_info: person(valueRecord.submitter_info),
    head_of_institution_info: person(valueRecord.head_of_institution_info),
    researcher_verification_result: verification(
      valueRecord.researcher_verification_result,
    ),
    submitter_verification_result: verification(
      valueRecord.submitter_verification_result,
    ),
    head_of_institution_verification_result: verification(
      valueRecord.head_of_institution_verification_result,
    ),
    phone_consistency_result: consistency(valueRecord.phone_consistency_result),
    email_domain_consistency_result: consistency(
      valueRecord.email_domain_consistency_result,
    ),
    submission_application_check_result: {
      items: checks(
        record(valueRecord.submission_application_check_result)?.items,
      ),
    },
    research_plan_validation_result:
      plan === undefined
        ? undefined
        : {
            researcher_name_is_included: flag(plan.researcher_name_is_included),
            researcher_name_message: field(plan, "researcher_name_message"),
            researcher_affiliation_matches: field(
              plan,
              "researcher_affiliation_matches",
            ),
            researcher_affiliation_message: field(
              plan,
              "researcher_affiliation_message",
            ),
            research_title_matches: flag(plan.research_title_matches),
            research_title_message: field(plan, "research_title_message"),
            public_db_use_description: texts(plan.public_db_use_description),
            data_retention_description: texts(plan.data_retention_description),
            outsourcing_description: texts(plan.outsourcing_description),
            cloud_use_description: texts(plan.cloud_use_description),
          },
    ethics_document_info:
      ethics === undefined
        ? undefined
        : {
            research_project_title_jp: field(
              ethics,
              "research_project_title_jp",
            ),
            research_project_title_en: field(
              ethics,
              "research_project_title_en",
            ),
            approval_period_start: field(ethics, "approval_period_start"),
            approval_period_end: field(ethics, "approval_period_end"),
            institution_name: field(ethics, "institution_name"),
            institution_head_position: field(
              ethics,
              "institution_head_position",
            ),
          },
    ethics_document_validation_result:
      ethicsValidation === undefined
        ? undefined
        : {
            research_title_matches: flag(
              ethicsValidation.research_title_matches,
            ),
            research_title_message: field(
              ethicsValidation,
              "research_title_message",
            ),
            institution_head_position_verification_result:
              position === undefined
                ? undefined
                : {
                    position_verified: flag(position.position_verified),
                    position_evidence_url: field(
                      position,
                      "position_evidence_url",
                    ),
                    position_message: field(position, "position_message"),
                    current_position_holder: field(
                      position,
                      "current_position_holder",
                    ),
                  },
          },
    papers: papers(valueRecord.papers),
    dataset_analysis_list: datasets,
    dataset_info_list: requestedDatasets(valueRecord.dataset_info_list),
    dataset_policy_groups: policies(valueRecord.dataset_policy_groups),
    period_of_data_use_end: field(valueRecord, "period_of_data_use_end"),
  }
}
