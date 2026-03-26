/**
 * API request schema validation tests
 *
 * Verifies field inclusion/exclusion rules for nested schemas:
 * - relatedPublication: datasetIds accepted
 * - controlledAccessUser: datasetIds, researchTitle accepted
 * - dataProvider: datasetIds, researchTitle, periodOfDataUse rejected
 */
import { describe, expect, it } from "bun:test"

import {
  CreateResearchRequestSchema,
  UpdateResearchRequestSchema,
} from "@/api/types"

const bilingualText = { ja: "テスト", en: "Test" }
const bilingualTextValue = {
  ja: { text: "テスト", rawHtml: "テスト" },
  en: { text: "Test", rawHtml: "Test" },
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
