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
    expect(empty.sex).toBeNull()
    expect(empty.ageGroup).toBeNull()
    expect(empty.assayType).toBeNull()
    expect(empty.libraryKits).toEqual([])
    expect(empty.platformVendor).toBeNull()
    expect(empty.platformModel).toBeNull()
    expect(empty.readType).toBeNull()
    expect(empty.readLength).toBeNull()
    expect(empty.sequencingDepth).toBeNull()
    expect(empty.targetCoverage).toBeNull()
    expect(empty.referenceGenome).toBeNull()
    expect(empty.variantCounts).toBeNull()
    expect(empty.hasPhenotypeData).toBeNull()
    expect(empty.targets).toBeNull()
    expect(empty.fileTypes).toEqual([])
    expect(empty.processedDataTypes).toEqual([])
    expect(empty.dataVolumeGb).toBeNull()
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

  it("should return false when dataVolumeGb has a value", () => {
    const fields = { ...createEmptySearchableFields(), dataVolumeGb: 1536 }
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
      sex: "mixed",
      ageGroup: "adult",
      assayType: "WGS",
      libraryKits: ["TruSeq DNA"],
      platformVendor: "Illumina",
      platformModel: "NovaSeq 6000",
      readType: "paired-end",
      readLength: 150,
      sequencingDepth: 30,
      targetCoverage: 95,
      referenceGenome: "GRCh38",
      variantCounts: { snv: 5000000, indel: null, cnv: null, sv: null, total: null },
      hasPhenotypeData: true,
      targets: null,
      fileTypes: ["FASTQ", "BAM"],
      processedDataTypes: ["vcf"],
      dataVolumeGb: 1536,
    })

    const result = parseSearchableFields(input)
    expect(result.subjectCount).toBe(30)
    expect(result.subjectCountType).toBe("individual")
    expect(result.healthStatus).toBe("mixed")
    expect(result.diseases).toEqual([{ label: "lung cancer", icd10: "C34" }])
    expect(result.tissues).toEqual(["tumor tissue", "blood"])
    expect(result.isTumor).toBe(true)
    expect(result.population).toBe("Japanese")
    expect(result.sex).toBe("mixed")
    expect(result.ageGroup).toBe("adult")
    expect(result.assayType).toBe("WGS")
    expect(result.libraryKits).toEqual(["TruSeq DNA"])
    expect(result.platformVendor).toBe("Illumina")
    expect(result.platformModel).toBe("NovaSeq 6000")
    expect(result.readType).toBe("paired-end")
    expect(result.readLength).toBe(150)
    expect(result.sequencingDepth).toBe(30)
    expect(result.targetCoverage).toBe(95)
    expect(result.referenceGenome).toBe("GRCh38")
    expect(result.variantCounts).toEqual({ snv: 5000000, indel: null, cnv: null, sv: null, total: null })
    expect(result.hasPhenotypeData).toBe(true)
    expect(result.fileTypes).toEqual(["FASTQ", "BAM"])
    expect(result.processedDataTypes).toEqual(["vcf"])
    expect(result.dataVolumeGb).toBe(1536)
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
      dataVolumeGb: "not a number",
    })

    const result = parseSearchableFields(input)
    expect(result.subjectCount).toBeNull()
    expect(result.diseases).toEqual([])
    expect(result.tissues).toEqual([])
    expect(result.isTumor).toBeNull()
    expect(result.dataVolumeGb).toBeNull()
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

  it("should validate dataVolumeGb", () => {
    const valid = JSON.stringify({ dataVolumeGb: 100.5 })
    expect(parseSearchableFields(valid).dataVolumeGb).toBe(100.5)

    const invalid = JSON.stringify({ dataVolumeGb: "not a number" })
    expect(parseSearchableFields(invalid).dataVolumeGb).toBeNull()
  })

  it("should validate sex enum", () => {
    expect(parseSearchableFields(JSON.stringify({ sex: "male" })).sex).toBe("male")
    expect(parseSearchableFields(JSON.stringify({ sex: "female" })).sex).toBe("female")
    expect(parseSearchableFields(JSON.stringify({ sex: "mixed" })).sex).toBe("mixed")
    expect(parseSearchableFields(JSON.stringify({ sex: "invalid" })).sex).toBeNull()
  })

  it("should validate ageGroup enum", () => {
    expect(parseSearchableFields(JSON.stringify({ ageGroup: "infant" })).ageGroup).toBe("infant")
    expect(parseSearchableFields(JSON.stringify({ ageGroup: "child" })).ageGroup).toBe("child")
    expect(parseSearchableFields(JSON.stringify({ ageGroup: "adult" })).ageGroup).toBe("adult")
    expect(parseSearchableFields(JSON.stringify({ ageGroup: "elderly" })).ageGroup).toBe("elderly")
    expect(parseSearchableFields(JSON.stringify({ ageGroup: "mixed" })).ageGroup).toBe("mixed")
    expect(parseSearchableFields(JSON.stringify({ ageGroup: "invalid" })).ageGroup).toBeNull()
  })

  it("should validate variantCounts", () => {
    const valid = JSON.stringify({ variantCounts: { snv: 1000, indel: 500, cnv: null, sv: null, total: 1500 } })
    expect(parseSearchableFields(valid).variantCounts).toEqual({ snv: 1000, indel: 500, cnv: null, sv: null, total: 1500 })

    const invalid = JSON.stringify({ variantCounts: "not an object" })
    expect(parseSearchableFields(invalid).variantCounts).toBeNull()
  })
})
