/**
 * EAV (Entity-Attribute-Value) パターンの JGA 申請データを
 * API フレンドリーな構造に変換するモジュール。
 */
import type {
  BilingualText,
  Collaborator,
  Component,
  Control,
  DataAccess,
  DataEntry,
  DsApplicationTransformed,
  DuApplicationTransformed,
  Head,
  Lang,
  Member,
  OffPremiseServer,
  Pi,
  RawDsApplication,
  RawDuApplication,
  RawStatusHistoryEntry,
  ServerLocation,
  StatusCode,
  StatusHistoryEntry,
  Submitter,
  UploadedFile,
  UseDataset,
  UseReviewStatus,
  YesNo,
} from "@/crawler/types/jga-shinsei"

// === Constants ===

const STATUS_LABELS: Record<StatusCode, BilingualText> = {
  10: { ja: "申請書類作成中", en: "Preparing" },
  20: { ja: "申請完了", en: "Submitted" },
  30: { ja: "申請者へ差し戻し中", en: "Revision requested" },
  40: { ja: "審査中", en: "DAC reviewing" },
  50: { ja: "申請却下", en: "Rejected" },
  60: { ja: "申請承認", en: "Approved" },
  70: { ja: "申請取り下げ", en: "Canceled" },
  80: { ja: "利用期間終了", en: "Closed" },
}

// === Helper functions ===

interface ComponentHelpers {
  getValue: (key: string) => string | null
  getValues: (key: string) => string[]
}

/**
 * components 配列からヘルパー関数ペアを生成する。
 * - getValue: 単一値を取得（最初の値 or null）
 * - getValues: 複数値を配列で取得
 */
export const createHelpers = (components: Component[]): ComponentHelpers => {
  const map = new Map<string, string[]>()
  for (const c of components) {
    const arr = map.get(c.key)
    if (arr) {
      arr.push(c.value)
    } else {
      map.set(c.key, [c.value])
    }
  }

  return {
    getValue: (key: string): string | null => map.get(key)?.[0] ?? null,
    getValues: (key: string): string[] => map.get(key) ?? [],
  }
}

/**
 * 文字列を boolean | null に変換する。
 * "TRUE", "true", "ok" -> true
 * "FALSE", "false" -> false
 * null/undefined/その他 -> null
 */
export const toBooleanOrNull = (
  value: string | null | undefined,
): boolean | null => {
  if (value == null) return null
  const lower = value.toLowerCase()
  if (lower === "true" || lower === "ok") return true
  if (lower === "false") return false

  return null
}

// === Nested object builders ===

const buildHead = (getValue: (key: string) => string | null): Head => ({
  name: getValue("head_name"),
  job: getValue("head_job"),
  phone: getValue("head_phone"),
  email: getValue("head_email"),
})

const buildPi = (getValue: (key: string) => string | null): Pi => ({
  accountId: getValue("pi_account_id"),
  firstName: {
    ja: getValue("pi_first_name"),
    en: getValue("pi_first_name_en"),
  },
  middleName: {
    ja: null,
    en: getValue("pi_middle_name_en"),
  },
  lastName: {
    ja: getValue("pi_last_name"),
    en: getValue("pi_last_name_en"),
  },
  institution: {
    ja: getValue("pi_institution"),
    en: getValue("pi_institution_en"),
  },
  division: {
    ja: getValue("pi_division"),
    en: getValue("pi_division_en"),
  },
  job: {
    ja: getValue("pi_job"),
    en: getValue("pi_job_en"),
  },
  phone: getValue("pi_phone"),
  email: getValue("pi_email"),
  address: {
    country: getValue("pi_country_en"),
    postalCode: getValue("pi_postal_code_en"),
    prefecture: getValue("pi_prefecture_en"),
    city: getValue("pi_city_en"),
    street: getValue("pi_street_en"),
  },
})

const buildSubmitter = (getValue: (key: string) => string | null): Submitter => ({
  accountId: getValue("submitter_account_id"),
  firstName: {
    ja: getValue("submitter_first_name"),
    en: getValue("submitter_first_name_en"),
  },
  middleName: {
    ja: null,
    en: getValue("submitter_middle_name_en"),
  },
  lastName: {
    ja: getValue("submitter_last_name"),
    en: getValue("submitter_last_name_en"),
  },
  institution: {
    ja: null,
    en: getValue("submitter_institution_en"),
  },
  division: {
    ja: null,
    en: getValue("submitter_division_en"),
  },
  job: {
    ja: getValue("submitter_job"),
    en: getValue("submitter_job_en"),
  },
  phone: getValue("submitter_phone"),
  email: getValue("submitter_email"),
  address: {
    country: getValue("submitter_country_en"),
    postalCode: getValue("submitter_postal_code_en"),
    prefecture: getValue("submitter_prefecture_en"),
    city: getValue("submitter_city_en"),
    street: getValue("submitter_street_en"),
  },
})

const buildControl = (
  getValue: (key: string) => string | null,
): Control => ({
  lang: getValue("lang") as Lang | null,
  groupId: getValue("group_id"),
  isNoneCollaborator: toBooleanOrNull(getValue("is_none_collaborator")),
  privateComment: getValue("private_comment"),
  isDeclareStatement: toBooleanOrNull(getValue("is_declare_statement")),
  isAgreeMailUse: toBooleanOrNull(getValue("is_agree_mail_use")),
})

// === MultiValue group builders ===

export const buildCollaborators = (
  getValues: (key: string) => string[],
): Collaborator[] => {
  const names = getValues("collaborator_name")
  const divisions = getValues("collaborator_division")
  const jobs = getValues("collaborator_job")
  const eradids = getValues("collaborator_eradid")
  const orcids = getValues("collaborator_orcid")
  const seminars = getValues("collaborator_seminar")

  const maxLen = Math.max(
    names.length,
    divisions.length,
    jobs.length,
    eradids.length,
    orcids.length,
    seminars.length,
    0,
  )

  const result: Collaborator[] = []
  for (let i = 0; i < maxLen; i++) {
    result.push({
      name: names[i] ?? null,
      division: divisions[i] ?? null,
      job: jobs[i] ?? null,
      eradid: eradids[i] ?? null,
      orcid: orcids[i] ?? null,
      seminar: (seminars[i] ?? null) as YesNo | null,
    })
  }

  return result
}

export const buildUploadedFiles = (
  getValues: (key: string) => string[],
): UploadedFile[] => {
  const files = getValues("uploaded_file")
  const types = getValues("uploaded_file_type")

  const maxLen = Math.max(files.length, types.length, 0)

  const result: UploadedFile[] = []
  for (let i = 0; i < maxLen; i++) {
    result.push({
      file: files[i] ?? null,
      type: types[i] ?? null,
    })
  }

  return result
}

export const buildDataGroup = (
  getValues: (key: string) => string[],
): DataEntry[] => {
  const dataAccess = getValues("data_access")
  const studyType = getValues("study_type")
  const studyTypeOther = getValues("study_type_other")
  const targets = getValues("target")
  const fileFormat = getValues("file_format")
  const fileSize = getValues("file_size")

  const maxLen = Math.max(
    dataAccess.length,
    studyType.length,
    studyTypeOther.length,
    targets.length,
    fileFormat.length,
    fileSize.length,
    0,
  )

  const result: DataEntry[] = []
  for (let i = 0; i < maxLen; i++) {
    result.push({
      dataAccess: (dataAccess[i] ?? null) as DataAccess | null,
      studyType: studyType[i] ?? null,
      studyTypeOther: studyTypeOther[i] ?? null,
      target: targets[i] ?? null,
      fileFormat: fileFormat[i] ?? null,
      fileSize: fileSize[i] ?? null,
    })
  }

  return result
}

export const buildMembers = (
  getValues: (key: string) => string[],
): Member[] => {
  const accountIds = getValues("member_account_id")
  const firstNames = getValues("member_first_name_en")
  const middleNames = getValues("member_middle_name_en")
  const lastNames = getValues("member_last_name_en")
  const emails = getValues("member_email")
  const institutions = getValues("member_institution_en")
  const divisions = getValues("member_division_en")
  const jobs = getValues("member_job_en")
  const eradids = getValues("member_eradid")
  const orcids = getValues("member_orcid")

  const maxLen = Math.max(
    accountIds.length,
    firstNames.length,
    middleNames.length,
    lastNames.length,
    emails.length,
    institutions.length,
    divisions.length,
    jobs.length,
    eradids.length,
    orcids.length,
    0,
  )

  const result: Member[] = []
  for (let i = 0; i < maxLen; i++) {
    result.push({
      accountId: accountIds[i] ?? null,
      firstName: { ja: null, en: firstNames[i] ?? null },
      middleName: { ja: null, en: middleNames[i] ?? null },
      lastName: { ja: null, en: lastNames[i] ?? null },
      email: emails[i] ?? null,
      institution: { ja: null, en: institutions[i] ?? null },
      division: { ja: null, en: divisions[i] ?? null },
      job: { ja: null, en: jobs[i] ?? null },
      eradid: eradids[i] ?? null,
      orcid: orcids[i] ?? null,
    })
  }

  return result
}

export const buildUseDatasets = (
  getValues: (key: string) => string[],
): UseDataset[] => {
  const requests = getValues("use_dataset_request")
  const purposes = getValues("use_dataset_purpose")
  const ids = getValues("use_dataset_id")

  const maxLen = Math.max(requests.length, purposes.length, ids.length, 0)

  const result: UseDataset[] = []
  for (let i = 0; i < maxLen; i++) {
    result.push({
      request: requests[i] ?? null,
      purpose: purposes[i] ?? null,
      id: ids[i] ?? null,
    })
  }

  return result
}

// === Status history ===

export const buildStatusHistory = (
  rawHistory: RawStatusHistoryEntry[],
): StatusHistoryEntry[] =>
  rawHistory.map((entry) => ({
    status: entry.status as StatusCode,
    statusLabel:
      STATUS_LABELS[entry.status as StatusCode] ?? { ja: null, en: null },
    date: entry.date,
  }))

// === Application transformers ===

export const transformDsApplication = (
  raw: RawDsApplication,
): DsApplicationTransformed => {
  const { getValue, getValues } = createHelpers(raw.components)

  return {
    jdsId: raw.jds_id,
    jsubIds: raw.jsub_ids,
    humIds: raw.hum_ids,
    jgaIds: raw.jga_ids,

    studyTitle: {
      ja: getValue("submission_study_title"),
      en: getValue("submission_study_title_en"),
    },
    aim: {
      ja: getValue("aim"),
      en: getValue("aim_en"),
    },
    method: {
      ja: getValue("method"),
      en: getValue("method_en"),
    },
    participant: {
      ja: getValue("participant"),
      en: getValue("participant_en"),
    },
    restriction: {
      ja: getValue("restriction"),
      en: getValue("restriction_en"),
    },
    publication: getValue("submission_publication"),
    icd10: getValue("icd10"),

    data: buildDataGroup(getValues),

    releaseDate: getValue("release_date"),

    deIdentification: {
      status: getValue("de_identification_status"),
      date: getValue("de_identification_date"),
      reason: getValue("de_identification_reason"),
    },

    review: {
      submissionStatus: getValue("submission_review_status"),
      submissionDate: getValue("submission_review_date"),
      companyUseStatus: getValue("company_use_status"),
      multicenterCollaborativeStudyStatus: getValue(
        "multicenter_collaborative_study_status",
      ) as "yes" | "no" | "piinstitution" | null,
      nbdcDataProcessingStatus: getValue("nbdc_data_processing_status"),
      nbdcDataProcessingReason: getValue("nbdc_data_processing_reason"),
      nbdcGuidelineStatus: getValue("nbdc_guideline_status") as YesNo | null,
      isSimplifiedReview: toBooleanOrNull(getValue("is_simplified_review")),
    },

    head: buildHead(getValue),
    pi: buildPi(getValue),
    submitter: buildSubmitter(getValue),
    collaborators: buildCollaborators(getValues),
    uploadedFiles: buildUploadedFiles(getValues),

    control: buildControl(getValue),

    statusHistory: buildStatusHistory(raw.status_history),
    submitDate: raw.submit_date,
    createDate: raw.create_date,
  }
}

export const transformDuApplication = (
  raw: RawDuApplication,
): DuApplicationTransformed => {
  const { getValue, getValues } = createHelpers(raw.components)

  return {
    jduId: raw.jdu_id,
    jgadIds: raw.jgad_ids,
    jgasIds: raw.jgas_ids,
    humIds: raw.hum_ids,

    studyTitle: {
      ja: getValue("use_study_title"),
      en: getValue("use_study_title_en"),
    },
    usePurpose: getValue("use_purpose"),
    useSummary: getValue("use_summary"),
    usePublication: getValue("use_publication"),

    useDatasets: buildUseDatasets(getValues),

    usePeriod: {
      start: getValue("use_period_start"),
      end: getValue("use_period_end"),
    },

    useReview: {
      status: getValue("use_review_status") as UseReviewStatus | null,
      date: getValue("use_review_date"),
    },

    server: {
      status: getValue("server_status") as ServerLocation | null,
      offPremiseStatus: getValues(
        "off_premise_server_status",
      ) as OffPremiseServer[],
      isOffPremiseStatement: toBooleanOrNull(
        getValue("is_off_premise_server_statement"),
      ),
      acknowledgmentStatus: getValue("acknowledgment_status") as YesNo | null,
    },

    publicKey: {
      file: getValue("public_key_file"),
      txt: getValue("public_key_txt"),
      key: getValue("public_key"),
    },

    report: {
      summary: getValue("report_summary"),
      publication: getValue("report_publication"),
      intellectualProperty: getValue("report_intellectual_property"),
      nbdcSharingGuidelineStatus: getValue(
        "nbdc_sharing_guideline_status",
      ) as YesNo | null,
      nbdcSharingGuidelineDetail: getValue("nbdc_sharing_guideline_detail"),
      newReportStatus: getValue("new_report_status"),
    },

    deletion: {
      date: getValue("deletion_date"),
      keepSecondaryDataStatus: getValue(
        "keep_secondary_data_status",
      ) as YesNo | null,
      keepSecondaryDataDetail: getValue("keep_secondary_data_detail"),
    },

    distribution: {
      status: getValue("distributing_processed_data_status") as YesNo | null,
      detail: getValue("distributing_processed_data_detail"),
      way: getValue("distributing_processed_data_way"),
      isStatement1: toBooleanOrNull(
        getValue("is_distribute_processed_data_statement1"),
      ),
      isStatement2: toBooleanOrNull(
        getValue("is_distribute_processed_data_statement2"),
      ),
    },

    members: buildMembers(getValues),

    head: buildHead(getValue),
    pi: buildPi(getValue),
    submitter: buildSubmitter(getValue),
    collaborators: buildCollaborators(getValues),
    uploadedFiles: buildUploadedFiles(getValues),

    control: buildControl(getValue),

    statusHistory: buildStatusHistory(raw.status_history),
    submitDate: raw.submit_date,
    createDate: raw.create_date,
  }
}
