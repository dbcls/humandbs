import { describe, expect, it } from "bun:test"

import {
  createEmptyExtractedFields,
  isEmptyExtractedFields,
  parseExtractedFields,
  aggregateToSearchable,
} from "@/crawler/llm/extract"
import type { ExtractedExperiment } from "@/crawler/types"

describe("createEmptyExtractedFields", () => {
  it("should return all fields with null or empty defaults", () => {
    const empty = createEmptyExtractedFields()
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

describe("isEmptyExtractedFields", () => {
  it("should return true when all fields are default values", () => {
    const empty = createEmptyExtractedFields()
    expect(isEmptyExtractedFields(empty)).toBe(true)
  })

  it("should return false when a scalar field has a value", () => {
    const fields = { ...createEmptyExtractedFields(), subjectCount: 10 }
    expect(isEmptyExtractedFields(fields)).toBe(false)
  })

  it("should return false when an enum field has a value", () => {
    const fields = { ...createEmptyExtractedFields(), healthStatus: "healthy" as const }
    expect(isEmptyExtractedFields(fields)).toBe(false)
  })

  it("should return false when an array field has elements", () => {
    const fields = { ...createEmptyExtractedFields(), diseases: [{ label: "cancer", icd10: null }] }
    expect(isEmptyExtractedFields(fields)).toBe(false)
  })

  it("should return false when tissues array has elements", () => {
    const fields = { ...createEmptyExtractedFields(), tissues: ["blood"] }
    expect(isEmptyExtractedFields(fields)).toBe(false)
  })

  it("should return false when dataVolume has a value", () => {
    const fields = { ...createEmptyExtractedFields(), dataVolume: { value: 1.5, unit: "TB" as const } }
    expect(isEmptyExtractedFields(fields)).toBe(false)
  })
})

describe("parseExtractedFields", () => {
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

    const result = parseExtractedFields(input)
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
    const result = parseExtractedFields("not json")
    expect(result).toEqual(createEmptyExtractedFields())
  })

  it("should coerce invalid enum values to null", () => {
    const input = JSON.stringify({
      subjectCountType: "invalid",
      healthStatus: "unknown",
      readType: "other",
    })

    const result = parseExtractedFields(input)
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

    const result = parseExtractedFields(input)
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

    const result = parseExtractedFields(input)
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

    const result = parseExtractedFields(input)
    expect(result.diseases).toEqual([{ label: "valid", icd10: "C34" }])
  })

  it("should validate dataVolume unit", () => {
    const valid = JSON.stringify({ dataVolume: { value: 100, unit: "GB" } })
    expect(parseExtractedFields(valid).dataVolume).toEqual({ value: 100, unit: "GB" })

    const invalid = JSON.stringify({ dataVolume: { value: 100, unit: "PB" } })
    expect(parseExtractedFields(invalid).dataVolume).toBeNull()
  })
})

describe("aggregateToSearchable", () => {
  const makeExperiment = (fields: Partial<ReturnType<typeof createEmptyExtractedFields>>): ExtractedExperiment => ({
    header: { ja: null, en: null },
    data: {},
    footers: { ja: [], en: [] },
    extracted: { ...createEmptyExtractedFields(), ...fields },
  })

  it("should aggregate diseases without duplicates", () => {
    const experiments = [
      makeExperiment({ diseases: [{ label: "cancer", icd10: "C34" }] }),
      makeExperiment({ diseases: [{ label: "cancer", icd10: "C34" }, { label: "diabetes", icd10: null }] }),
    ]

    const result = aggregateToSearchable(experiments)
    expect(result.diseases).toEqual([
      { label: "cancer", icd10: "C34" },
      { label: "diabetes", icd10: null },
    ])
  })

  it("should sum subject counts", () => {
    const experiments = [
      makeExperiment({ subjectCount: 10 }),
      makeExperiment({ subjectCount: 20 }),
      makeExperiment({ subjectCount: null }),
    ]

    const result = aggregateToSearchable(experiments)
    expect(result.totalSubjectCount).toBe(30)
  })

  it("should return null for totalSubjectCount when all null", () => {
    const experiments = [
      makeExperiment({ subjectCount: null }),
    ]

    const result = aggregateToSearchable(experiments)
    expect(result.totalSubjectCount).toBeNull()
  })

  it("should aggregate data volume in GB", () => {
    const experiments = [
      makeExperiment({ dataVolume: { value: 500, unit: "GB" } }),
      makeExperiment({ dataVolume: { value: 1, unit: "TB" } }),
    ]

    const result = aggregateToSearchable(experiments)
    expect(result.totalDataVolume).toEqual({ value: 1.49, unit: "TB" })
  })

  it("should collect unique platforms", () => {
    const experiments = [
      makeExperiment({ platformVendor: "Illumina", platformModel: "NovaSeq 6000" }),
      makeExperiment({ platformVendor: "Illumina", platformModel: "NovaSeq 6000" }),
      makeExperiment({ platformVendor: "Illumina", platformModel: "HiSeq 2000" }),
    ]

    const result = aggregateToSearchable(experiments)
    expect(result.platforms).toEqual([
      { vendor: "Illumina", model: "NovaSeq 6000" },
      { vendor: "Illumina", model: "HiSeq 2000" },
    ])
  })

  it("should detect healthy control", () => {
    const experiments = [
      makeExperiment({ healthStatus: "affected" }),
      makeExperiment({ healthStatus: "healthy" }),
    ]

    const result = aggregateToSearchable(experiments)
    expect(result.hasHealthyControl).toBe(true)
  })

  it("should detect tumor and cell line", () => {
    const experiments = [
      makeExperiment({ isTumor: true, cellLine: "HeLa" }),
    ]

    const result = aggregateToSearchable(experiments)
    expect(result.hasTumor).toBe(true)
    expect(result.hasCellLine).toBe(true)
  })

  it("should collect unique tissues, populations, assayTypes, readTypes, fileTypes", () => {
    const experiments = [
      makeExperiment({
        tissues: ["blood", "skin"],
        population: "Japanese",
        assayType: "WGS",
        readType: "paired-end",
        fileTypes: ["FASTQ"],
      }),
      makeExperiment({
        tissues: ["blood", "liver"],
        population: "European",
        assayType: "WGS",
        readType: "paired-end",
        fileTypes: ["FASTQ", "BAM"],
      }),
    ]

    const result = aggregateToSearchable(experiments)
    expect(result.tissues).toEqual(["blood", "skin", "liver"])
    expect(result.populations).toEqual(["Japanese", "European"])
    expect(result.assayTypes).toEqual(["WGS"])
    expect(result.readTypes).toEqual(["paired-end"])
    expect(result.fileTypes).toEqual(["FASTQ", "BAM"])
  })
})
