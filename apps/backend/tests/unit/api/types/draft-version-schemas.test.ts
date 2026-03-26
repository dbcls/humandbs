/**
 * draftVersion schema validation tests
 *
 * Tests EsResearchSchema draftVersion field and
 * ResearchDetailSchema unified response.
 */
import { describe, expect, it } from "bun:test"

import { ResearchDetailSchema } from "@/api/types/views"
import { EsResearchSchema } from "@/es/types"

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
    _seq_no: 1,
    _primary_term: 1,
  }

  it("always includes status, uids, draftVersion", () => {
    const result = ResearchDetailSchema.safeParse({
      ...baseDetail,
      status: "draft",
      uids: ["user-1"],
      draftVersion: "v2",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe("draft")
      expect(result.data.uids).toEqual(["user-1"])
      expect(result.data.draftVersion).toBe("v2")
    }
  })

  it("accepts published status with null draftVersion", () => {
    const result = ResearchDetailSchema.safeParse({
      ...baseDetail,
      status: "published",
      uids: [],
      draftVersion: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe("published")
      expect(result.data.uids).toEqual([])
      expect(result.data.draftVersion).toBeNull()
    }
  })

  it("excludes versionIds (internal field)", () => {
    const result = ResearchDetailSchema.safeParse({
      ...baseDetail,
      status: "published",
      uids: [],
      draftVersion: null,
      versionIds: ["hum0001.v1"],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect("versionIds" in result.data).toBe(false)
    }
  })

  it("includes optimistic locking fields", () => {
    const result = ResearchDetailSchema.safeParse({
      ...baseDetail,
      status: "published",
      uids: [],
      draftVersion: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data._seq_no).toBe(1)
      expect(result.data._primary_term).toBe(1)
    }
  })
})
