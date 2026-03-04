import { describe, expect, it } from "bun:test"

import {
  buildCollaborators,
  buildDataGroup,
  buildMembers,
  buildStatusHistory,
  buildUploadedFiles,
  buildUseDatasets,
  createHelpers,
  toBooleanOrNull,
  transformDsApplication,
  transformDuApplication,
} from "../scripts/transform"
import type {
  Collaborator,
  Component,
  DataEntry,
  Member,
  UploadedFile,
  UseDataset,
} from "../scripts/types"

// =============================================================================
// toBooleanOrNull
// =============================================================================

describe("toBooleanOrNull", () => {
  it("should convert TRUE/true to true", () => {
    expect(toBooleanOrNull("TRUE")).toBe(true)
    expect(toBooleanOrNull("true")).toBe(true)
  })

  it("should convert ok to true", () => {
    expect(toBooleanOrNull("ok")).toBe(true)
  })

  it("should convert FALSE/false to false", () => {
    expect(toBooleanOrNull("FALSE")).toBe(false)
    expect(toBooleanOrNull("false")).toBe(false)
  })

  it("should return null for null/undefined", () => {
    expect(toBooleanOrNull(null)).toBeNull()
    expect(toBooleanOrNull(undefined)).toBeNull()
  })

  it("should return null for unrecognized strings", () => {
    expect(toBooleanOrNull("yes")).toBeNull()
    expect(toBooleanOrNull("no")).toBeNull()
    expect(toBooleanOrNull("")).toBeNull()
    expect(toBooleanOrNull("1")).toBeNull()
  })
})

// =============================================================================
// createHelpers
// =============================================================================

describe("createHelpers", () => {
  describe("getValue", () => {
    it("should return the first value for a key", () => {
      const components: Component[] = [
        { key: "aim", value: "テスト目的" },
        { key: "aim_en", value: "Test Aim" },
      ]
      const { getValue } = createHelpers(components)

      expect(getValue("aim")).toBe("テスト目的")
      expect(getValue("aim_en")).toBe("Test Aim")
    })

    it("should return null for missing keys", () => {
      const { getValue } = createHelpers([])
      expect(getValue("nonexistent")).toBeNull()
    })

    it("should return the first occurrence for duplicate keys", () => {
      const components: Component[] = [
        { key: "collaborator_name", value: "Alice" },
        { key: "collaborator_name", value: "Bob" },
      ]
      const { getValue } = createHelpers(components)
      expect(getValue("collaborator_name")).toBe("Alice")
    })
  })

  describe("getValues", () => {
    it("should return all values for a multiValue key", () => {
      const components: Component[] = [
        { key: "collaborator_name", value: "Alice" },
        { key: "collaborator_name", value: "Bob" },
        { key: "collaborator_name", value: "Charlie" },
      ]
      const { getValues } = createHelpers(components)
      expect(getValues("collaborator_name")).toEqual([
        "Alice",
        "Bob",
        "Charlie",
      ])
    })

    it("should return empty array for missing keys", () => {
      const { getValues } = createHelpers([])
      expect(getValues("nonexistent")).toEqual([])
    })

    it("should preserve insertion order", () => {
      const components: Component[] = [
        { key: "data_access", value: "open" },
        { key: "study_type", value: "wgs" },
        { key: "data_access", value: "controlled" },
      ]
      const { getValues } = createHelpers(components)
      expect(getValues("data_access")).toEqual(["open", "controlled"])
      expect(getValues("study_type")).toEqual(["wgs"])
    })
  })
})

// =============================================================================
// buildCollaborators
// =============================================================================

describe("buildCollaborators", () => {
  it("should pair multiValue keys by index", () => {
    const components: Component[] = [
      { key: "collaborator_name", value: "Alice" },
      { key: "collaborator_name", value: "Bob" },
      { key: "collaborator_division", value: "Div A" },
      { key: "collaborator_division", value: "Div B" },
      { key: "collaborator_job", value: "Prof" },
      { key: "collaborator_job", value: "Assoc Prof" },
    ]
    const { getValues } = createHelpers(components)
    const result = buildCollaborators(getValues)

    expect(result).toEqual([
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
    ] satisfies Collaborator[])
  })

  it("should handle uneven array lengths with null padding", () => {
    const components: Component[] = [
      { key: "collaborator_name", value: "Alice" },
      { key: "collaborator_name", value: "Bob" },
      { key: "collaborator_division", value: "Div A" },
    ]
    const { getValues } = createHelpers(components)
    const result = buildCollaborators(getValues)

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe("Alice")
    expect(result[0].division).toBe("Div A")
    expect(result[1].name).toBe("Bob")
    expect(result[1].division).toBeNull()
  })

  it("should return empty array when no collaborator components exist", () => {
    const { getValues } = createHelpers([])
    expect(buildCollaborators(getValues)).toEqual([])
  })
})

// =============================================================================
// buildDataGroup
// =============================================================================

describe("buildDataGroup", () => {
  it("should build data entries from multiValue keys", () => {
    const components: Component[] = [
      { key: "data_access", value: "submission_open" },
      { key: "study_type", value: "study_type_wgs" },
      { key: "file_format", value: "CRAM" },
      { key: "file_size", value: "500GB" },
    ]
    const { getValues } = createHelpers(components)
    const result = buildDataGroup(getValues)

    expect(result).toEqual([
      {
        dataAccess: "submission_open",
        studyType: "study_type_wgs",
        studyTypeOther: null,
        target: null,
        fileFormat: "CRAM",
        fileSize: "500GB",
      },
    ] satisfies DataEntry[])
  })

  it("should handle multiple data entries", () => {
    const components: Component[] = [
      { key: "data_access", value: "submission_open" },
      { key: "data_access", value: "submission_type1" },
      { key: "study_type", value: "wgs" },
      { key: "study_type", value: "wes" },
      { key: "file_format", value: "CRAM" },
      { key: "file_format", value: "VCF" },
    ]
    const { getValues } = createHelpers(components)
    const result = buildDataGroup(getValues)

    expect(result).toHaveLength(2)
    expect(result[0].dataAccess).toBe("submission_open")
    expect(result[0].studyType).toBe("wgs")
    expect(result[1].dataAccess).toBe("submission_type1")
    expect(result[1].studyType).toBe("wes")
  })

  it("should return empty array when no data components exist", () => {
    const { getValues } = createHelpers([])
    expect(buildDataGroup(getValues)).toEqual([])
  })
})

// =============================================================================
// buildUploadedFiles
// =============================================================================

describe("buildUploadedFiles", () => {
  it("should pair file and type by index", () => {
    const components: Component[] = [
      { key: "uploaded_file", value: "ethics.pdf" },
      { key: "uploaded_file", value: "consent.pdf" },
      { key: "uploaded_file_type", value: "ethics_review" },
      { key: "uploaded_file_type", value: "consent_form" },
    ]
    const { getValues } = createHelpers(components)
    const result = buildUploadedFiles(getValues)

    expect(result).toEqual([
      { file: "ethics.pdf", type: "ethics_review" },
      { file: "consent.pdf", type: "consent_form" },
    ] satisfies UploadedFile[])
  })

  it("should return empty array when no file components exist", () => {
    const { getValues } = createHelpers([])
    expect(buildUploadedFiles(getValues)).toEqual([])
  })
})

// =============================================================================
// buildMembers
// =============================================================================

describe("buildMembers", () => {
  it("should build member objects from multiValue keys", () => {
    const components: Component[] = [
      { key: "member_account_id", value: "user01" },
      { key: "member_first_name_en", value: "John" },
      { key: "member_last_name_en", value: "Doe" },
      { key: "member_email", value: "john@example.com" },
    ]
    const { getValues } = createHelpers(components)
    const result = buildMembers(getValues)

    expect(result).toEqual([
      {
        accountId: "user01",
        firstName: { ja: null, en: "John" },
        middleName: { ja: null, en: null },
        lastName: { ja: null, en: "Doe" },
        email: "john@example.com",
        institution: { ja: null, en: null },
        division: { ja: null, en: null },
        job: { ja: null, en: null },
        eradid: null,
        orcid: null,
      },
    ] satisfies Member[])
  })

  it("should return empty array when no member components exist", () => {
    const { getValues } = createHelpers([])
    expect(buildMembers(getValues)).toEqual([])
  })
})

// =============================================================================
// buildUseDatasets
// =============================================================================

describe("buildUseDatasets", () => {
  it("should build use dataset objects", () => {
    const components: Component[] = [
      { key: "use_dataset_request", value: "JGAD000369" },
      { key: "use_dataset_purpose", value: "研究利用" },
      { key: "use_dataset_id", value: "JGAD000369" },
    ]
    const { getValues } = createHelpers(components)
    const result = buildUseDatasets(getValues)

    expect(result).toEqual([
      {
        request: "JGAD000369",
        purpose: "研究利用",
        id: "JGAD000369",
      },
    ] satisfies UseDataset[])
  })

  it("should return empty array when no dataset components exist", () => {
    const { getValues } = createHelpers([])
    expect(buildUseDatasets(getValues)).toEqual([])
  })
})

// =============================================================================
// buildStatusHistory
// =============================================================================

describe("buildStatusHistory", () => {
  it("should add status labels", () => {
    const rawHistory = [
      { status: 10, date: "2024-12-03T02:12:16.232+00:00" },
      { status: 60, date: "2024-12-03T02:29:02.957+00:00" },
    ]
    const result = buildStatusHistory(rawHistory)

    expect(result).toEqual([
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
    ])
  })

  it("should return null labels for unknown status codes", () => {
    const rawHistory = [{ status: 99, date: "2024-01-01T00:00:00.000+00:00" }]
    const result = buildStatusHistory(rawHistory)

    expect(result[0].statusLabel).toEqual({ ja: null, en: null })
  })

  it("should handle empty history", () => {
    expect(buildStatusHistory([])).toEqual([])
  })
})

// =============================================================================
// transformDsApplication (integration)
// =============================================================================

describe("transformDsApplication", () => {
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

  it("should transform top-level IDs", () => {
    const result = transformDsApplication(exampleDs)
    expect(result.jdsId).toBe("J-DS002495")
    expect(result.jsubIds).toEqual([])
    expect(result.humIds).toEqual([])
    expect(result.jgaIds).toEqual([])
  })

  it("should transform bilingual text fields", () => {
    const result = transformDsApplication(exampleDs)
    expect(result.studyTitle).toEqual({
      ja: "テスト研究題目",
      en: "Test Study Title",
    })
    expect(result.aim).toEqual({ ja: "テスト目的", en: "Test Purpose" })
    expect(result.method).toEqual({ ja: "テスト方法", en: "Test Method" })
  })

  it("should transform PI nested object", () => {
    const result = transformDsApplication(exampleDs)
    expect(result.pi.accountId).toBe("saga_general")
    expect(result.pi.firstName).toEqual({ ja: "テスト名", en: "Masakazu" })
    expect(result.pi.lastName).toEqual({ ja: "テスト姓", en: "Saga" })
    expect(result.pi.middleName).toEqual({ ja: null, en: null })
    expect(result.pi.institution).toEqual({
      ja: "テスト組織",
      en: "Test Organization",
    })
    expect(result.pi.job).toEqual({ ja: "教授", en: "professor" })
    expect(result.pi.email).toBe("test@example.com")
  })

  it("should transform head nested object", () => {
    const result = transformDsApplication(exampleDs)
    expect(result.head).toEqual({
      name: "機関長太郎",
      job: "所長",
      phone: "098-765-4321",
      email: "head@example.com",
    })
  })

  it("should transform data group", () => {
    const result = transformDsApplication(exampleDs)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].dataAccess).toBe("submission_open")
    expect(result.data[0].studyType).toBe("study_type_wgs")
    expect(result.data[0].fileFormat).toBe("テキスト形式")
    expect(result.data[0].fileSize).toBe("100MB")
  })

  it("should transform status history with labels", () => {
    const result = transformDsApplication(exampleDs)
    expect(result.statusHistory).toHaveLength(4)
    expect(result.statusHistory[0].statusLabel).toEqual({
      ja: "申請書類作成中",
      en: "Preparing",
    })
    expect(result.statusHistory[3].statusLabel).toEqual({
      ja: "申請承認",
      en: "Approved",
    })
  })

  it("should set createDate from create_date", () => {
    const result = transformDsApplication(exampleDs)
    expect(result.createDate).toBe("2024-12-03T02:40:23.094+00:00")
  })

  it("should transform control fields", () => {
    const result = transformDsApplication(exampleDs)
    expect(result.control.groupId).toBe("subgrp2116")
  })

  it("should handle missing optional fields as null", () => {
    const result = transformDsApplication(exampleDs)
    expect(result.publication).toBeNull()
    expect(result.deIdentification.status).toBeNull()
    expect(result.review.submissionStatus).toBeNull()
    expect(result.pi.middleName).toEqual({ ja: null, en: null })
    expect(result.pi.address.country).toBeNull()
  })

  it("should return empty arrays for absent multiValue groups", () => {
    const result = transformDsApplication(exampleDs)
    expect(result.collaborators).toEqual([])
    expect(result.uploadedFiles).toEqual([])
  })
})

// =============================================================================
// transformDuApplication (integration)
// =============================================================================

describe("transformDuApplication", () => {
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
      { key: "public_key", value: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ..." },
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

  it("should transform top-level IDs", () => {
    const result = transformDuApplication(exampleDu)
    expect(result.jduId).toBe("J-DU006529")
    expect(result.jgadIds).toEqual(["JGAD000369"])
    expect(result.jgasIds).toEqual(["JGAS000001"])
    expect(result.humIds).toEqual(["hum0273"])
  })

  it("should transform DU-specific study fields", () => {
    const result = transformDuApplication(exampleDu)
    expect(result.studyTitle).toEqual({
      ja: "テスト利用研究",
      en: "Test Data Use Study",
    })
    expect(result.usePurpose).toBe("テスト利用目的")
    expect(result.useSummary).toBe("テスト利用概要")
    expect(result.usePublication).toBe("テスト発表予定")
  })

  it("should transform use datasets", () => {
    const result = transformDuApplication(exampleDu)
    expect(result.useDatasets).toHaveLength(1)
    expect(result.useDatasets[0].request).toBe("JGAD000369")
    expect(result.useDatasets[0].purpose).toBe("データセット利用目的の説明")
  })

  it("should transform use period", () => {
    const result = transformDuApplication(exampleDu)
    expect(result.usePeriod).toEqual({
      start: "2024-12-01",
      end: "2025-11-30",
    })
  })

  it("should transform server info", () => {
    const result = transformDuApplication(exampleDu)
    expect(result.server.status).toBe("onpre")
    expect(result.server.offPremiseStatus).toEqual([])
  })

  it("should transform public key", () => {
    const result = transformDuApplication(exampleDu)
    expect(result.publicKey.key).toBe(
      "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ...",
    )
    expect(result.publicKey.file).toBeNull()
    expect(result.publicKey.txt).toBeNull()
  })

  it("should transform members", () => {
    const result = transformDuApplication(exampleDu)
    expect(result.members).toHaveLength(1)
    expect(result.members[0].accountId).toBe("member01")
    expect(result.members[0].email).toBe("member@example.com")
    expect(result.members[0].lastName).toEqual({ ja: null, en: "Member" })
    expect(result.members[0].firstName).toEqual({ ja: null, en: "Test" })
  })

  it("should transform collaborators", () => {
    const result = transformDuApplication(exampleDu)
    expect(result.collaborators).toHaveLength(1)
    expect(result.collaborators[0].name).toBe("共同研究者太郎")
    expect(result.collaborators[0].division).toBe("共同研究機関")
  })

  it("should convert boolean flags", () => {
    const result = transformDuApplication(exampleDu)
    expect(result.control.isAgreeMailUse).toBe(true)
  })

  it("should set DU-specific null fields", () => {
    const result = transformDuApplication(exampleDu)
    expect(result.report.summary).toBeNull()
    expect(result.deletion.date).toBeNull()
    expect(result.distribution.status).toBeNull()
  })
})

// =============================================================================
// Edge cases
// =============================================================================

describe("edge cases", () => {
  it("should handle empty components array", () => {
    const raw = {
      jds_id: "J-DS000001",
      jsub_ids: [],
      hum_ids: [],
      jga_ids: [],
      components: [] as Component[],
      status_history: [],
      submit_date: "2024-01-01T00:00:00.000+00:00",
      create_date: "2024-01-01T00:00:00.000+00:00",
    }
    const result = transformDsApplication(raw)

    expect(result.jdsId).toBe("J-DS000001")
    expect(result.studyTitle).toEqual({ ja: null, en: null })
    expect(result.aim).toEqual({ ja: null, en: null })
    expect(result.data).toEqual([])
    expect(result.collaborators).toEqual([])
    expect(result.uploadedFiles).toEqual([])
    expect(result.head).toEqual({
      name: null,
      job: null,
      phone: null,
      email: null,
    })
    expect(result.statusHistory).toEqual([])
  })

  it("should handle multiValue group with only one key populated", () => {
    const components: Component[] = [
      { key: "collaborator_name", value: "Alice" },
    ]
    const { getValues } = createHelpers(components)
    const result = buildCollaborators(getValues)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Alice")
    expect(result[0].division).toBeNull()
    expect(result[0].job).toBeNull()
  })

  it("should handle 3+ collaborators correctly", () => {
    const components: Component[] = [
      { key: "collaborator_name", value: "A" },
      { key: "collaborator_name", value: "B" },
      { key: "collaborator_name", value: "C" },
      { key: "collaborator_division", value: "D1" },
      { key: "collaborator_division", value: "D2" },
      { key: "collaborator_division", value: "D3" },
      { key: "collaborator_eradid", value: "E1" },
      { key: "collaborator_eradid", value: "E2" },
      { key: "collaborator_eradid", value: "E3" },
    ]
    const { getValues } = createHelpers(components)
    const result = buildCollaborators(getValues)

    expect(result).toHaveLength(3)
    expect(result[2]).toEqual({
      name: "C",
      division: "D3",
      job: null,
      eradid: "E3",
      orcid: null,
      seminar: null,
    })
  })
})
