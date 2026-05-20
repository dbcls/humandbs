import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"

import type { DsApplicationTransformed } from "@/crawler/types/jga-shinsei"

// --- dblink stub state ------------------------------------------------------

const pubmedMap = new Map<string, string[]>()
const pubmedFailures = new Set<string>()

const fetchDblinkTargetsMock = mock(
  async (type: string, id: string, target: string, _requestId?: string): Promise<string[]> => {
    if (type !== "jga-study" || target !== "pubmed") return []
    if (pubmedFailures.has(id)) {
      throw new Error(`simulated dblink failure for ${id}`)
    }
    return pubmedMap.get(id) ?? []
  },
)

void mock.module("@/api/external/ddbj-search/dblink", () => ({
  DblinkAccessionType: {
    SRA_SUBMISSION: "sra-submission",
    SRA_STUDY: "sra-study",
    SRA_EXPERIMENT: "sra-experiment",
    SRA_RUN: "sra-run",
    SRA_SAMPLE: "sra-sample",
    SRA_ANALYSIS: "sra-analysis",
    JGA_STUDY: "jga-study",
    JGA_DATASET: "jga-dataset",
    JGA_DAC: "jga-dac",
    JGA_POLICY: "jga-policy",
    BIOPROJECT: "bioproject",
    BIOSAMPLE: "biosample",
    HUMANDBS: "humandbs",
    PUBMED: "pubmed",
  },
  fetchDblinkTargets: fetchDblinkTargetsMock,
  // mapping-research only uses fetchDblinkTargets, but expose a noop fetchDblink
  // for module-shape parity with the real export.
  fetchDblink: mock(async () => null),
}))

const { mapDsApplicationToResearchTemplate } = await import(
  "@/api/routes/templates/mapping-research"
)

// --- fixtures ---------------------------------------------------------------

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
    accountId: "pi-acct",
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
    accountId: "pi-acct",
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

beforeEach(() => {
  pubmedMap.clear()
  pubmedFailures.clear()
  fetchDblinkTargetsMock.mockClear()
})

afterEach(() => {
  pubmedMap.clear()
  pubmedFailures.clear()
})

// --- tests ------------------------------------------------------------------

describe("mapDsApplicationToResearchTemplate", () => {
  it("maps studyTitle / summary / dataProvider from the J-DS application", async () => {
    const result = await mapDsApplicationToResearchTemplate(buildJds())

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

    expect(result.dataProvider).toHaveLength(1) // same submitter de-duped
    const pi = result.dataProvider![0]
    expect(pi.name).toEqual({
      ja: { text: "テスト姓 テスト名" },
      en: { text: "Taro Yamada" },
    })
    expect(pi.email).toBe("pi@example.com")
    expect(pi.organization).toEqual({
      name: {
        ja: { text: "テスト大学 / テストラボ" },
        en: { text: "Test University / Test Lab" },
      },
      address: { country: "JP" },
    })
  })

  it("uses institution alone when division is empty", async () => {
    const base = buildJds()
    const result = await mapDsApplicationToResearchTemplate(
      buildJds({
        pi: { ...base.pi, division: { ja: null, en: null } },
      }),
    )
    expect(result.dataProvider![0].organization?.name).toEqual({
      ja: { text: "テスト大学" },
      en: { text: "Test University" },
    })
  })

  it("uses division alone when institution is empty", async () => {
    const base = buildJds()
    const result = await mapDsApplicationToResearchTemplate(
      buildJds({
        pi: { ...base.pi, institution: { ja: null, en: null } },
      }),
    )
    expect(result.dataProvider![0].organization?.name).toEqual({
      ja: { text: "テストラボ" },
      en: { text: "Test Lab" },
    })
  })

  it("drops organization when both institution and division are empty", async () => {
    const base = buildJds()
    const result = await mapDsApplicationToResearchTemplate(
      buildJds({
        pi: {
          ...base.pi,
          institution: { ja: null, en: null },
          division: { ja: null, en: null },
          address: {
            country: null,
            postalCode: null,
            prefecture: null,
            city: null,
            street: null,
          },
        },
        submitter: {
          ...base.submitter,
          institution: { ja: null, en: null },
          division: { ja: null, en: null },
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

  it("includes humId from first humIds[] entry and returns empty warnings", async () => {
    const result = await mapDsApplicationToResearchTemplate(
      buildJds({ humIds: ["hum0042"] }),
    )
    expect(result.humId).toBe("hum0042")
    expect(result.warnings).toEqual([])
  })

  it("filters jgaIds for JGAD prefix into relatedAccessions.jgad", async () => {
    const result = await mapDsApplicationToResearchTemplate(
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

  it("wraps publication string into relatedPublication[0] mirrored across ja and en", async () => {
    const result = await mapDsApplicationToResearchTemplate(
      buildJds({ publication: "Nakamura et al., 2024" }),
    )
    expect(result.relatedPublication).toEqual([
      { title: { ja: "Nakamura et al., 2024", en: "Nakamura et al., 2024" } },
    ])
  })

  it("returns empty relatedPublication when publication is null / whitespace and no JGAS pubmed", async () => {
    expect(
      (await mapDsApplicationToResearchTemplate(
        buildJds({ publication: null }),
      )).relatedPublication,
    ).toEqual([])
    expect(
      (await mapDsApplicationToResearchTemplate(
        buildJds({ publication: "   " }),
      )).relatedPublication,
    ).toEqual([])
  })

  it("returns undefined humId when humIds is empty", async () => {
    const result = await mapDsApplicationToResearchTemplate(
      buildJds({ humIds: [] }),
    )
    expect(result.humId).toBeUndefined()
    expect(result.warnings).toEqual([])
  })

  it("adds submitter as a second dataProvider when accountId differs", async () => {
    const base = buildJds()
    const result = await mapDsApplicationToResearchTemplate(
      buildJds({
        submitter: {
          ...base.submitter,
          accountId: "submitter-acct",
          firstName: { ja: "二郎", en: "Jiro" },
          lastName: { ja: "別人", en: "Other" },
          institution: { ja: "別大学", en: "Other University" },
          division: { ja: null, en: null },
          email: "submitter@example.com",
        },
      }),
    )
    expect(result.dataProvider).toHaveLength(2)
    expect(result.dataProvider![1].name).toEqual({
      ja: { text: "別人 二郎" },
      en: { text: "Jiro Other" },
    })
    expect(result.dataProvider![1].email).toBe("submitter@example.com")
    expect(result.dataProvider![1].organization?.name.en).toEqual({
      text: "Other University",
    })
  })

  it("skips submitter when its accountId matches the PI's", async () => {
    const result = await mapDsApplicationToResearchTemplate(buildJds())
    expect(result.dataProvider).toHaveLength(1)
  })

  it("falls back to name comparison when both accountIds are null", async () => {
    const base = buildJds()
    const sameName = await mapDsApplicationToResearchTemplate(
      buildJds({
        pi: { ...base.pi, accountId: null },
        submitter: { ...base.submitter, accountId: null },
      }),
    )
    expect(sameName.dataProvider).toHaveLength(1)

    const differentName = await mapDsApplicationToResearchTemplate(
      buildJds({
        pi: { ...base.pi, accountId: null },
        submitter: {
          ...base.submitter,
          accountId: null,
          firstName: { ja: "二郎", en: "Jiro" },
          lastName: { ja: "別人", en: "Other" },
        },
      }),
    )
    expect(differentName.dataProvider).toHaveLength(2)
  })

  it("appends PubMed IDs from JGAS dblink as relatedPublication entries", async () => {
    pubmedMap.set("JGAS000002", ["24215022"])
    const result = await mapDsApplicationToResearchTemplate(
      buildJds({
        jgaIds: ["JGAS000002", "JGAD000002"],
        publication: "doi: 10.1093/bioinformatics/btt647",
      }),
    )
    expect(result.relatedPublication).toEqual([
      {
        title: {
          ja: "doi: 10.1093/bioinformatics/btt647",
          en: "doi: 10.1093/bioinformatics/btt647",
        },
      },
      { title: { ja: "PubMed: 24215022", en: "PubMed: 24215022" } },
    ])
  })

  it("de-duplicates PubMed IDs across multiple JGAS entries and mirrors text in ja/en", async () => {
    pubmedMap.set("JGAS000001", ["111", "222"])
    pubmedMap.set("JGAS000002", ["222", "333"])
    const result = await mapDsApplicationToResearchTemplate(
      buildJds({
        jgaIds: ["JGAS000001", "JGAS000002"],
        publication: null,
      }),
    )
    const expected = ["PubMed: 111", "PubMed: 222", "PubMed: 333"]
    expect(result.relatedPublication?.map((p) => p.title.en)).toEqual(expected)
    expect(result.relatedPublication?.map((p) => p.title.ja)).toEqual(expected)
  })

  it("records dblink failure as a warning and continues", async () => {
    pubmedFailures.add("JGAS000002")
    pubmedMap.set("JGAS000003", ["999"])
    const result = await mapDsApplicationToResearchTemplate(
      buildJds({
        jgaIds: ["JGAS000002", "JGAS000003"],
        publication: null,
      }),
    )
    expect(result.relatedPublication).toEqual([
      { title: { ja: "PubMed: 999", en: "PubMed: 999" } },
    ])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain("JGAS000002")
    expect(result.warnings[0]).toContain("dblink to pubmed failed")
  })

  it("does not call dblink when there are no JGAS accessions", async () => {
    fetchDblinkTargetsMock.mockClear()
    await mapDsApplicationToResearchTemplate(
      buildJds({ jgaIds: ["JGAD000001"] }),
    )
    expect(fetchDblinkTargetsMock).not.toHaveBeenCalled()
  })
})
