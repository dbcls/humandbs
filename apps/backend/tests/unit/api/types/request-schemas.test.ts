/**
 * API request schema validation tests
 *
 * Verifies field inclusion/exclusion rules for nested schemas:
 * - relatedPublication: datasetIds accepted
 * - controlledAccessUser: datasetIds, researchTitle accepted
 * - dataProvider: datasetIds, researchTitle, periodOfDataUse rejected
 * - rawHtml: stripped from all create/update request schemas
 */
import { describe, expect, it } from "bun:test"

import {
  CreateDatasetRequestSchema,
  CreateResearchRequestSchema,
  CreateVersionRequestSchema,
  UpdateDatasetRequestSchema,
  UpdateResearchRequestSchema,
} from "@/api/types"

const bilingualText = { ja: "テスト", en: "Test" }
const bilingualTextValue = {
  ja: { text: "テスト" },
  en: { text: "Test" },
}

const validPerson = {
  name: bilingualTextValue,
  email: "test@example.com",
  orcid: "0000-0000-0000-0001",
  organization: {
    name: bilingualTextValue,
    address: { country: "Japan" },
  },
}

describe("relatedPublication schema", () => {
  it("accepts datasetIds", () => {
    const result = UpdateResearchRequestSchema.safeParse({
      relatedPublication: [
        { title: bilingualText, doi: "10.1234/test", datasetIds: ["JGAD000001", "JGAD000002"] },
      ],
      _seq_no: 1,
      _primary_term: 1,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.relatedPublication?.[0].datasetIds).toEqual(["JGAD000001", "JGAD000002"])
    }
  })

  it("accepts empty datasetIds", () => {
    const result = UpdateResearchRequestSchema.safeParse({
      relatedPublication: [
        { title: bilingualText, doi: "10.1234/test", datasetIds: [] },
      ],
      _seq_no: 1,
      _primary_term: 1,
    })

    expect(result.success).toBe(true)
  })

  it("accepts omitted datasetIds", () => {
    const result = UpdateResearchRequestSchema.safeParse({
      relatedPublication: [
        { title: bilingualText, doi: "10.1234/test" },
      ],
      _seq_no: 1,
      _primary_term: 1,
    })

    expect(result.success).toBe(true)
  })

  it("accepts datasetIds in CreateResearchRequestSchema", () => {
    const result = CreateResearchRequestSchema.safeParse({
      relatedPublication: [
        { title: bilingualText, datasetIds: ["JGAD000001"] },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.relatedPublication?.[0].datasetIds).toEqual(["JGAD000001"])
    }
  })
})

describe("controlledAccessUser schema", () => {
  it("accepts datasetIds and researchTitle", () => {
    const result = UpdateResearchRequestSchema.safeParse({
      controlledAccessUser: [
        {
          ...validPerson,
          datasetIds: ["JGAD000001"],
          researchTitle: bilingualText,
          periodOfDataUse: { startDate: "2025-01-01", endDate: "2026-12-31" },
        },
      ],
      _seq_no: 1,
      _primary_term: 1,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      const cau = result.data.controlledAccessUser?.[0]
      expect(cau?.datasetIds).toEqual(["JGAD000001"])
      expect(cau?.researchTitle).toEqual(bilingualText)
      expect(cau?.periodOfDataUse).toEqual({ startDate: "2025-01-01", endDate: "2026-12-31" })
    }
  })

  it("accepts omitted optional fields", () => {
    const result = UpdateResearchRequestSchema.safeParse({
      controlledAccessUser: [validPerson],
      _seq_no: 1,
      _primary_term: 1,
    })

    expect(result.success).toBe(true)
  })
})

describe("dataProvider schema", () => {
  it("rejects datasetIds", () => {
    const result = UpdateResearchRequestSchema.safeParse({
      dataProvider: [
        { ...validPerson, datasetIds: ["JGAD000001"] },
      ],
      _seq_no: 1,
      _primary_term: 1,
    })

    // Zod .omit() strips unknown fields by default, so parse succeeds
    // but datasetIds is not in the parsed output
    expect(result.success).toBe(true)
    if (result.success) {
      const provider = result.data.dataProvider?.[0] as Record<string, unknown>
      expect("datasetIds" in provider).toBe(false)
    }
  })

  it("rejects researchTitle", () => {
    const result = UpdateResearchRequestSchema.safeParse({
      dataProvider: [
        { ...validPerson, researchTitle: bilingualText },
      ],
      _seq_no: 1,
      _primary_term: 1,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      const provider = result.data.dataProvider?.[0] as Record<string, unknown>
      expect("researchTitle" in provider).toBe(false)
    }
  })

  it("rejects periodOfDataUse", () => {
    const result = UpdateResearchRequestSchema.safeParse({
      dataProvider: [
        { ...validPerson, periodOfDataUse: { startDate: "2025-01-01", endDate: "2026-12-31" } },
      ],
      _seq_no: 1,
      _primary_term: 1,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      const provider = result.data.dataProvider?.[0] as Record<string, unknown>
      expect("periodOfDataUse" in provider).toBe(false)
    }
  })
})

describe("rawHtml exclusion from request schemas", () => {
  const summaryUrl = { ja: [], en: [] }

  it("CreateResearchRequestSchema: minimal payload without rawHtml is valid", () => {
    const result = CreateResearchRequestSchema.safeParse({
      title: bilingualText,
      summary: {
        aims: bilingualTextValue,
        methods: bilingualTextValue,
        targets: bilingualTextValue,
        url: summaryUrl,
      },
    })

    expect(result.success).toBe(true)
  })

  it("CreateResearchRequestSchema: rawHtml in payload is silently stripped", () => {
    const payloadWithRawHtml = {
      summary: {
        aims: {
          ja: { text: "目的", rawHtml: "<p>目的</p>" },
          en: { text: "Aims", rawHtml: "<p>Aims</p>" },
        },
        methods: bilingualTextValue,
        targets: bilingualTextValue,
        url: summaryUrl,
      },
    }
    const result = CreateResearchRequestSchema.safeParse(payloadWithRawHtml)

    expect(result.success).toBe(true)
    if (result.success) {
      const aimsJa = result.data.summary?.aims?.ja as Record<string, unknown>
      expect("rawHtml" in aimsJa).toBe(false)
      expect(aimsJa.text).toBe("目的")
    }
  })

  it("UpdateResearchRequestSchema: rawHtml in dataProvider.name is stripped", () => {
    const result = UpdateResearchRequestSchema.safeParse({
      dataProvider: [
        {
          name: {
            ja: { text: "名前", rawHtml: "<span>名前</span>" },
            en: { text: "Name", rawHtml: "<span>Name</span>" },
          },
        },
      ],
      _seq_no: 1,
      _primary_term: 1,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      const nameJa = result.data.dataProvider?.[0].name?.ja as Record<string, unknown>
      expect("rawHtml" in nameJa).toBe(false)
    }
  })

  it("CreateVersionRequestSchema: rawHtml in releaseNote is stripped", () => {
    const result = CreateVersionRequestSchema.safeParse({
      releaseNote: {
        ja: { text: "変更点", rawHtml: "<p>変更点</p>" },
        en: { text: "Changes", rawHtml: "<p>Changes</p>" },
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      const ja = result.data.releaseNote?.ja as Record<string, unknown>
      expect("rawHtml" in ja).toBe(false)
    }
  })

  it("CreateDatasetRequestSchema: rawHtml in experiments.header is stripped", () => {
    const result = CreateDatasetRequestSchema.safeParse({
      humId: "hum0001",
      humVersionId: "hum0001-v1",
      releaseDate: "2025-01-01",
      criteria: "Unrestricted-access",
      typeOfData: { ja: null, en: null },
      experiments: [
        {
          header: {
            ja: { text: "ヘッダ", rawHtml: "<th>ヘッダ</th>" },
            en: { text: "Header", rawHtml: "<th>Header</th>" },
          },
          data: {},
        },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      const header = result.data.experiments[0].header.ja as Record<string, unknown>
      expect("rawHtml" in header).toBe(false)
    }
  })

  it("UpdateDatasetRequestSchema: rawHtml in experiments is stripped", () => {
    const result = UpdateDatasetRequestSchema.safeParse({
      humId: "hum0001",
      humVersionId: "hum0001-v1",
      releaseDate: "2025-01-01",
      criteria: "Unrestricted-access",
      typeOfData: { ja: null, en: null },
      experiments: [
        {
          header: bilingualTextValue,
          data: {
            row1: {
              ja: { text: "値", rawHtml: "<td>値</td>" },
              en: { text: "Value", rawHtml: "<td>Value</td>" },
            },
          },
        },
      ],
      _seq_no: 1,
      _primary_term: 1,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      const cell = result.data.experiments[0].data.row1?.ja as Record<string, unknown>
      expect("rawHtml" in cell).toBe(false)
    }
  })
})
