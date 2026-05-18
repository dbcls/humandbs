import { describe, expect, it } from "bun:test"

import { mapDsApplicationToResearchTemplate } from "@/api/routes/templates/mapping-research"
import type { DsApplicationTransformed } from "@/crawler/types/jga-shinsei"

const buildJds = (
  overrides: Partial<DsApplicationTransformed> = {},
): DsApplicationTransformed => ({
  jdsId: "J-DS002494",
  jsubIds: [],
  humIds: [],
  jgaIds: [],
  studyTitle: { ja: "テスト研究", en: "Test Study" },
  aim: { ja: "テスト目的", en: "Test Aim" },
  method: { ja: "テスト方法", en: "Test Method" },
  participant: { ja: "テスト対象", en: "Test Participants" },
  restriction: { ja: "テスト制限", en: "Test Restrictions" },
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
    firstName: { ja: "テスト名", en: "Taro" },
    middleName: { ja: null, en: null },
    lastName: { ja: "テスト姓", en: "Yamada" },
    institution: { ja: "テスト大学", en: "Test University" },
    division: { ja: "テストラボ", en: "Test Lab" },
    job: { ja: null, en: null },
    phone: null,
    email: "pi@example.com",
    address: {
      country: "JP",
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
  submitDate: "2024-01-01",
  createDate: "2024-01-01",
  ...overrides,
})

describe("mapDsApplicationToResearchTemplate", () => {
  it("maps studyTitle / summary / dataProvider from the J-DS application", () => {
    const result = mapDsApplicationToResearchTemplate(buildJds())

    expect(result.title).toEqual({ ja: "テスト研究", en: "Test Study" })
    expect(result.summary).toEqual({
      aims: {
        ja: { text: "テスト目的" },
        en: { text: "Test Aim" },
      },
      methods: {
        ja: { text: "テスト方法" },
        en: { text: "Test Method" },
      },
      targets: {
        ja: { text: "テスト対象" },
        en: { text: "Test Participants" },
      },
      url: { ja: [], en: [] },
    })

    expect(result.dataProvider).toHaveLength(1)
    const pi = result.dataProvider![0]
    expect(pi.name).toEqual({
      ja: { text: "テスト姓 テスト名" },
      en: { text: "Taro Yamada" },
    })
    expect(pi.email).toBe("pi@example.com")
    expect(pi.organization).toEqual({
      name: {
        ja: { text: "テスト大学" },
        en: { text: "Test University" },
      },
      address: { country: "JP" },
    })
  })

  it("includes humId from first humIds[] entry and returns empty warnings", () => {
    const result = mapDsApplicationToResearchTemplate(
      buildJds({ humIds: ["hum0042"] }),
    )
    expect(result.humId).toBe("hum0042")
    expect(result.warnings).toEqual([])
  })

  it("filters jgaIds for JGAD prefix into relatedAccessions.jgad", () => {
    const result = mapDsApplicationToResearchTemplate(
      buildJds({
        jgaIds: [
          "JGAS000001",
          "JGAD000001",
          "JGAD000002",
          "JGAN000003",
          "JGAX000004",
        ],
      }),
    )
    expect(result.relatedAccessions.jgad).toEqual([
      "JGAD000001",
      "JGAD000002",
    ])
  })

  it("wraps publication string into relatedPublication[0]", () => {
    const result = mapDsApplicationToResearchTemplate(
      buildJds({ publication: "Nakamura et al., 2024" }),
    )
    expect(result.relatedPublication).toEqual([
      { title: { ja: null, en: "Nakamura et al., 2024" } },
    ])
  })

  it("returns empty relatedPublication when publication is null / whitespace", () => {
    expect(
      mapDsApplicationToResearchTemplate(buildJds({ publication: null }))
        .relatedPublication,
    ).toEqual([])
    expect(
      mapDsApplicationToResearchTemplate(buildJds({ publication: "   " }))
        .relatedPublication,
    ).toEqual([])
  })

  it("drops organization when both ja and en institution are empty", () => {
    const result = mapDsApplicationToResearchTemplate(
      buildJds({
        pi: {
          ...buildJds().pi,
          institution: { ja: null, en: null },
          address: {
            country: null,
            postalCode: null,
            prefecture: null,
            city: null,
            street: null,
          },
        },
      }),
    )
    expect(result.dataProvider![0].organization).toBeNull()
  })

  it("returns undefined humId when humIds is empty", () => {
    const result = mapDsApplicationToResearchTemplate(buildJds({ humIds: [] }))
    expect(result.humId).toBeUndefined()
    expect(result.warnings).toEqual([])
  })
})
