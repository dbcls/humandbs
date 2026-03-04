import { describe, expect, it } from "bun:test"

import {
  fromBooleanOrNull,
  reverseCollaborators,
  reverseControl,
  reverseDataGroup,
  reverseDsApplication,
  reverseDuApplication,
  reverseHead,
  reverseMembers,
  reversePi,
  reverseStatusHistory,
  reverseSubmitter,
  reverseUploadedFiles,
  reverseUseDatasets,
} from "../scripts/reverse-transform"
import {
  transformDsApplication,
  transformDuApplication,
} from "../scripts/transform"
import type {
  Collaborator,
  Component,
  DataEntry,
  DsApplicationTransformed,
  Head,
  Member,
  Pi,
  StatusHistoryEntry,
  Submitter,
  UploadedFile,
  UseDataset,
} from "../scripts/types"

// =============================================================================
// Test helpers
// =============================================================================

const findComponents = (
  components: Component[],
  key: string,
): string[] => components.filter((c) => c.key === key).map((c) => c.value)

// =============================================================================
// fromBooleanOrNull
// =============================================================================

describe("fromBooleanOrNull", () => {
  it("should convert true to TRUE", () => {
    expect(fromBooleanOrNull(true)).toBe("TRUE")
  })

  it("should convert false to FALSE", () => {
    expect(fromBooleanOrNull(false)).toBe("FALSE")
  })

  it("should return null for null", () => {
    expect(fromBooleanOrNull(null)).toBeNull()
  })
})

// =============================================================================
// reverseHead
// =============================================================================

describe("reverseHead", () => {
  it("should map all fields to correct keys", () => {
    const head: Head = {
      name: "機関長太郎",
      job: "所長",
      phone: "098-765-4321",
      email: "head@example.com",
    }
    const result = reverseHead(head)

    expect(result).toEqual([
      { key: "head_name", value: "機関長太郎" },
      { key: "head_job", value: "所長" },
      { key: "head_phone", value: "098-765-4321" },
      { key: "head_email", value: "head@example.com" },
    ])
  })

  it("should skip null fields", () => {
    const head: Head = {
      name: "機関長太郎",
      job: null,
      phone: null,
      email: null,
    }
    const result = reverseHead(head)

    expect(result).toEqual([{ key: "head_name", value: "機関長太郎" }])
  })

  it("should return empty array when all fields are null", () => {
    const head: Head = {
      name: null,
      job: null,
      phone: null,
      email: null,
    }

    expect(reverseHead(head)).toEqual([])
  })
})

// =============================================================================
// reversePi
// =============================================================================

describe("reversePi", () => {
  it("should map bilingual fields with _en suffix", () => {
    const pi: Pi = {
      accountId: "saga_general",
      firstName: { ja: "テスト名", en: "Masakazu" },
      middleName: { ja: null, en: null },
      lastName: { ja: "テスト姓", en: "Saga" },
      institution: { ja: "テスト組織", en: "Test Organization" },
      division: { ja: "テストラボ", en: "Test Lab" },
      job: { ja: "教授", en: "professor" },
      phone: "012-345-6789",
      email: "test@example.com",
      address: {
        country: "Japan",
        postalCode: "000-0000",
        prefecture: "Tokyo",
        city: "Chuo-ku",
        street: "1-1-1",
      },
    }
    const result = reversePi(pi)

    expect(findComponents(result, "pi_account_id")).toEqual(["saga_general"])
    expect(findComponents(result, "pi_first_name")).toEqual(["テスト名"])
    expect(findComponents(result, "pi_first_name_en")).toEqual(["Masakazu"])
    expect(findComponents(result, "pi_middle_name_en")).toEqual([])
    expect(findComponents(result, "pi_last_name")).toEqual(["テスト姓"])
    expect(findComponents(result, "pi_last_name_en")).toEqual(["Saga"])
    expect(findComponents(result, "pi_institution")).toEqual(["テスト組織"])
    expect(findComponents(result, "pi_institution_en")).toEqual([
      "Test Organization",
    ])
    expect(findComponents(result, "pi_country_en")).toEqual(["Japan"])
    expect(findComponents(result, "pi_postal_code_en")).toEqual(["000-0000"])
  })

  it("should skip null address fields", () => {
    const pi: Pi = {
      accountId: null,
      firstName: { ja: null, en: null },
      middleName: { ja: null, en: null },
      lastName: { ja: null, en: null },
      institution: { ja: null, en: null },
      division: { ja: null, en: null },
      job: { ja: null, en: null },
      phone: null,
      email: null,
      address: {
        country: null,
        postalCode: null,
        prefecture: null,
        city: null,
        street: null,
      },
    }

    expect(reversePi(pi)).toEqual([])
  })
})

// =============================================================================
// reverseSubmitter
// =============================================================================

describe("reverseSubmitter", () => {
  it("should use _en-only keys for institution, division, middleName", () => {
    const submitter: Submitter = {
      accountId: "user_general",
      firstName: { ja: "テスト名", en: "Test" },
      middleName: { ja: null, en: "M" },
      lastName: { ja: "テスト姓", en: "User" },
      institution: { ja: null, en: "User University" },
      division: { ja: null, en: "User Lab" },
      job: { ja: "准教授", en: "associate professor" },
      phone: "000-000-0000",
      email: "user@example.com",
      address: {
        country: null,
        postalCode: null,
        prefecture: null,
        city: null,
        street: null,
      },
    }
    const result = reverseSubmitter(submitter)

    expect(findComponents(result, "submitter_first_name")).toEqual([
      "テスト名",
    ])
    expect(findComponents(result, "submitter_first_name_en")).toEqual(["Test"])
    expect(findComponents(result, "submitter_middle_name_en")).toEqual(["M"])
    expect(findComponents(result, "submitter_last_name")).toEqual(["テスト姓"])
    expect(findComponents(result, "submitter_last_name_en")).toEqual(["User"])
    // institution/division: en のみ
    expect(findComponents(result, "submitter_institution_en")).toEqual([
      "User University",
    ])
    expect(findComponents(result, "submitter_division_en")).toEqual([
      "User Lab",
    ])
    // job: ja + en
    expect(findComponents(result, "submitter_job")).toEqual(["准教授"])
    expect(findComponents(result, "submitter_job_en")).toEqual([
      "associate professor",
    ])
  })
})

// =============================================================================
// reverseControl
// =============================================================================

describe("reverseControl", () => {
  it("should serialize boolean fields as TRUE/FALSE", () => {
    const result = reverseControl({
      lang: "ja",
      groupId: "subgrp2116",
      isNoneCollaborator: false,
      privateComment: null,
      isDeclareStatement: null,
      isAgreeMailUse: true,
    })

    expect(findComponents(result, "lang")).toEqual(["ja"])
    expect(findComponents(result, "group_id")).toEqual(["subgrp2116"])
    expect(findComponents(result, "is_none_collaborator")).toEqual(["FALSE"])
    expect(findComponents(result, "private_comment")).toEqual([])
    expect(findComponents(result, "is_declare_statement")).toEqual([])
    expect(findComponents(result, "is_agree_mail_use")).toEqual(["TRUE"])
  })
})

// =============================================================================
// reverseCollaborators
// =============================================================================

describe("reverseCollaborators", () => {
  it("should preserve index ordering for multiValue groups", () => {
    const collaborators: Collaborator[] = [
      {
        name: "Alice",
        division: "Div A",
        job: "Prof",
        eradid: null,
        orcid: null,
        seminar: null,
      },
      {
        name: "Bob",
        division: "Div B",
        job: "Assoc Prof",
        eradid: null,
        orcid: null,
        seminar: null,
      },
    ]
    const result = reverseCollaborators(collaborators)

    expect(findComponents(result, "collaborator_name")).toEqual([
      "Alice",
      "Bob",
    ])
    expect(findComponents(result, "collaborator_division")).toEqual([
      "Div A",
      "Div B",
    ])
    expect(findComponents(result, "collaborator_job")).toEqual([
      "Prof",
      "Assoc Prof",
    ])
  })

  it("should return empty array for empty collaborators", () => {
    expect(reverseCollaborators([])).toEqual([])
  })

  it("should skip null fields in collaborators", () => {
    const collaborators: Collaborator[] = [
      {
        name: "Alice",
        division: null,
        job: null,
        eradid: null,
        orcid: null,
        seminar: null,
      },
    ]
    const result = reverseCollaborators(collaborators)

    expect(findComponents(result, "collaborator_name")).toEqual(["Alice"])
    expect(findComponents(result, "collaborator_division")).toEqual([])
  })
})

// =============================================================================
// reverseUploadedFiles
// =============================================================================

describe("reverseUploadedFiles", () => {
  it("should pair file and type by index", () => {
    const files: UploadedFile[] = [
      { file: "ethics.pdf", type: "ethics_review" },
      { file: "consent.pdf", type: "consent_form" },
    ]
    const result = reverseUploadedFiles(files)

    expect(findComponents(result, "uploaded_file")).toEqual([
      "ethics.pdf",
      "consent.pdf",
    ])
    expect(findComponents(result, "uploaded_file_type")).toEqual([
      "ethics_review",
      "consent_form",
    ])
  })

  it("should return empty array for empty files", () => {
    expect(reverseUploadedFiles([])).toEqual([])
  })
})

// =============================================================================
// reverseDataGroup
// =============================================================================

describe("reverseDataGroup", () => {
  it("should generate components for each data entry field", () => {
    const data: DataEntry[] = [
      {
        dataAccess: "submission_open",
        studyType: "study_type_wgs",
        studyTypeOther: null,
        target: null,
        fileFormat: "CRAM",
        fileSize: "500GB",
      },
    ]
    const result = reverseDataGroup(data)

    expect(findComponents(result, "data_access")).toEqual(["submission_open"])
    expect(findComponents(result, "study_type")).toEqual(["study_type_wgs"])
    expect(findComponents(result, "study_type_other")).toEqual([])
    expect(findComponents(result, "file_format")).toEqual(["CRAM"])
    expect(findComponents(result, "file_size")).toEqual(["500GB"])
  })

  it("should handle multiple data entries", () => {
    const data: DataEntry[] = [
      {
        dataAccess: "submission_open",
        studyType: "wgs",
        studyTypeOther: null,
        target: null,
        fileFormat: "CRAM",
        fileSize: "100GB",
      },
      {
        dataAccess: "submission_type1",
        studyType: "wes",
        studyTypeOther: null,
        target: null,
        fileFormat: "VCF",
        fileSize: "50GB",
      },
    ]
    const result = reverseDataGroup(data)

    expect(findComponents(result, "data_access")).toEqual([
      "submission_open",
      "submission_type1",
    ])
    expect(findComponents(result, "study_type")).toEqual(["wgs", "wes"])
  })

  it("should return empty array for empty data", () => {
    expect(reverseDataGroup([])).toEqual([])
  })
})

// =============================================================================
// reverseMembers
// =============================================================================

describe("reverseMembers", () => {
  it("should emit only _en keys for bilingual fields", () => {
    const members: Member[] = [
      {
        accountId: "member01",
        firstName: { ja: null, en: "John" },
        middleName: { ja: null, en: null },
        lastName: { ja: null, en: "Doe" },
        email: "john@example.com",
        institution: { ja: null, en: "MIT" },
        division: { ja: null, en: "CS" },
        job: { ja: null, en: "Researcher" },
        eradid: "E001",
        orcid: null,
      },
    ]
    const result = reverseMembers(members)

    expect(findComponents(result, "member_account_id")).toEqual(["member01"])
    expect(findComponents(result, "member_first_name_en")).toEqual(["John"])
    expect(findComponents(result, "member_middle_name_en")).toEqual([])
    expect(findComponents(result, "member_last_name_en")).toEqual(["Doe"])
    expect(findComponents(result, "member_email")).toEqual([
      "john@example.com",
    ])
    expect(findComponents(result, "member_institution_en")).toEqual(["MIT"])
    expect(findComponents(result, "member_division_en")).toEqual(["CS"])
    expect(findComponents(result, "member_job_en")).toEqual(["Researcher"])
    expect(findComponents(result, "member_eradid")).toEqual(["E001"])
    expect(findComponents(result, "member_orcid")).toEqual([])
  })

  it("should return empty array for empty members", () => {
    expect(reverseMembers([])).toEqual([])
  })
})

// =============================================================================
// reverseUseDatasets
// =============================================================================

describe("reverseUseDatasets", () => {
  it("should generate components for each dataset", () => {
    const datasets: UseDataset[] = [
      { request: "JGAD000369", purpose: "研究利用", id: "JGAD000369" },
    ]
    const result = reverseUseDatasets(datasets)

    expect(findComponents(result, "use_dataset_request")).toEqual([
      "JGAD000369",
    ])
    expect(findComponents(result, "use_dataset_purpose")).toEqual(["研究利用"])
    expect(findComponents(result, "use_dataset_id")).toEqual(["JGAD000369"])
  })

  it("should return empty array for empty datasets", () => {
    expect(reverseUseDatasets([])).toEqual([])
  })
})

// =============================================================================
// reverseStatusHistory
// =============================================================================

describe("reverseStatusHistory", () => {
  it("should strip statusLabel and keep status + date", () => {
    const history: StatusHistoryEntry[] = [
      {
        status: 10,
        statusLabel: { ja: "申請書類作成中", en: "Preparing" },
        date: "2024-12-03T02:12:16.232+00:00",
      },
      {
        status: 60,
        statusLabel: { ja: "申請承認", en: "Approved" },
        date: "2024-12-03T02:29:02.957+00:00",
      },
    ]
    const result = reverseStatusHistory(history)

    expect(result).toEqual([
      { status: 10, date: "2024-12-03T02:12:16.232+00:00" },
      { status: 60, date: "2024-12-03T02:29:02.957+00:00" },
    ])
  })

  it("should return empty array for empty history", () => {
    expect(reverseStatusHistory([])).toEqual([])
  })
})

// =============================================================================
// Round-trip: DS application
// =============================================================================

describe("reverseDsApplication (round-trip)", () => {
  const exampleDs = {
    jds_id: "J-DS002495",
    jsub_ids: [] as string[],
    hum_ids: [] as string[],
    jga_ids: [] as string[],
    components: [
      { key: "submission_study_title", value: "テスト研究題目" },
      { key: "submission_study_title_en", value: "Test Study Title" },
      { key: "aim", value: "テスト目的" },
      { key: "aim_en", value: "Test Purpose" },
      { key: "method", value: "テスト方法" },
      { key: "method_en", value: "Test Method" },
      { key: "participant", value: "テスト対象" },
      { key: "participant_en", value: "Test Participants" },
      { key: "restriction", value: "テスト制限事項" },
      { key: "restriction_en", value: "Test Restrictions" },
      { key: "data_access", value: "submission_open" },
      { key: "study_type", value: "study_type_wgs" },
      { key: "file_format", value: "テキスト形式" },
      { key: "file_size", value: "100MB" },
      { key: "release_date", value: "2024-12-28" },
      { key: "icd10", value: "C00-C97" },
      { key: "group_id", value: "subgrp2116" },
      { key: "pi_account_id", value: "saga_general" },
      { key: "pi_email", value: "test@example.com" },
      { key: "pi_last_name", value: "テスト姓" },
      { key: "pi_first_name", value: "テスト名" },
      { key: "pi_last_name_en", value: "Saga" },
      { key: "pi_first_name_en", value: "Masakazu" },
      { key: "pi_institution", value: "テスト組織" },
      { key: "pi_institution_en", value: "Test Organization" },
      { key: "pi_division", value: "テストラボ" },
      { key: "pi_division_en", value: "Test Lab" },
      { key: "pi_job", value: "教授" },
      { key: "pi_job_en", value: "professor" },
      { key: "pi_phone", value: "012-345-6789" },
      { key: "head_name", value: "機関長太郎" },
      { key: "head_job", value: "所長" },
      { key: "head_phone", value: "098-765-4321" },
      { key: "head_email", value: "head@example.com" },
    ] as Component[],
    status_history: [
      { status: 10, date: "2024-12-03T02:12:16.232+00:00" },
      { status: 20, date: "2024-12-03T02:24:28.415+00:00" },
      { status: 40, date: "2024-12-03T02:28:59.089+00:00" },
      { status: 60, date: "2024-12-03T02:29:02.957+00:00" },
    ],
    submit_date: "2024-12-03T02:24:28.274+00:00",
    create_date: "2024-12-03T02:40:23.094+00:00",
  }

  it("should round-trip: transform(reverse(transform(raw))) == transform(raw)", () => {
    const transformed = transformDsApplication(exampleDs)
    const reversed = reverseDsApplication(transformed)
    const roundTripped = transformDsApplication(reversed)

    expect(roundTripped).toEqual(transformed)
  })

  it("should reconstruct application metadata", () => {
    const transformed = transformDsApplication(exampleDs)
    const reversed = reverseDsApplication(transformed)

    expect(reversed.jds_id).toBe("J-DS002495")
    expect(reversed.jsub_ids).toEqual([])
    expect(reversed.hum_ids).toEqual([])
    expect(reversed.jga_ids).toEqual([])
    expect(reversed.submit_date).toBe("2024-12-03T02:24:28.274+00:00")
    expect(reversed.create_date).toBe("2024-12-03T02:40:23.094+00:00")
  })
})

// =============================================================================
// Round-trip: DU application
// =============================================================================

describe("reverseDuApplication (round-trip)", () => {
  const exampleDu = {
    jdu_id: "J-DU006529",
    jgad_ids: ["JGAD000369"],
    jgas_ids: ["JGAS000001"],
    hum_ids: ["hum0273"],
    components: [
      { key: "use_study_title", value: "テスト利用研究" },
      { key: "use_study_title_en", value: "Test Data Use Study" },
      { key: "use_purpose", value: "テスト利用目的" },
      { key: "use_summary", value: "テスト利用概要" },
      { key: "use_publication", value: "テスト発表予定" },
      { key: "use_dataset_request", value: "JGAD000369" },
      { key: "use_dataset_purpose", value: "データセット利用目的の説明" },
      { key: "use_period_start", value: "2024-12-01" },
      { key: "use_period_end", value: "2025-11-30" },
      { key: "server_status", value: "onpre" },
      {
        key: "public_key",
        value: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ...",
      },
      { key: "group_id", value: "usegrp1234" },
      { key: "pi_account_id", value: "user_general" },
      { key: "pi_email", value: "user@example.com" },
      { key: "pi_last_name", value: "利用者姓" },
      { key: "pi_first_name", value: "利用者名" },
      { key: "pi_last_name_en", value: "User" },
      { key: "pi_first_name_en", value: "Test" },
      { key: "pi_institution", value: "利用大学" },
      { key: "pi_institution_en", value: "User University" },
      { key: "pi_division", value: "利用研究科" },
      { key: "pi_division_en", value: "User Lab" },
      { key: "pi_job", value: "准教授" },
      { key: "pi_job_en", value: "associate professor" },
      { key: "submitter_account_id", value: "user_general" },
      { key: "submitter_email", value: "user@example.com" },
      { key: "member_account_id", value: "member01" },
      { key: "member_email", value: "member@example.com" },
      { key: "member_last_name_en", value: "Member" },
      { key: "member_first_name_en", value: "Test" },
      { key: "collaborator_name", value: "共同研究者太郎" },
      { key: "collaborator_division", value: "共同研究機関" },
      { key: "is_agree_mail_use", value: "ok" },
    ] as Component[],
    status_history: [
      { status: 10, date: "2024-11-22T05:01:28.200+00:00" },
      { status: 20, date: "2024-11-22T05:30:00.000+00:00" },
      { status: 40, date: "2024-11-25T10:00:00.000+00:00" },
      { status: 60, date: "2024-11-28T15:00:00.000+00:00" },
    ],
    submit_date: "2024-11-22T05:30:00.000+00:00",
    create_date: "2024-11-22T05:01:28.194+00:00",
  }

  it("should round-trip: transform(reverse(transform(raw))) == transform(raw)", () => {
    const transformed = transformDuApplication(exampleDu)
    const reversed = reverseDuApplication(transformed)
    const roundTripped = transformDuApplication(reversed)

    expect(roundTripped).toEqual(transformed)
  })

  it("should reconstruct application metadata", () => {
    const transformed = transformDuApplication(exampleDu)
    const reversed = reverseDuApplication(transformed)

    expect(reversed.jdu_id).toBe("J-DU006529")
    expect(reversed.jgad_ids).toEqual(["JGAD000369"])
    expect(reversed.jgas_ids).toEqual(["JGAS000001"])
    expect(reversed.hum_ids).toEqual(["hum0273"])
    expect(reversed.submit_date).toBe("2024-11-22T05:30:00.000+00:00")
    expect(reversed.create_date).toBe("2024-11-22T05:01:28.194+00:00")
  })
})

// =============================================================================
// Edge cases
// =============================================================================

describe("edge cases", () => {
  const allNullDs: DsApplicationTransformed = {
    jdsId: "J-DS000001",
    jsubIds: [],
    humIds: [],
    jgaIds: [],
    studyTitle: { ja: null, en: null },
    aim: { ja: null, en: null },
    method: { ja: null, en: null },
    participant: { ja: null, en: null },
    restriction: { ja: null, en: null },
    publication: null,
    icd10: null,
    data: [],
    releaseDate: null,
    deIdentification: { status: null, date: null, reason: null },
    review: {
      submissionStatus: null,
      submissionDate: null,
      companyUseStatus: null,
      multicenterCollaborativeStudyStatus: null,
      nbdcDataProcessingStatus: null,
      nbdcDataProcessingReason: null,
      nbdcGuidelineStatus: null,
      isSimplifiedReview: null,
    },
    head: { name: null, job: null, phone: null, email: null },
    pi: {
      accountId: null,
      firstName: { ja: null, en: null },
      middleName: { ja: null, en: null },
      lastName: { ja: null, en: null },
      institution: { ja: null, en: null },
      division: { ja: null, en: null },
      job: { ja: null, en: null },
      phone: null,
      email: null,
      address: {
        country: null,
        postalCode: null,
        prefecture: null,
        city: null,
        street: null,
      },
    },
    submitter: {
      accountId: null,
      firstName: { ja: null, en: null },
      middleName: { ja: null, en: null },
      lastName: { ja: null, en: null },
      institution: { ja: null, en: null },
      division: { ja: null, en: null },
      job: { ja: null, en: null },
      phone: null,
      email: null,
      address: {
        country: null,
        postalCode: null,
        prefecture: null,
        city: null,
        street: null,
      },
    },
    collaborators: [],
    uploadedFiles: [],
    control: {
      lang: null,
      groupId: null,
      isNoneCollaborator: null,
      privateComment: null,
      isDeclareStatement: null,
      isAgreeMailUse: null,
    },
    statusHistory: [],
    submitDate: "2024-01-01T00:00:00.000+00:00",
    createDate: "2024-01-01T00:00:00.000+00:00",
  }

  it("should handle all-null DS and produce empty components", () => {
    const reversed = reverseDsApplication(allNullDs)

    expect(reversed.components).toEqual([])
    expect(reversed.status_history).toEqual([])
  })

  it("should round-trip all-null DS", () => {
    const reversed = reverseDsApplication(allNullDs)
    const roundTripped = transformDsApplication(reversed)

    expect(roundTripped).toEqual(allNullDs)
  })

  it("should handle boolean null fields in control", () => {
    const result = reverseControl({
      lang: null,
      groupId: null,
      isNoneCollaborator: null,
      privateComment: null,
      isDeclareStatement: null,
      isAgreeMailUse: null,
    })

    expect(result).toEqual([])
  })
})
