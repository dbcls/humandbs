import { describe, expect, it } from "bun:test"

import {
  createEmptySearchableFields,
  isEmptySearchableFields,
  parseSearchableFields,
} from "@/crawler/llm/extract"

describe("createEmptySearchableFields", () => {
  it("should return all fields with null or empty defaults", () => {
    const empty = createEmptySearchableFields()
    expect(empty.subjectCount).toBeNull()
    expect(empty.subjectCountType).toBeNull()
    expect(empty.healthStatus).toBeNull()
    expect(empty.diseases).toEqual([])
    expect(empty.tissues).toEqual([])
    expect(empty.isTumor).toBeNull()
    expect(empty.cellLine).toBeNull()
    expect(empty.population).toBeNull()
    expect(empty.assayType).toBeNull()
    expect(empty.libraryKits).toEqual([])
    expect(empty.platformVendor).toBeNull()
    expect(empty.platformModel).toBeNull()
    expect(empty.readType).toBeNull()
    expect(empty.readLength).toBeNull()
    expect(empty.targets).toBeNull()
    expect(empty.fileTypes).toEqual([])
    expect(empty.dataVolume).toBeNull()
  })
})

describe("isEmptySearchableFields", () => {
  it("should return true when all fields are default values", () => {
    const empty = createEmptySearchableFields()
    expect(isEmptySearchableFields(empty)).toBe(true)
  })

  it("should return false when a scalar field has a value", () => {
    const fields = { ...createEmptySearchableFields(), subjectCount: 10 }
    expect(isEmptySearchableFields(fields)).toBe(false)
  })

  it("should return false when an enum field has a value", () => {
    const fields = { ...createEmptySearchableFields(), healthStatus: "healthy" as const }
    expect(isEmptySearchableFields(fields)).toBe(false)
  })

  it("should return false when an array field has elements", () => {
    const fields = { ...createEmptySearchableFields(), diseases: [{ label: "cancer", icd10: null }] }
    expect(isEmptySearchableFields(fields)).toBe(false)
  })

  it("should return false when tissues array has elements", () => {
    const fields = { ...createEmptySearchableFields(), tissues: ["blood"] }
    expect(isEmptySearchableFields(fields)).toBe(false)
  })

  it("should return false when dataVolume has a value", () => {
    const fields = { ...createEmptySearchableFields(), dataVolume: { value: 1.5, unit: "TB" as const } }
    expect(isEmptySearchableFields(fields)).toBe(false)
  })
})

describe("parseSearchableFields", () => {
  it("should parse valid JSON with all fields", () => {
    const input = JSON.stringify({
      subjectCount: 30,
      subjectCountType: "individual",
      healthStatus: "mixed",
      diseases: [{ label: "lung cancer", icd10: "C34" }],
      tissues: ["tumor tissue", "blood"],
      isTumor: true,
      cellLine: null,
      population: "Japanese",
      assayType: "WGS",
      libraryKits: ["TruSeq DNA"],
      platformVendor: "Illumina",
      platformModel: "NovaSeq 6000",
      readType: "paired-end",
      readLength: 150,
      targets: null,
      fileTypes: ["FASTQ", "BAM"],
      dataVolume: { value: 1.5, unit: "TB" },
    })

    const result = parseSearchableFields(input)
    expect(result.subjectCount).toBe(30)
    expect(result.subjectCountType).toBe("individual")
    expect(result.healthStatus).toBe("mixed")
    expect(result.diseases).toEqual([{ label: "lung cancer", icd10: "C34" }])
    expect(result.tissues).toEqual(["tumor tissue", "blood"])
    expect(result.isTumor).toBe(true)
    expect(result.population).toBe("Japanese")
    expect(result.assayType).toBe("WGS")
    expect(result.libraryKits).toEqual(["TruSeq DNA"])
    expect(result.platformVendor).toBe("Illumina")
    expect(result.platformModel).toBe("NovaSeq 6000")
    expect(result.readType).toBe("paired-end")
    expect(result.readLength).toBe(150)
    expect(result.fileTypes).toEqual(["FASTQ", "BAM"])
    expect(result.dataVolume).toEqual({ value: 1.5, unit: "TB" })
  })

  it("should return empty fields for invalid JSON", () => {
    const result = parseSearchableFields("not json")
    expect(result).toEqual(createEmptySearchableFields())
  })

  it("should coerce invalid enum values to null", () => {
    const input = JSON.stringify({
      subjectCountType: "invalid",
      healthStatus: "unknown",
      readType: "other",
    })

    const result = parseSearchableFields(input)
    expect(result.subjectCountType).toBeNull()
    expect(result.healthStatus).toBeNull()
    expect(result.readType).toBeNull()
  })

  it("should coerce invalid types to defaults", () => {
    const input = JSON.stringify({
      subjectCount: "not a number",
      diseases: "not an array",
      tissues: 42,
      isTumor: "yes",
      dataVolume: { value: "bad", unit: "GB" },
    })

    const result = parseSearchableFields(input)
    expect(result.subjectCount).toBeNull()
    expect(result.diseases).toEqual([])
    expect(result.tissues).toEqual([])
    expect(result.isTumor).toBeNull()
    expect(result.dataVolume).toBeNull()
  })

  it("should handle partial input with missing fields", () => {
    const input = JSON.stringify({
      subjectCount: 10,
      assayType: "RNA-seq",
    })

    const result = parseSearchableFields(input)
    expect(result.subjectCount).toBe(10)
    expect(result.assayType).toBe("RNA-seq")
    expect(result.diseases).toEqual([])
    expect(result.tissues).toEqual([])
    expect(result.platformVendor).toBeNull()
  })

  it("should filter invalid disease entries", () => {
    const input = JSON.stringify({
      diseases: [
        { label: "valid", icd10: "C34" },
        { no_label: true },
        "just a string",
        null,
      ],
    })

    const result = parseSearchableFields(input)
    expect(result.diseases).toEqual([{ label: "valid", icd10: "C34" }])
  })

  it("should validate dataVolume unit", () => {
    const valid = JSON.stringify({ dataVolume: { value: 100, unit: "GB" } })
    expect(parseSearchableFields(valid).dataVolume).toEqual({ value: 100, unit: "GB" })

    const invalid = JSON.stringify({ dataVolume: { value: 100, unit: "PB" } })
    expect(parseSearchableFields(invalid).dataVolume).toBeNull()
  })
})
