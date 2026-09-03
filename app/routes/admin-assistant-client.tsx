import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react"

import { assistantApiPath } from "~/admin/urls"
import { Button, ButtonLink, Fold, Note, Stack } from "~/components/base"
import { Icon } from "~/components/icons"
import {
  Card,
  Empty,
  KeyValue,
  Pairs,
  Section,
  Table,
  Td,
} from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

type Status = "processing" | "completed" | "error" | "pending"

interface Task {
  task_id: string
  status: Status
  created_at?: string
  updated_at?: string
  application_type?: string
}

interface TaskDetail extends Task {
  filename?: string
  assessment_data?: AssessmentData | null
  error?: string
  message?: string
}

interface Person {
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

interface Link {
  url: string
  label?: string | null
}

interface PhoneVerification {
  country_code_matched_with_address?: boolean | null
  country_code_message?: string | null
  judge_about_cell_phone?: string | null
  related_to_researcher_or_organization?: boolean | null
  researcher_phone_url?: string | null
  researcher_phone_message?: string | null
  researcher_phone_last_updated_year?: string | null
  corrected_phone_number?: string | null
}

interface AddressVerification {
  address_exists?: boolean | null
  formatted_address?: string | null
  organization_match?: string | null
  message?: string | null
  google_map_urls?: (readonly [string, string, string] | Link)[]
}

interface VerificationResult {
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

interface PersonValidation {
  person: Person | undefined
  verification: VerificationResult | undefined
}

interface ChecklistItem {
  description: string
  status: "ok" | "warning" | "alert"
  message?: string | null
}

interface EthicsDocument {
  research_project_title_jp?: string | null
  research_project_title_en?: string | null
  approval_period_start?: string | null
  approval_period_end?: string | null
  institution_name?: string | null
  institution_head_position?: string | null
}

interface PositionVerification {
  position_verified?: boolean | null
  position_evidence_url?: string | null
  position_message?: string | null
  current_position_holder?: string | null
}

interface EthicsValidation {
  research_title_matches?: boolean | null
  research_title_message?: string | null
  institution_head_position_verification_result?: PositionVerification | null
}

interface ResearchPlanValidation {
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

interface DatasetApiRetrieval {
  hum_id?: string | null
  hum_id_list_from_ddbj?: string[] | null
  study_id_list?: string[] | null
  study_id_list_from_ddbj?: string[] | null
}

interface DatasetAnalysis {
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

interface RequestedDataset {
  dataset_id: string
  purpose?: string | null
}

interface AssessmentData {
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

function record(value: unknown): Record<string, unknown> | undefined {
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

function field(
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

function task(value: unknown, fallbackTaskId?: string): Task | undefined {
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

function taskDetail(
  value: unknown,
  fallbackTaskId: string,
): TaskDetail | undefined {
  const valueRecord = record(value)
  const taskValue = task(value, fallbackTaskId)
  if (valueRecord === undefined || taskValue === undefined) return undefined
  return {
    ...taskValue,
    filename: field(valueRecord, "filename"),
    assessment_data: assessment(valueRecord.assessment_data) ?? null,
    error: field(valueRecord, "error"),
    message: field(valueRecord, "message"),
  }
}

function assessment(value: unknown): AssessmentData | undefined {
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

function errorMessage(response: Response, fallback: string): Promise<string> {
  return response
    .json()
    .then((body: { detail?: unknown }) =>
      typeof body.detail === "string" ? body.detail : fallback,
    )
    .catch(() => fallback)
}

function formatTime(value: string | undefined, locale: Locale): string {
  if (value === undefined) return "-"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(locale === "ja" ? "ja-JP" : "en-GB")
}

function statusClass(status: Status): string {
  if (status === "completed") return "text-ink-muted"
  if (status === "error") return "text-danger"
  if (status === "pending") return "text-warning"
  return "text-brand"
}

export function AssistantContents({ locale }: { locale: Locale }) {
  const words = messagesFor(locale).admin.assistant
  const [application, setApplication] = useState<File | null>(null)
  const [ethics, setEthics] = useState<File | null>(null)
  const [plan, setPlan] = useState<File | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [selected, setSelected] = useState<TaskDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const selectedTaskId = useRef<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean, text: string } | null>(
    null,
  )

  const loadDetail = useCallback(async (taskId: string) => {
    const response = await fetch(
      assistantApiPath(`applications/${encodeURIComponent(taskId)}`),
    )
    if (!response.ok)
      throw new Error(await errorMessage(response, words.loadFailed))
    const detail = taskDetail(await response.json(), taskId)
    if (detail === undefined) throw new Error(words.loadFailed)
    selectedTaskId.current = taskId
    setSelected(detail)
    setTasks((previous) =>
      previous.map((task) =>
        task.task_id === taskId ? { ...task, ...detail } : task,
      ),
    )
  }, [words.loadFailed])

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(assistantApiPath("applications"))
      if (!response.ok)
        throw new Error(await errorMessage(response, words.loadFailed))
      const body = record(await response.json())
      const next = Array.isArray(body?.tasks)
        ? body.tasks.flatMap((value) => {
            const parsed = task(value)
            return parsed === undefined ? [] : [parsed]
          })
        : []
      setTasks(next)
      if (selectedTaskId.current === null && next[0] !== undefined)
        await loadDetail(next[0].task_id)
    } catch (error) {
      setNotice({
        ok: false,
        text: error instanceof Error ? error.message : words.loadFailed,
      })
    } finally {
      setLoading(false)
    }
  }, [loadDetail, words.loadFailed])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTasks()
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [loadTasks])

  useEffect(() => {
    if (selected?.status !== "processing" && selected?.status !== "pending")
      return
    const timer = window.setInterval(() => {
      void loadDetail(selected.task_id).catch((error: unknown) => {
        setNotice({
          ok: false,
          text: error instanceof Error ? error.message : words.loadFailed,
        })
      })
    }, 5000)
    return () => {
      window.clearInterval(timer)
    }
  }, [loadDetail, selected?.task_id, selected?.status, words.loadFailed])

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (application === null) {
      setNotice({ ok: false, text: words.applicationRequired })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const form = new FormData()
      form.set("application_file", application)
      if (ethics !== null) form.set("ethics_file", ethics)
      if (plan !== null) form.set("research_plan_file", plan)
      const response = await fetch(assistantApiPath("applications"), {
        method: "POST",
        body: form,
      })
      if (!response.ok)
        throw new Error(await errorMessage(response, words.uploadFailed))
      const body = record(await response.json())
      const taskId = body === undefined ? undefined : field(body, "task_id")
      if (taskId === undefined) throw new Error(words.uploadFailed)
      setApplication(null)
      setEthics(null)
      setPlan(null)
      await loadTasks()
      await loadDetail(taskId)
      setNotice({ ok: true, text: words.queued(taskId) })
    } catch (error) {
      setNotice({
        ok: false,
        text: error instanceof Error ? error.message : words.uploadFailed,
      })
    } finally {
      setBusy(false)
    }
  }

  const reanalyze = async () => {
    if (selected === null) return
    setBusy(true)
    setNotice(null)
    try {
      const response = await fetch(
        assistantApiPath(
          `applications/${encodeURIComponent(selected.task_id)}/reanalyze`,
        ),
        { method: "POST" },
      )
      if (!response.ok)
        throw new Error(await errorMessage(response, words.reanalyzeFailed))
      await loadDetail(selected.task_id)
      await loadTasks()
      setNotice({ ok: true, text: words.reanalyzing })
    } catch (error) {
      setNotice({
        ok: false,
        text: error instanceof Error ? error.message : words.reanalyzeFailed,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack gap="block">
      {notice !== null && (
        <Note kind={notice.ok ? "done" : "danger"} live>
          {notice.text}
        </Note>
      )}
      <Card under={false}>
        <form onSubmit={(event) => { void submit(event) }}>
          <Stack>
            <Section title={words.uploadHeading}>
              <div className="grid gap-4 sm:grid-cols-3">
                <FileInput
                  label={words.applicationFile}
                  required
                  file={application}
                  disabled={busy}
                  onChange={setApplication}
                />
                <FileInput
                  label={words.ethicsFile}
                  file={ethics}
                  disabled={busy}
                  onChange={setEthics}
                />
                <FileInput
                  label={words.planFile}
                  file={plan}
                  disabled={busy}
                  onChange={setPlan}
                />
              </div>
            </Section>
            <div>
              <Button
                variant="primary"
                disabled={busy}
                icon={(
                  <Icon
                    name={busy ? "spinner" : "upload"}
                    className={busy ? "animate-spin" : ""}
                  />
                )}
              >
                {busy ? words.uploading : words.upload}
              </Button>
            </div>
          </Stack>
        </form>
      </Card>
      <Card under={false}>
        <Stack>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-brand text-lg">
              {words.listHeading}
            </h2>
            <Button
              type="button"
              icon={<Icon name="undo" />}
              disabled={loading}
              onClick={() => {
                void loadTasks()
              }}
            >
              {words.refresh}
            </Button>
          </div>
          {loading && tasks.length === 0
            ? (
                <Empty>{words.loading}</Empty>
              )
            : tasks.length === 0
              ? (
                  <Empty>{words.none}</Empty>
                )
              : (
                  <Table
                    headers={[
                      words.taskId,
                      words.applicationType,
                      words.status,
                      words.updated,
                    ]}
                  >
                    {tasks.map((task) => (
                      <tr
                        key={task.task_id}
                        className={
                          selected?.task_id === task.task_id ? "bg-surface-hover" : ""
                        }
                      >
                        <Td nowrap>
                          <button
                            type="button"
                            onClick={() => {
                              void loadDetail(task.task_id).catch((error: unknown) => {
                                setNotice({
                                  ok: false,
                                  text:
                              error instanceof Error
                                ? error.message
                                : words.loadFailed,
                                })
                              },
                              )
                            }}
                            className="cursor-pointer text-left font-mono text-brand underline"
                          >
                            {task.task_id}
                          </button>
                        </Td>
                        <Td>{task.application_type ?? "-"}</Td>
                        <Td>
                          <span className={statusClass(task.status)}>
                            {words.statuses[task.status]}
                          </span>
                        </Td>
                        <Td>
                          {formatTime(task.updated_at ?? task.created_at, locale)}
                        </Td>
                      </tr>
                    ))}
                  </Table>
                )}
        </Stack>
      </Card>
      {selected !== null && (
        <TaskDetailView
          detail={selected}
          locale={locale}
          busy={busy}
          onReanalyze={() => {
            void reanalyze()
          }}
        />
      )}
    </Stack>
  )
}

function FileInput({
  label,
  required = false,
  file,
  disabled,
  onChange,
}: {
  label: string
  required?: boolean
  file: File | null
  disabled: boolean
  onChange: (file: File | null) => void
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-semibold text-ink-muted text-xs">{label}</span>
      <input
        type="file"
        accept="application/pdf"
        required={required}
        disabled={disabled}
        onChange={(event) => { onChange(event.target.files?.[0] ?? null) }}
        className="text-sm file:mr-3 file:cursor-pointer file:rounded file:border file:border-brand file:bg-white file:px-3 file:py-1 file:text-brand"
      />
      {file !== null && (
        <span className="truncate text-ink-muted text-xs">{file.name}</span>
      )}
    </label>
  )
}

function TaskDetailView({
  detail,
  locale,
  busy,
  onReanalyze,
}: {
  detail: TaskDetail
  locale: Locale
  busy: boolean
  onReanalyze: () => void
}) {
  const words = messagesFor(locale).admin.assistant
  const pdf
    = detail.filename === undefined
      ? null
      : assistantApiPath(`uploads/${encodeURIComponent(detail.filename)}`)
  const handout = assistantApiPath(
    `applications/${encodeURIComponent(detail.task_id)}/handout`,
  )
  const word = assistantApiPath(
    `applications/${encodeURIComponent(detail.task_id)}/handout/word`,
  )
  return (
    <Card under={false}>
      <Stack>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-brand text-lg">
            {words.detailHeading(detail.task_id)}
          </h2>
          <span className={`${statusClass(detail.status)} text-sm`}>
            {words.statuses[detail.status]}
          </span>
        </div>
        <Pairs>
          <KeyValue title={words.created}>
            {formatTime(detail.created_at, locale)}
          </KeyValue>
          <KeyValue title={words.updated}>
            {formatTime(detail.updated_at, locale)}
          </KeyValue>
        </Pairs>
        {detail.message !== undefined && <Note>{detail.message}</Note>}
        {detail.error !== undefined && (
          <Note kind="danger">{detail.error}</Note>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={
              busy
              || detail.status === "processing"
              || detail.status === "pending"
            }
            onClick={() => {
              onReanalyze()
            }}
            icon={<Icon name="undo" />}
          >
            {words.reanalyze}
          </Button>
          {pdf !== null && (
            <ButtonLink to={pdf} external newTab icon={<Icon name="eye" />}>
              {words.openPdf}
            </ButtonLink>
          )}
          {detail.status === "completed" && (
            <>
              <ButtonLink
                to={handout}
                external
                newTab
                icon={<Icon name="eye" />}
              >
                {words.handout}
              </ButtonLink>
              <ButtonLink to={word} external icon={<Icon name="download" />}>
                {words.downloadWord}
              </ButtonLink>
            </>
          )}
        </div>
        {detail.assessment_data !== null
          && detail.assessment_data !== undefined && (
          <AssistantReport
            report={detail.assessment_data}
            words={words}
            applicationType={detail.application_type}
          />
        )}
      </Stack>
    </Card>
  )
}

function AssistantReport({
  report,
  words,
  applicationType,
}: {
  report: AssessmentData
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
  applicationType: string | undefined
}) {
  const sameEmail
    = report.researcher_info?.email !== undefined
      && report.researcher_info.email !== ""
      && report.researcher_info.email === report.submitter_info?.email
  return (
    <Fold summary={words.assessment}>
      <Stack>
        {report.application_id !== undefined
          && report.application_id !== null && (
          <Section title={words.applicationId}>
            <p className="font-mono text-sm">{report.application_id}</p>
          </Section>
        )}
        {report.title !== undefined && (
          <Section title={words.researchTitle}>
            <p className="text-sm">{report.title}</p>
          </Section>
        )}
        {report.period_of_data_use_end !== undefined
          && report.period_of_data_use_end !== null && (
          <Section title={words.dataUseEnd}>
            <p className="text-sm">{report.period_of_data_use_end}</p>
          </Section>
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          <PersonReport
            title={words.researcher}
            validation={{
              person: report.researcher_info,
              verification: report.researcher_verification_result,
            }}
            words={words}
          />
          {sameEmail
            ? (
                <Section title={words.submitter}>
                  <p className="text-sm">{words.sameAsResearcher}</p>
                </Section>
              )
            : (
                <PersonReport
                  title={words.submitter}
                  validation={{
                    person: report.submitter_info,
                    verification: report.submitter_verification_result,
                  }}
                  words={words}
                />
              )}
          <PersonReport
            title={words.institutionHead}
            validation={{
              person: report.head_of_institution_info,
              verification: report.head_of_institution_verification_result,
            }}
            positionVerification={
              report.ethics_document_validation_result
                ?.institution_head_position_verification_result
            }
            isInstitutionHead
            words={words}
          />
        </div>
        <ConsistencyReport
          title={words.phoneConsistency}
          result={report.phone_consistency_result}
          people={[
            [words.researcher, report.researcher_info?.phone],
            [words.submitter, report.submitter_info?.phone],
            [words.institutionHead, report.head_of_institution_info?.phone],
          ]}
          words={words}
        />
        <ConsistencyReport
          title={words.emailConsistency}
          result={report.email_domain_consistency_result}
          people={[
            [words.researcher, report.researcher_info?.email],
            [words.submitter, report.submitter_info?.email],
            [words.institutionHead, report.head_of_institution_info?.email],
          ]}
          words={words}
        />
        {applicationType?.includes("提供") === true && (
          <Checklist
            title={words.submissionChecks}
            items={report.submission_application_check_result?.items}
            words={words}
          />
        )}
        {report.ethics_document_info !== undefined
          && report.ethics_document_info !== null
          && hasEthicsDocument(report.ethics_document_info) && (
          <Section title={words.ethicsDocument}>
            <Pairs>
              <KeyValue title={words.researchTitle}>
                {joinFields(
                  report.ethics_document_info.research_project_title_jp,
                  report.ethics_document_info.research_project_title_en,
                  words,
                )}
              </KeyValue>
              <KeyValue title={words.organization}>
                {display(report.ethics_document_info.institution_name, words)}
              </KeyValue>
              <KeyValue title={words.position}>
                {display(
                  report.ethics_document_info.institution_head_position,
                  words,
                )}
              </KeyValue>
              <KeyValue title={words.dataUseEnd}>
                {range(
                  report.ethics_document_info.approval_period_start,
                  report.ethics_document_info.approval_period_end,
                  words,
                )}
              </KeyValue>
            </Pairs>
            <ValidationChecklist
              title={words.ethicsChecks}
              checks={[
                {
                  description: words.ethicsTitleMatches,
                  result:
                      report.ethics_document_validation_result
                        ?.research_title_matches,
                  message:
                      report.ethics_document_validation_result
                        ?.research_title_message,
                },
                {
                  description: words.headPositionVerification,
                  result:
                      report.ethics_document_validation_result
                        ?.institution_head_position_verification_result
                        ?.position_verified,
                  message:
                      report.ethics_document_validation_result
                        ?.institution_head_position_verification_result
                        ?.position_message,
                  evidence:
                      report.ethics_document_validation_result
                        ?.institution_head_position_verification_result
                        ?.position_evidence_url,
                },
              ]}
              words={words}
            />
          </Section>
        )}
        {report.research_plan_validation_result !== undefined
          && report.research_plan_validation_result !== null && (
          <Section title={words.researchPlan}>
            <ValidationChecklist
              title={words.researchPlanChecks}
              checks={[
                {
                  description: words.researcherNameInPlan,
                  result:
                      report.research_plan_validation_result
                        .researcher_name_is_included,
                  message:
                      report.research_plan_validation_result
                        .researcher_name_message,
                },
                {
                  description: words.researcherAffiliationInPlan,
                  result: planAffiliationMatches(
                    report.research_plan_validation_result
                      .researcher_affiliation_matches,
                  ),
                  message:
                      report.research_plan_validation_result
                        .researcher_affiliation_message,
                },
                {
                  description: words.researchTitleInPlan,
                  result:
                      report.research_plan_validation_result
                        .research_title_matches,
                  message:
                      report.research_plan_validation_result
                        .research_title_message,
                },
              ]}
              words={words}
            />
            <PlanNotes
              result={report.research_plan_validation_result}
              words={words}
            />
          </Section>
        )}
        <Abstract report={report} words={words} />
        <Papers papers={report.papers} words={words} />
        <Datasets
          datasets={report.dataset_analysis_list}
          requestedDatasets={report.dataset_info_list}
          policies={report.dataset_policy_groups}
          applicationMethod={report.application_analysis_method}
          paperMethods={report.paper_analysis_method_list}
          abstractIcd10={report.abstract_icd10_list}
          words={words}
        />
      </Stack>
    </Fold>
  )
}

function PersonReport({
  title,
  validation,
  positionVerification,
  isInstitutionHead = false,
  words,
}: {
  title: string
  validation: PersonValidation
  positionVerification?: PositionVerification | null
  isInstitutionHead?: boolean
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  const { person, verification } = validation
  if (person === undefined) return null
  const warnings = [
    !isInstitutionHead && !person.name_en ? words.name : null,
    isInstitutionHead && !person.name_jp && !person.name_en ? words.name : null,
    !isInstitutionHead && !person.title_en ? words.position : null,
    isInstitutionHead && !person.title_jp && !person.title_en
      ? words.position
      : null,
    !person.organization_jp && !person.organization_en
      ? words.organization
      : null,
    !person.phone ? words.phone : null,
    !person.email ? words.email : null,
    !isInstitutionHead && !person.address ? words.address : null,
  ].filter((warning): warning is string => warning !== null)
  return (
    <Section title={title}>
      <Stack gap="tight">
        <Pairs>
          <KeyValue title={words.name}>
            {joinFields(person.name_jp, person.name_en, words)}
          </KeyValue>
          <KeyValue title={words.position}>
            {joinFields(person.title_jp, person.title_en, words)}
          </KeyValue>
          <KeyValue title={words.organization}>
            {joinFields(person.organization_jp, person.organization_en, words)}
          </KeyValue>
          <KeyValue title={words.email}>
            {display(person.email, words)}
          </KeyValue>
          <KeyValue title={words.phone}>
            {display(person.phone, words)}
          </KeyValue>
          <KeyValue title={words.address}>
            {display(person.address, words)}
          </KeyValue>
        </Pairs>
        {warnings.length > 0 && (
          <Note kind="warning">
            {warnings.join(", ")}
            :
            {words.missing}
          </Note>
        )}
        <VerificationDetails
          verification={verification}
          person={person}
          words={words}
        />
        {positionVerification !== undefined
          && positionVerification !== null && (
          <VerificationRow
            label={words.headPositionVerification}
            result={positionVerification.position_verified}
            message={positionVerification.position_message}
            evidence={positionVerification.position_evidence_url}
            words={words}
          />
        )}
      </Stack>
    </Section>
  )
}

function ConsistencyReport({
  title,
  result,
  people,
  words,
}: {
  title: string
  result:
    | {
      all_match?: boolean | null
      summary?: string
      details?: string[] | null
      head_phone_is_different_from_others?: boolean | null
      head_phone_is_representative_number?: boolean | null
      head_phone_difference_message?: string | null
    }
    | null
    | undefined
  people: readonly (readonly [string, string | null | undefined])[]
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  if (result === null || result === undefined) return null
  return (
    <Section title={title}>
      <Stack gap="tight">
        <Pairs>
          {people.map(([label, value]) => (
            <KeyValue key={label} title={label}>
              {display(value, words)}
            </KeyValue>
          ))}
        </Pairs>
        <VerificationRow
          label={words.result}
          result={result.all_match}
          message={result.summary}
          words={words}
        />
        {result.details !== undefined && result.details !== null && (
          <Table headers={[words.consistencyComparison, words.result]}>
            {result.details.map((detail, index) => {
              const [comparison, outcome] = splitDetail(detail)
              return (
                <tr key={`${comparison}-${index}`}>
                  <Td>{comparison}</Td>
                  <Td>{outcome}</Td>
                </tr>
              )
            })}
          </Table>
        )}
        {result.head_phone_is_different_from_others === false && (
          <VerificationRow
            label={words.headPhoneWarning}
            result={result.head_phone_is_representative_number}
            message={result.head_phone_difference_message}
            words={words}
          />
        )}
      </Stack>
    </Section>
  )
}

function Checklist({
  title,
  items,
  words,
}: {
  title: string
  items: ChecklistItem[] | undefined
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  if (items === undefined || items.length === 0) return null
  return (
    <Section title={title}>
      <Table headers={[words.content, words.result, words.message]}>
        {items.map((item, index) => (
          <tr key={`${item.description}-${index}`}>
            <Td>{item.description}</Td>
            <Td>
              <ChecklistStatus status={item.status} words={words} />
            </Td>
            <Td>{display(item.message, words)}</Td>
          </tr>
        ))}
      </Table>
    </Section>
  )
}

function Papers({
  papers,
  words,
}: {
  papers: AssessmentData["papers"]
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  if (papers === undefined || papers.length === 0) return null
  return (
    <Section title={words.papers}>
      <Table
        headers={[
          words.title,
          words.summary,
          words.icd10,
          words.paperUrl,
          words.humanData,
        ]}
      >
        {papers.map((paper, index) => (
          <tr key={`${paper.title}-${index}`}>
            <Td>{paper.title}</Td>
            <Td>{paper.summary_jp ?? "-"}</Td>
            <Td>{joined(paper.icd10_code_list, ", ")}</Td>
            <Td>
              <ExternalLink url={paper.url} words={words} />
            </Td>
            <Td>
              {paper.handles_human_data === true
                ? words.handlesHumanData
                : paper.handles_human_data === false
                  ? words.doesNotHandleHumanData
                  : words.undecided}
              {paper.human_data_reason && (
                <p className="mt-1 text-sm">{paper.human_data_reason}</p>
              )}
              {paper.human_data_evidence && (
                <blockquote className="mt-1 border-line border-l-2 pl-2 text-ink-muted text-sm">
                  {paper.human_data_evidence}
                </blockquote>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </Section>
  )
}

function Datasets({
  datasets,
  requestedDatasets,
  policies,
  applicationMethod,
  paperMethods,
  abstractIcd10,
  words,
}: {
  datasets: AssessmentData["dataset_analysis_list"]
  requestedDatasets: AssessmentData["dataset_info_list"]
  policies: AssessmentData["dataset_policy_groups"]
  applicationMethod: string | null | undefined
  paperMethods: string[] | null | undefined
  abstractIcd10: string[] | null | undefined
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  if (datasets === undefined) return null
  return (
    <Section title={words.datasets}>
      <Stack>
        {datasets.length === 0
          ? (
              <Empty>{words.noDatasets}</Empty>
            )
          : (
              <>
                <Table
                  headers={[
                    words.datasetId,
                    words.humId,
                    words.jgasId,
                    words.icd10,
                    words.researchIcd10,
                    words.paperIcd10,
                    words.analysis,
                  ]}
                >
                  {datasets.map((dataset) => (
                    <DatasetRow key={dataset.id} dataset={dataset} words={words} />
                  ))}
                </Table>
                {datasets.map((dataset) => (
                  <DatasetDetails
                    key={`${dataset.id}-details`}
                    dataset={dataset}
                    requestedPurpose={
                      requestedDatasets?.find(
                        (requested) => requested.dataset_id === dataset.id,
                      )?.purpose
                    }
                    applicationMethod={applicationMethod}
                    paperMethods={paperMethods}
                    abstractIcd10={abstractIcd10}
                    words={words}
                  />
                ))}
              </>
            )}
        {policies !== undefined && policies.length > 0 && (
          <div>
            <h3 className="mb-2 font-semibold text-sm">{words.policies}</h3>
            {policies.map((policy) => (
              <Fold
                key={policy.policy_text}
                summary={policy.dataset_ids.join(", ")}
              >
                <p className="whitespace-pre-wrap text-sm">
                  {policy.policy_text}
                </p>
              </Fold>
            ))}
          </div>
        )}
      </Stack>
    </Section>
  )
}

function display(
  value: string | null | undefined,
  words: ReturnType<typeof messagesFor>["admin"]["assistant"],
): string {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === "" ? words.missing : trimmed
}

function joinFields(
  japanese: string | null | undefined,
  english: string | null | undefined,
  words: ReturnType<typeof messagesFor>["admin"]["assistant"],
): string {
  const values = [japanese, english].filter(
    (value): value is string =>
      typeof value === "string" && value.trim() !== "",
  )
  return values.length === 0 ? words.missing : values.join(" / ")
}

function range(
  start: string | null | undefined,
  end: string | null | undefined,
  words: ReturnType<typeof messagesFor>["admin"]["assistant"],
): string {
  const values = [start, end].filter(
    (value): value is string =>
      typeof value === "string" && value.trim() !== "",
  )
  return values.length === 0 ? words.missing : values.join(" ～ ")
}

function hasEthicsDocument(document: EthicsDocument): boolean {
  return [
    document.research_project_title_jp,
    document.research_project_title_en,
    document.approval_period_start,
    document.approval_period_end,
    document.institution_name,
    document.institution_head_position,
  ].some((value) => value?.trim())
}

function planAffiliationMatches(
  value: string | null | undefined,
): boolean | undefined {
  if (value === undefined || value === null) return undefined
  return value === "full_match"
}

function splitDetail(detail: string): readonly [string, string] {
  const separator = detail.indexOf(": ")
  return separator === -1
    ? [detail, "-"]
    : [detail.slice(0, separator), detail.slice(separator + 2)]
}

function joined(
  values: readonly string[] | null | undefined,
  separator: string,
): string {
  const value = values?.join(separator)
  return value === undefined || value === "" ? "-" : value
}

function joinText(
  message: string | null | undefined,
  updated: string | null | undefined,
): string | undefined {
  if (message === undefined && updated === undefined) return undefined
  return [message, updated]
    .filter((value): value is string => value !== undefined && value !== null)
    .join(" ")
}

function StatusText({
  result,
  words,
}: {
  result: boolean | null | undefined
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  if (result === true)
    return <span className="text-ink-muted">{words.verified}</span>
  if (result === false)
    return <span className="text-danger">{words.unverified}</span>
  return <span className="text-warning">-</span>
}

function ChecklistStatus({
  status,
  words,
}: {
  status: ChecklistItem["status"]
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  const className
    = status === "ok"
      ? "text-ink-muted"
      : status === "warning"
        ? "text-warning"
        : "text-danger"
  return (
    <span className={className}>{words.checklistStatuses[status]}</span>
  )
}

function ExternalLink({
  url,
  words,
  label,
}: {
  url: string | null | undefined
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
  label?: string | null
}) {
  if (url === undefined || url === null || url.trim() === "")
    return <>{words.missing}</>
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="break-all text-brand underline"
    >
      {label?.trim() === undefined || label.trim() === "" ? url : label.trim()}
    </a>
  )
}

function VerificationRow({
  label,
  result,
  message,
  evidence,
  words,
}: {
  label: string
  result: boolean | null | undefined
  message?: string | null
  evidence?: string | null
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  return (
    <div className="rounded border border-line p-2 text-sm">
      <span className="font-semibold">
        {label}
        :
        {" "}
      </span>
      <StatusText result={result} words={words} />
      {message && (
        <span>
          {" "}
          —
          {message}
        </span>
      )}
      {evidence && (
        <>
          {" "}
          <ExternalLink url={evidence} label={words.evidence} words={words} />
        </>
      )}
    </div>
  )
}

function VerificationDetails({
  verification,
  person,
  words,
}: {
  verification: VerificationResult | undefined
  person: Person
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  if (verification === undefined) return null
  const phone = verification.phone_validation_result
  const address = verification.address_validation_result
  const hasLegalEntity = [
    verification.organization_legal_entity_type,
    verification.organization_legal_entity_message,
    ...(verification.organization_legal_entity_urls ?? []),
  ].some((value) => typeof value === "string" && value.trim() !== "")
  const emailVerified
    = verification.mx_domain_verified === undefined
      || verification.organization_domain_verified === undefined
      ? undefined
      : verification.mx_domain_verified
        && verification.organization_domain_verified
  return (
    <Stack gap="tight">
      <VerificationRow
        label={words.profile}
        result={
          verification.researcher_profile_url === undefined
          || verification.researcher_profile_url === null
            ? false
            : true
        }
        message={joinText(
          verification.researcher_profile_message,
          verification.researcher_profile_last_updated,
        )}
        evidence={verification.researcher_profile_url}
        words={words}
      />
      {hasLegalEntity && (
        <div className="rounded border border-line p-2 text-sm">
          <span className="font-semibold">
            {words.legalEntity}
            :
            {" "}
          </span>
          {display(verification.organization_legal_entity_type, words)}
          {verification.organization_legal_entity_message && (
            <span>
              {" "}
              —
              {verification.organization_legal_entity_message}
            </span>
          )}
          {verification.organization_legal_entity_urls?.map((url) => (
            <div key={url}>
              <ExternalLink url={url} words={words} />
            </div>
          ))}
        </div>
      )}
      {verification.orcid_url && (
        <div className="text-sm">
          <span className="font-semibold">
            {words.orcid}
            :
            {" "}
          </span>
          <ExternalLink url={verification.orcid_url} words={words} />
        </div>
      )}
      <VerificationRow
        label={words.emailVerification}
        result={emailVerified}
        words={words}
      />
      <VerificationRow
        label={words.mxVerification}
        result={verification.mx_domain_verified}
        message={verification.mx_domain_failure_reason}
        words={words}
      />
      <VerificationRow
        label={words.organizationDomain}
        result={verification.organization_domain_verified}
        message={verification.organization_domain_message}
        evidence={verification.organization_domain_evidence_url}
        words={words}
      />
      <VerificationRow
        label={words.supplementaryEmailVerification}
        result={verification.researcher_email_verified}
        message={joinText(
          verification.researcher_email_message,
          verification.researcher_profile_last_updated,
        )}
        evidence={verification.researcher_email_evidence_url}
        words={words}
      />
      {phone !== undefined && phone !== null && (
        <div className="rounded border border-line p-2 text-sm">
          <p className="font-semibold">{words.phoneVerification}</p>
          <Pairs>
            <KeyValue title={words.normalizedPhone}>
              {display(phone.corrected_phone_number ?? person.phone, words)}
            </KeyValue>
            <KeyValue title={words.countryCode}>
              <StatusText
                result={phone.country_code_matched_with_address}
                words={words}
              />
              {phone.country_code_message && ` — ${phone.country_code_message}`}
            </KeyValue>
            <KeyValue title={words.phoneType}>
              {display(phone.judge_about_cell_phone, words)}
            </KeyValue>
            <KeyValue title={words.phoneRelation}>
              <StatusText
                result={phone.related_to_researcher_or_organization}
                words={words}
              />
              {phone.researcher_phone_message
                && ` — ${joinText(
                  phone.researcher_phone_message,
                  phone.researcher_phone_last_updated_year,
                )}`}
              {phone.researcher_phone_url && (
                <>
                  {" "}
                  <ExternalLink
                    url={phone.researcher_phone_url}
                    words={words}
                  />
                </>
              )}
            </KeyValue>
          </Pairs>
        </div>
      )}
      {address !== undefined && address !== null && (
        <div className="rounded border border-line p-2 text-sm">
          <p className="font-semibold">{words.addressVerification}</p>
          <Pairs>
            <KeyValue title={words.formattedAddress}>
              {display(address.formatted_address ?? person.address, words)}
            </KeyValue>
            <KeyValue title={words.result}>
              <StatusText result={address.address_exists} words={words} />
              {address.organization_match && ` — ${address.organization_match}`}
              {address.message && ` — ${address.message}`}
            </KeyValue>
            <KeyValue title={words.maps}>
              <MapLinks links={address.google_map_urls} words={words} />
            </KeyValue>
          </Pairs>
        </div>
      )}
    </Stack>
  )
}

function MapLinks({
  links,
  words,
}: {
  links: AddressVerification["google_map_urls"]
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  if (links === undefined || links.length === 0) return <>-</>
  return (
    <>
      {links.map((link, index) => {
        const url = "url" in link ? link.url : link[0]
        const label = "url" in link ? link.label : link[1]
        return (
          <span key={`${url}-${index}`}>
            {index > 0 && ", "}
            <ExternalLink url={url} label={label} words={words} />
          </span>
        )
      })}
    </>
  )
}

function ValidationChecklist({
  title,
  checks,
  words,
}: {
  title: string
  checks: readonly {
    description: string
    result: boolean | null | undefined
    message?: string | null
    evidence?: string | null
  }[]
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  if (checks.every((check) => check.result === undefined && !check.message))
    return null
  return (
    <div>
      <h3 className="mb-2 font-semibold text-sm">{title}</h3>
      <Table headers={[words.content, words.result, words.message]}>
        {checks.map((check) => (
          <tr key={check.description}>
            <Td>{check.description}</Td>
            <Td>
              <StatusText result={check.result} words={words} />
            </Td>
            <Td>
              {display(check.message, words)}
              {check.evidence && (
                <>
                  {" "}
                  <ExternalLink
                    url={check.evidence}
                    label={words.evidence}
                    words={words}
                  />
                </>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  )
}

function PlanNotes({
  result,
  words,
}: {
  result: ResearchPlanValidation
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  const notes = [
    [words.publicDatabaseUse, result.public_db_use_description],
    [words.dataRetention, result.data_retention_description],
    [words.outsourcing, result.outsourcing_description],
    [words.cloudUse, result.cloud_use_description],
  ] as const
  return (
    <div>
      <h3 className="mb-2 font-semibold text-sm">{words.researchPlanNotes}</h3>
      <Table headers={[words.content, words.present, words.content]}>
        {notes.map(([label, content]) => (
          <tr key={label}>
            <Td>{label}</Td>
            <Td>
              {content !== undefined && content !== null && content.length > 0
                ? words.yes
                : words.no}
            </Td>
            <Td>
              {content?.map((line, index) => (
                <p key={`${line}-${index}`}>
                  •
                  {line}
                </p>
              )) ?? "-"}
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  )
}

function Abstract({
  report,
  words,
}: {
  report: AssessmentData
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  const pairs = report.abstract_sentence_pairs?.filter(
    (pair) =>
      [pair.source_sentence, pair.translated_sentence].some(
        (sentence) => sentence?.trim() !== "",
      ),
  )
  const translation = report.abstract_translation?.translated_abstract
  return (
    <Section title={words.abstract}>
      <Stack gap="tight">
        {translation && pairs !== undefined && pairs.length > 0
          ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <AbstractPanel
                  title={words.translation}
                  sentences={pairs.map((pair) => pair.translated_sentence)}
                  words={words}
                />
                <AbstractPanel
                  title={words.original}
                  sentences={pairs.map((pair) => pair.source_sentence)}
                  words={words}
                />
              </div>
            )
          : translation
            ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <AbstractPanel
                    title={words.translation}
                    text={translation}
                    words={words}
                  />
                  <AbstractPanel
                    title={words.original}
                    text={report.abstract}
                    words={words}
                  />
                </div>
              )
            : (
                <p className="whitespace-pre-wrap text-sm">
                  {display(report.abstract, words)}
                </p>
              )}
        <p className="text-ink-muted text-sm">
          {words.icd10}
          :
          {joined(report.abstract_icd10_list, ", ")}
        </p>
      </Stack>
    </Section>
  )
}

function AbstractPanel({
  title,
  sentences,
  text,
  words,
}: {
  title: string
  sentences?: (string | null | undefined)[]
  text?: string | null
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  return (
    <div className="rounded border border-line bg-surface p-3">
      <h3 className="mb-2 font-semibold text-sm">{title}</h3>
      <p className="whitespace-pre-wrap text-sm">
        {sentences?.map((sentence, index) => (
          <span key={index} className="mr-1">
            {display(sentence, words)}
          </span>
        )) ?? display(text, words)}
      </p>
    </div>
  )
}

function DatasetRow({
  dataset,
  words,
}: {
  dataset: DatasetAnalysis
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  if (dataset.found_in_database === false) {
    return (
      <tr>
        <Td>{dataset.id}</Td>
        <Td colSpan={6}>{words.notRegistered}</Td>
      </tr>
    )
  }
  const retrieval = dataset.dataset_api_retrieval_result
  return (
    <tr>
      <Td>
        <ExternalLink url={dataset.url} label={dataset.id} words={words} />
      </Td>
      <Td>
        <SourceValue
          primary={retrieval?.hum_id}
          secondary={retrieval?.hum_id_list_from_ddbj}
          words={words}
        />
      </Td>
      <Td>
        <SourceValue
          primary={retrieval?.study_id_list}
          secondary={retrieval?.study_id_list_from_ddbj}
          words={words}
        />
      </Td>
      <Td>{joined(dataset.icd10_code_list, ", ")}</Td>
      <Td>{joined(dataset.purpose_similarity_icd10, " / ")}</Td>
      <Td>{joined(dataset.paper_similarity_icd10, " / ")}</Td>
      <Td>{display(dataset.analysis_method_similarity, words)}</Td>
    </tr>
  )
}

function SourceValue({
  primary,
  secondary,
  words,
}: {
  primary: string | string[] | null | undefined
  secondary: string[] | null | undefined
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  const primaryAvailable = primary !== undefined && primary !== null
  const secondaryAvailable = secondary !== undefined && secondary !== null
  const primaryValues = (
    typeof primary === "string" ? [primary] : (primary ?? [])
  ).filter((value) => value.trim() !== "")
  const secondaryValues = (secondary ?? []).filter(
    (value) => value.trim() !== "",
  )
  const mismatch
    = primaryAvailable
      && secondaryAvailable
      && [...primaryValues].sort().join("\u0000")
      !== [...secondaryValues].sort().join("\u0000")
  if (!mismatch)
    return <>{primaryValues.join(", ") || secondaryValues.join(", ") || "-"}</>
  return (
    <span>
      <strong className="text-danger">{words.sourceMismatch}</strong>
      <br />
      HumanDBs:
      {" "}
      {primaryValues.join(", ") || "-"}
      <br />
      DDBJ:
      {" "}
      {secondaryValues.join(", ") || "-"}
    </span>
  )
}

function DatasetDetails({
  dataset,
  requestedPurpose,
  applicationMethod,
  paperMethods,
  abstractIcd10,
  words,
}: {
  dataset: DatasetAnalysis
  requestedPurpose: string | null | undefined
  applicationMethod: string | null | undefined
  paperMethods: string[] | null | undefined
  abstractIcd10: string[] | null | undefined
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
}) {
  return (
    <Fold summary={`${words.datasetId}: ${dataset.id}`}>
      <Pairs>
        <KeyValue title={words.requestedPurpose}>
          {display(requestedPurpose, words)}
        </KeyValue>
        <KeyValue title={words.datasetMethod}>
          {joined(dataset.analysis_method_list, ", ")}
        </KeyValue>
        <KeyValue title={words.applicationMethod}>
          {display(applicationMethod, words)}
        </KeyValue>
        <KeyValue title={words.papersMethod}>
          {joined(paperMethods, ", ")}
        </KeyValue>
        <KeyValue title={words.analysis}>
          {display(dataset.analysis_method_similarity, words)}
          {dataset.analysis_method_similarity_reason
            && ` — ${dataset.analysis_method_similarity_reason}`}
        </KeyValue>
        <KeyValue title={words.researchIcd10}>
          {joined(dataset.purpose_similarity_icd10, " / ")}
          {" ("}
          {joined(abstractIcd10, ", ")}
          {" )"}
        </KeyValue>
        <KeyValue title={words.paperIcd10}>
          {joined(dataset.paper_similarity_icd10, " / ")}
          {dataset.paper_similarity && ` — ${dataset.paper_similarity}`}
          {dataset.paper_similarity_reason
            && `: ${dataset.paper_similarity_reason}`}
        </KeyValue>
      </Pairs>
    </Fold>
  )
}
