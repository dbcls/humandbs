/**
 * draftVersion schema validation tests
 *
 * Tests EsResearchSchema draftVersion field and
 * ResearchDetailSchema unified response.
 */
import { describe, expect, it } from "bun:test"

import { ResearchDetailSchema } from "@/api/types/views"
import { EsResearchSchema, ResearchVersionSchema } from "@/es/types"

import { createMockResearchDoc } from "../helpers/mock-es"

describe("EsResearchSchema draftVersion", () => {
  it("accepts draftVersion as string", () => {
    const doc = createMockResearchDoc({ draftVersion: "v2" })
    const result = EsResearchSchema.safeParse(doc)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.draftVersion).toBe("v2")
    }
  })

  it("accepts draftVersion as null", () => {
    const doc = createMockResearchDoc({ draftVersion: null })
    const result = EsResearchSchema.safeParse(doc)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.draftVersion).toBeNull()
    }
  })

  it("rejects missing draftVersion", () => {
    const { draftVersion, ...docWithout } = createMockResearchDoc()
    const result = EsResearchSchema.safeParse(docWithout)
    expect(result.success).toBe(false)
  })

  it("accepts latestVersion as null", () => {
    const doc = createMockResearchDoc({ latestVersion: null, draftVersion: "v1" })
    const result = EsResearchSchema.safeParse(doc)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.latestVersion).toBeNull()
    }
  })
})

describe("ResearchVersionSchema versionReleaseDate", () => {
  // Draft ResearchVersion docs (produced by .claude/draft-release.md ingest)
  // carry `versionReleaseDate: null` because the version has not yet been
  // released. Widening the schema to accept null is what lets
  // `searchResearches` mget over versionIds without throwing when a draft
  // rv lands in the top-N — the original 500-on-order=desc bug.
  const baseVersion = {
    humId: "hum0006",
    humVersionId: "hum0006-v8",
    version: "v8",
    datasets: [],
    releaseNote: { ja: null, en: null },
  }

  it("accepts versionReleaseDate as string (published rv)", () => {
    const result = ResearchVersionSchema.safeParse({
      ...baseVersion,
      versionReleaseDate: "2024-01-01",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.versionReleaseDate).toBe("2024-01-01")
    }
  })

  it("accepts versionReleaseDate as null (draft rv)", () => {
    const result = ResearchVersionSchema.safeParse({
      ...baseVersion,
      versionReleaseDate: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.versionReleaseDate).toBeNull()
    }
  })
})

describe("ResearchDetailSchema (unified)", () => {
  const baseDetail = {
    humId: "hum0001",
    url: { ja: "https://example.com", en: "https://example.com/en" },
    title: { ja: "Test", en: "Test" },
    summary: {
      aims: { ja: { text: "a", rawHtml: "a" }, en: { text: "a", rawHtml: "a" } },
      methods: { ja: { text: "m", rawHtml: "m" }, en: { text: "m", rawHtml: "m" } },
      targets: { ja: { text: "t", rawHtml: "t" }, en: { text: "t", rawHtml: "t" } },
      url: { ja: [], en: [] },
    },
    dataProvider: [],
    researchProject: [],
    grant: [],
    relatedPublication: [],
    controlledAccessUser: [],
    latestVersion: "v1",
    datePublished: "2024-01-01",
    dateModified: "2024-01-01",
    humVersionId: "hum0001.v1",
    version: "v1",
    versionReleaseDate: "2024-01-01",
    releaseNote: { ja: null, en: null },
    datasets: [],
  }

  it("always includes status and draftVersion", () => {
    const result = ResearchDetailSchema.safeParse({
      ...baseDetail,
      status: "draft",
      draftVersion: "v2",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe("draft")
      expect(result.data.draftVersion).toBe("v2")
    }
  })

  it("accepts published status with null draftVersion", () => {
    const result = ResearchDetailSchema.safeParse({
      ...baseDetail,
      status: "published",
      draftVersion: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe("published")
      expect(result.data.draftVersion).toBeNull()
    }
  })

  it("excludes versionIds (internal field)", () => {
    const result = ResearchDetailSchema.safeParse({
      ...baseDetail,
      status: "published",
      draftVersion: null,
      versionIds: ["hum0001.v1"],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect("versionIds" in result.data).toBe(false)
    }
  })

  it("excludes optimistic locking fields (lock travels in response meta)", () => {
    const result = ResearchDetailSchema.safeParse({
      ...baseDetail,
      status: "published",
      draftVersion: null,
      _seq_no: 1,
      _primary_term: 1,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect("_seq_no" in result.data).toBe(false)
      expect("_primary_term" in result.data).toBe(false)
    }
  })
})
