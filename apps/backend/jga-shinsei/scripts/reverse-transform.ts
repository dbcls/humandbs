/**
 * 構造化 JSON (DsApplicationTransformed / DuApplicationTransformed) を
 * EAV (Entity-Attribute-Value) パターンに逆変換するスクリプト。
 *
 * Usage: bun run scripts/reverse-transform.ts
 *
 * 入力:
 *   - json-data/ds-applications-transformed.json
 *   - json-data/du-applications-transformed.json
 *
 * 出力:
 *   - json-data/ds-applications-reversed.json
 *   - json-data/du-applications-reversed.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import type {
  BilingualText,
  Collaborator,
  Component,
  Control,
  DataEntry,
  DsApplicationTransformed,
  DuApplicationTransformed,
  Head,
  Member,
  Pi,
  RawDsApplication,
  RawDuApplication,
  RawStatusHistoryEntry,
  StatusHistoryEntry,
  Submitter,
  UploadedFile,
  UseDataset,
} from "./types"

// =============================================================================
// Helpers
// =============================================================================

/** null でない値のみ Component を生成する */
export const pushComponent = (
  components: Component[],
  key: string,
  value: string | null,
): void => {
  if (value != null) {
    components.push({ key, value })
  }
}

/** BilingualText -> 2 つの Component (ja: baseKey, en: baseKey_en) */
export const pushBilingual = (
  components: Component[],
  baseKey: string,
  text: BilingualText,
): void => {
  pushComponent(components, baseKey, text.ja)
  pushComponent(components, `${baseKey}_en`, text.en)
}

/** boolean -> "TRUE" / "FALSE" (非可逆: 元値 "ok"/"true" は "TRUE" になる) */
export const fromBooleanOrNull = (value: boolean | null): string | null => {
  if (value === true) return "TRUE"
  if (value === false) return "FALSE"

  return null
}

// =============================================================================
// Reverse nested object builders
// =============================================================================

export const reverseHead = (head: Head): Component[] => {
  const components: Component[] = []
  pushComponent(components, "head_name", head.name)
  pushComponent(components, "head_job", head.job)
  pushComponent(components, "head_phone", head.phone)
  pushComponent(components, "head_email", head.email)

  return components
}

export const reversePi = (pi: Pi): Component[] => {
  const components: Component[] = []
  pushComponent(components, "pi_account_id", pi.accountId)
  pushBilingual(components, "pi_first_name", pi.firstName)
  pushComponent(components, "pi_middle_name_en", pi.middleName.en)
  pushBilingual(components, "pi_last_name", pi.lastName)
  pushBilingual(components, "pi_institution", pi.institution)
  pushBilingual(components, "pi_division", pi.division)
  pushBilingual(components, "pi_job", pi.job)
  pushComponent(components, "pi_phone", pi.phone)
  pushComponent(components, "pi_email", pi.email)
  pushComponent(components, "pi_country_en", pi.address.country)
  pushComponent(components, "pi_postal_code_en", pi.address.postalCode)
  pushComponent(components, "pi_prefecture_en", pi.address.prefecture)
  pushComponent(components, "pi_city_en", pi.address.city)
  pushComponent(components, "pi_street_en", pi.address.street)

  return components
}

export const reverseSubmitter = (submitter: Submitter): Component[] => {
  const components: Component[] = []
  pushComponent(components, "submitter_account_id", submitter.accountId)
  pushBilingual(components, "submitter_first_name", submitter.firstName)
  pushComponent(components, "submitter_middle_name_en", submitter.middleName.en)
  pushBilingual(components, "submitter_last_name", submitter.lastName)
  pushComponent(
    components,
    "submitter_institution_en",
    submitter.institution.en,
  )
  pushComponent(components, "submitter_division_en", submitter.division.en)
  pushBilingual(components, "submitter_job", submitter.job)
  pushComponent(components, "submitter_phone", submitter.phone)
  pushComponent(components, "submitter_email", submitter.email)
  pushComponent(components, "submitter_country_en", submitter.address.country)
  pushComponent(
    components,
    "submitter_postal_code_en",
    submitter.address.postalCode,
  )
  pushComponent(
    components,
    "submitter_prefecture_en",
    submitter.address.prefecture,
  )
  pushComponent(components, "submitter_city_en", submitter.address.city)
  pushComponent(components, "submitter_street_en", submitter.address.street)

  return components
}

export const reverseControl = (control: Control): Component[] => {
  const components: Component[] = []
  pushComponent(components, "lang", control.lang)
  pushComponent(components, "group_id", control.groupId)
  pushComponent(
    components,
    "is_none_collaborator",
    fromBooleanOrNull(control.isNoneCollaborator),
  )
  pushComponent(components, "private_comment", control.privateComment)
  pushComponent(
    components,
    "is_declare_statement",
    fromBooleanOrNull(control.isDeclareStatement),
  )
  pushComponent(
    components,
    "is_agree_mail_use",
    fromBooleanOrNull(control.isAgreeMailUse),
  )

  return components
}

// =============================================================================
// Reverse multiValue group builders
// =============================================================================

export const reverseCollaborators = (
  collaborators: Collaborator[],
): Component[] => {
  const components: Component[] = []
  for (const c of collaborators) {
    pushComponent(components, "collaborator_name", c.name)
  }
  for (const c of collaborators) {
    pushComponent(components, "collaborator_division", c.division)
  }
  for (const c of collaborators) {
    pushComponent(components, "collaborator_job", c.job)
  }
  for (const c of collaborators) {
    pushComponent(components, "collaborator_eradid", c.eradid)
  }
  for (const c of collaborators) {
    pushComponent(components, "collaborator_orcid", c.orcid)
  }
  for (const c of collaborators) {
    pushComponent(components, "collaborator_seminar", c.seminar)
  }

  return components
}

export const reverseUploadedFiles = (
  files: UploadedFile[],
): Component[] => {
  const components: Component[] = []
  for (const f of files) {
    pushComponent(components, "uploaded_file", f.file)
  }
  for (const f of files) {
    pushComponent(components, "uploaded_file_type", f.type)
  }

  return components
}

export const reverseDataGroup = (data: DataEntry[]): Component[] => {
  const components: Component[] = []
  for (const d of data) {
    pushComponent(components, "data_access", d.dataAccess)
  }
  for (const d of data) {
    pushComponent(components, "study_type", d.studyType)
  }
  for (const d of data) {
    pushComponent(components, "study_type_other", d.studyTypeOther)
  }
  for (const d of data) {
    pushComponent(components, "target", d.target)
  }
  for (const d of data) {
    pushComponent(components, "file_format", d.fileFormat)
  }
  for (const d of data) {
    pushComponent(components, "file_size", d.fileSize)
  }

  return components
}

export const reverseMembers = (members: Member[]): Component[] => {
  const components: Component[] = []
  for (const m of members) {
    pushComponent(components, "member_account_id", m.accountId)
  }
  for (const m of members) {
    pushComponent(components, "member_first_name_en", m.firstName.en)
  }
  for (const m of members) {
    pushComponent(components, "member_middle_name_en", m.middleName.en)
  }
  for (const m of members) {
    pushComponent(components, "member_last_name_en", m.lastName.en)
  }
  for (const m of members) {
    pushComponent(components, "member_email", m.email)
  }
  for (const m of members) {
    pushComponent(components, "member_institution_en", m.institution.en)
  }
  for (const m of members) {
    pushComponent(components, "member_division_en", m.division.en)
  }
  for (const m of members) {
    pushComponent(components, "member_job_en", m.job.en)
  }
  for (const m of members) {
    pushComponent(components, "member_eradid", m.eradid)
  }
  for (const m of members) {
    pushComponent(components, "member_orcid", m.orcid)
  }

  return components
}

export const reverseUseDatasets = (
  datasets: UseDataset[],
): Component[] => {
  const components: Component[] = []
  for (const d of datasets) {
    pushComponent(components, "use_dataset_request", d.request)
  }
  for (const d of datasets) {
    pushComponent(components, "use_dataset_purpose", d.purpose)
  }
  for (const d of datasets) {
    pushComponent(components, "use_dataset_id", d.id)
  }

  return components
}

// =============================================================================
// Status history
// =============================================================================

export const reverseStatusHistory = (
  history: StatusHistoryEntry[],
): RawStatusHistoryEntry[] =>
  history.map((entry) => ({
    status: entry.status,
    date: entry.date,
  }))

// =============================================================================
// Application reversers
// =============================================================================

export const reverseDsApplication = (
  ds: DsApplicationTransformed,
): RawDsApplication => {
  const components: Component[] = []

  pushBilingual(components, "submission_study_title", ds.studyTitle)
  pushBilingual(components, "aim", ds.aim)
  pushBilingual(components, "method", ds.method)
  pushBilingual(components, "participant", ds.participant)
  pushBilingual(components, "restriction", ds.restriction)
  pushComponent(components, "submission_publication", ds.publication)
  pushComponent(components, "icd10", ds.icd10)

  components.push(...reverseDataGroup(ds.data))

  pushComponent(components, "release_date", ds.releaseDate)

  pushComponent(
    components,
    "de_identification_status",
    ds.deIdentification.status,
  )
  pushComponent(
    components,
    "de_identification_date",
    ds.deIdentification.date,
  )
  pushComponent(
    components,
    "de_identification_reason",
    ds.deIdentification.reason,
  )

  pushComponent(
    components,
    "submission_review_status",
    ds.review.submissionStatus,
  )
  pushComponent(
    components,
    "submission_review_date",
    ds.review.submissionDate,
  )
  pushComponent(components, "company_use_status", ds.review.companyUseStatus)
  pushComponent(
    components,
    "multicenter_collaborative_study_status",
    ds.review.multicenterCollaborativeStudyStatus,
  )
  pushComponent(
    components,
    "nbdc_data_processing_status",
    ds.review.nbdcDataProcessingStatus,
  )
  pushComponent(
    components,
    "nbdc_data_processing_reason",
    ds.review.nbdcDataProcessingReason,
  )
  pushComponent(
    components,
    "nbdc_guideline_status",
    ds.review.nbdcGuidelineStatus,
  )
  pushComponent(
    components,
    "is_simplified_review",
    fromBooleanOrNull(ds.review.isSimplifiedReview),
  )

  components.push(...reverseHead(ds.head))
  components.push(...reversePi(ds.pi))
  components.push(...reverseSubmitter(ds.submitter))
  components.push(...reverseCollaborators(ds.collaborators))
  components.push(...reverseUploadedFiles(ds.uploadedFiles))
  components.push(...reverseControl(ds.control))

  return {
    jds_id: ds.jdsId,
    jsub_ids: ds.jsubIds,
    hum_ids: ds.humIds,
    jga_ids: ds.jgaIds,
    components,
    status_history: reverseStatusHistory(ds.statusHistory),
    submit_date: ds.submitDate,
    create_date: ds.createDate,
  }
}

export const reverseDuApplication = (
  du: DuApplicationTransformed,
): RawDuApplication => {
  const components: Component[] = []

  pushBilingual(components, "use_study_title", du.studyTitle)
  pushComponent(components, "use_purpose", du.usePurpose)
  pushComponent(components, "use_summary", du.useSummary)
  pushComponent(components, "use_publication", du.usePublication)

  components.push(...reverseUseDatasets(du.useDatasets))

  pushComponent(components, "use_period_start", du.usePeriod.start)
  pushComponent(components, "use_period_end", du.usePeriod.end)

  pushComponent(components, "use_review_status", du.useReview.status)
  pushComponent(components, "use_review_date", du.useReview.date)

  pushComponent(components, "server_status", du.server.status)
  for (const s of du.server.offPremiseStatus) {
    components.push({ key: "off_premise_server_status", value: s })
  }
  pushComponent(
    components,
    "is_off_premise_server_statement",
    fromBooleanOrNull(du.server.isOffPremiseStatement),
  )
  pushComponent(
    components,
    "acknowledgment_status",
    du.server.acknowledgmentStatus,
  )

  pushComponent(components, "public_key_file", du.publicKey.file)
  pushComponent(components, "public_key_txt", du.publicKey.txt)
  pushComponent(components, "public_key", du.publicKey.key)

  pushComponent(components, "report_summary", du.report.summary)
  pushComponent(components, "report_publication", du.report.publication)
  pushComponent(
    components,
    "report_intellectual_property",
    du.report.intellectualProperty,
  )
  pushComponent(
    components,
    "nbdc_sharing_guideline_status",
    du.report.nbdcSharingGuidelineStatus,
  )
  pushComponent(
    components,
    "nbdc_sharing_guideline_detail",
    du.report.nbdcSharingGuidelineDetail,
  )
  pushComponent(components, "new_report_status", du.report.newReportStatus)

  pushComponent(components, "deletion_date", du.deletion.date)
  pushComponent(
    components,
    "keep_secondary_data_status",
    du.deletion.keepSecondaryDataStatus,
  )
  pushComponent(
    components,
    "keep_secondary_data_detail",
    du.deletion.keepSecondaryDataDetail,
  )

  pushComponent(
    components,
    "distributing_processed_data_status",
    du.distribution.status,
  )
  pushComponent(
    components,
    "distributing_processed_data_detail",
    du.distribution.detail,
  )
  pushComponent(
    components,
    "distributing_processed_data_way",
    du.distribution.way,
  )
  pushComponent(
    components,
    "is_distribute_processed_data_statement1",
    fromBooleanOrNull(du.distribution.isStatement1),
  )
  pushComponent(
    components,
    "is_distribute_processed_data_statement2",
    fromBooleanOrNull(du.distribution.isStatement2),
  )

  components.push(...reverseMembers(du.members))

  components.push(...reverseHead(du.head))
  components.push(...reversePi(du.pi))
  components.push(...reverseSubmitter(du.submitter))
  components.push(...reverseCollaborators(du.collaborators))
  components.push(...reverseUploadedFiles(du.uploadedFiles))
  components.push(...reverseControl(du.control))

  return {
    jdu_id: du.jduId,
    jgad_ids: du.jgadIds,
    jgas_ids: du.jgasIds,
    hum_ids: du.humIds,
    components,
    status_history: reverseStatusHistory(du.statusHistory),
    submit_date: du.submitDate,
    create_date: du.createDate,
  }
}

// =============================================================================
// Main
// =============================================================================

const main = (): void => {
  const baseDir = path.resolve(import.meta.dir, "..")
  const jsonDataDir = path.join(baseDir, "json-data")

  const dsTransformed: DsApplicationTransformed[] = JSON.parse(
    readFileSync(
      path.join(jsonDataDir, "ds-applications-transformed.json"),
      "utf-8",
    ),
  )
  const dsReversed = dsTransformed.map(reverseDsApplication)
  writeFileSync(
    path.join(jsonDataDir, "ds-applications-reversed.json"),
    JSON.stringify(dsReversed, null, 2) + "\n",
    "utf-8",
  )
  console.log(`Reversed ${dsReversed.length} DS applications`)

  const duTransformed: DuApplicationTransformed[] = JSON.parse(
    readFileSync(
      path.join(jsonDataDir, "du-applications-transformed.json"),
      "utf-8",
    ),
  )
  const duReversed = duTransformed.map(reverseDuApplication)
  writeFileSync(
    path.join(jsonDataDir, "du-applications-reversed.json"),
    JSON.stringify(duReversed, null, 2) + "\n",
    "utf-8",
  )
  console.log(`Reversed ${duReversed.length} DU applications`)
}

if (import.meta.main) {
  main()
}
