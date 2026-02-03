/**
 * LLM field extraction for experiment data
 */
import { z } from "zod"

import type {
  Experiment,
  SearchableExperimentFields,
} from "@/crawler/types"
import { getErrorMessage } from "@/crawler/utils/error"
import { logger } from "@/crawler/utils/logger"

import { chat, type OllamaMessage, type OllamaConfig } from "./client"
import { EXTRACTION_PROMPT } from "./prompts"

// Zod Schemas - Shared enum and object definitions (single source of truth)

const SubjectCountTypeEnum = z.enum(["individual", "sample", "mixed"])
const HealthStatusEnum = z.enum(["healthy", "affected", "mixed"])
const SexEnum = z.enum(["male", "female", "mixed"])
const AgeGroupEnum = z.enum(["infant", "child", "adult", "elderly", "mixed"])
const ReadTypeEnum = z.enum(["single-end", "paired-end"])

const DiseaseInfoBaseSchema = z.object({
  label: z.string(),
  icd10: z.string().nullable(),
})

const PlatformInfoBaseSchema = z.object({
  vendor: z.string(),
  model: z.string(),
})

const VariantCountsBaseSchema = z.object({
  snv: z.number().nullable(),
  indel: z.number().nullable(),
  cnv: z.number().nullable(),
  sv: z.number().nullable(),
  total: z.number().nullable(),
})

/**
 * Base schema for LLM output (used for JSON Schema generation)
 * This is the single source of truth for field definitions
 */
const LlmOutputBaseSchema = z.object({
  subjectCount: z.number().nullable(),
  subjectCountType: SubjectCountTypeEnum.nullable(),
  healthStatus: HealthStatusEnum.nullable(),
  diseases: z.array(DiseaseInfoBaseSchema),
  tissues: z.array(z.string()),
  isTumor: z.boolean().nullable(),
  cellLine: z.array(z.string()),
  population: z.array(z.string()),
  sex: SexEnum.nullable(),
  ageGroup: AgeGroupEnum.nullable(),
  assayType: z.array(z.string()),
  libraryKits: z.array(z.string()),
  platforms: z.array(PlatformInfoBaseSchema),
  readType: ReadTypeEnum.nullable(),
  readLength: z.number().nullable(),
  sequencingDepth: z.number().nullable(),
  targetCoverage: z.number().nullable(),
  referenceGenome: z.array(z.string()),
  variantCounts: VariantCountsBaseSchema.nullable(),
  hasPhenotypeData: z.boolean().nullable(),
  targets: z.string().nullable(),
  fileTypes: z.array(z.string()),
  processedDataTypes: z.array(z.string()),
  dataVolumeGb: z.number().nullable(),
})

/** JSON Schema for Ollama structured outputs */
export const llmOutputJsonSchema = z.toJSONSchema(LlmOutputBaseSchema)

// Validation schemas with .catch() for error recovery

const DiseaseInfoWithCatch = DiseaseInfoBaseSchema.extend({
  icd10: z.string().nullable().catch(null),
}).strict()

const VariantCountsWithCatch = VariantCountsBaseSchema.extend({
  snv: z.number().nullable().catch(null),
  indel: z.number().nullable().catch(null),
  cnv: z.number().nullable().catch(null),
  sv: z.number().nullable().catch(null),
  total: z.number().nullable().catch(null),
}).strict()

const PlatformInfoWithCatch = PlatformInfoBaseSchema.extend({
  vendor: z.string().catch(""),
  model: z.string().catch(""),
}).strict()

/** Parse array with element-level filtering: invalid elements are dropped instead of failing the whole array */
const safeFilteredArray = <T extends z.ZodType>(schema: T) =>
  z.unknown().transform((val): z.output<T>[] => {
    if (!Array.isArray(val)) return []
    const results: z.output<T>[] = []
    for (const item of val) {
      const parsed = schema.safeParse(item)
      if (parsed.success) results.push(parsed.data)
    }
    return results
  })

/**
 * Validation schema with .catch() for graceful error recovery
 * Derives from LlmOutputBaseSchema but adds fallback values for invalid data
 */
export const SearchableExperimentFieldsSchema = z.object({
  subjectCount: z.number().nullable().catch(null),
  subjectCountType: SubjectCountTypeEnum.nullable().catch(null),
  healthStatus: HealthStatusEnum.nullable().catch(null),
  diseases: safeFilteredArray(DiseaseInfoWithCatch),
  tissues: z.array(z.string()).catch([]),
  isTumor: z.boolean().nullable().catch(null),
  cellLine: z.array(z.string()).catch([]),
  population: z.array(z.string()).catch([]),
  sex: SexEnum.nullable().catch(null),
  ageGroup: AgeGroupEnum.nullable().catch(null),
  assayType: z.array(z.string()).catch([]),
  libraryKits: z.array(z.string()).catch([]),
  platforms: safeFilteredArray(PlatformInfoWithCatch),
  readType: ReadTypeEnum.nullable().catch(null),
  readLength: z.number().nullable().catch(null),
  sequencingDepth: z.number().nullable().catch(null),
  targetCoverage: z.number().nullable().catch(null),
  referenceGenome: z.array(z.string()).catch([]),
  variantCounts: VariantCountsWithCatch.nullable().catch(null),
  hasPhenotypeData: z.boolean().nullable().catch(null),
  targets: z.string().nullable().catch(null),
  fileTypes: z.array(z.string()).catch([]),
  processedDataTypes: z.array(z.string()).catch([]),
  dataVolumeGb: z.number().nullable().catch(null),
})

// Validation Functions

/**
 * Create empty searchable fields with default values
 */
export const createEmptySearchableFields = (): SearchableExperimentFields => ({
  subjectCount: null,
  subjectCountType: null,
  healthStatus: null,
  diseases: [],
  tissues: [],
  isTumor: null,
  cellLine: [],
  population: [],
  sex: null,
  ageGroup: null,
  assayType: [],
  libraryKits: [],
  platforms: [],
  readType: null,
  readLength: null,
  sequencingDepth: null,
  targetCoverage: null,
  referenceGenome: [],
  variantCounts: null,
  hasPhenotypeData: null,
  targets: null,
  fileTypes: [],
  processedDataTypes: [],
  dataVolumeGb: null,
  policies: [],
})

/**
 * Check if searchable fields are all default (empty) values
 * Note: policies are excluded from this check as they are rule-based, not LLM-extracted
 */
export const isEmptySearchableFields = (fields: SearchableExperimentFields): boolean => {
  return (
    fields.subjectCount === null &&
    fields.subjectCountType === null &&
    fields.healthStatus === null &&
    fields.diseases.length === 0 &&
    fields.tissues.length === 0 &&
    fields.isTumor === null &&
    fields.cellLine.length === 0 &&
    fields.population.length === 0 &&
    fields.sex === null &&
    fields.ageGroup === null &&
    fields.assayType.length === 0 &&
    fields.libraryKits.length === 0 &&
    fields.platforms.length === 0 &&
    fields.readType === null &&
    fields.readLength === null &&
    fields.sequencingDepth === null &&
    fields.targetCoverage === null &&
    fields.referenceGenome.length === 0 &&
    fields.variantCounts === null &&
    fields.hasPhenotypeData === null &&
    fields.targets === null &&
    fields.fileTypes.length === 0 &&
    fields.processedDataTypes.length === 0 &&
    fields.dataVolumeGb === null
  )
}

/**
 * Parse LLM JSON output into SearchableExperimentFields
 * Note: policies are extracted separately (rule-based) and added as empty array here
 */
export const parseSearchableFields = (jsonStr: string): SearchableExperimentFields => {
  const empty = createEmptySearchableFields()

  try {
    const parsed = JSON.parse(jsonStr)
    const llmFields = SearchableExperimentFieldsSchema.parse(parsed)
    // Add empty policies array (will be populated by rule-based extraction)
    return {
      ...llmFields,
      policies: [],
    }
  } catch (error) {
    logger.error("Failed to parse LLM response", { error: getErrorMessage(error), preview: jsonStr.slice(0, 200) })
    return empty
  }
}

// LLM Input Conversion

/** Input structure for bilingual extraction (text only, no rawHtml) */
interface BilingualExperimentInput {
  en: {
    header: string | null
    data: Record<string, string | null>
    footers: string[]
  } | null
  ja: {
    header: string | null
    data: Record<string, string | null>
    footers: string[]
  } | null
  externalMetadata: Record<string, unknown> | null
}

/**
 * Convert Experiment to LLM input format
 * Extracts only text fields (excludes rawHtml to reduce token count)
 */
const convertUnifiedToLlmInput = (
  experiment: Experiment,
  originalMetadata: Record<string, unknown> | null,
): BilingualExperimentInput => {
  const jaData: Record<string, string | null> = {}
  const enData: Record<string, string | null> = {}

  for (const [key, value] of Object.entries(experiment.data)) {
    if (value) {
      jaData[key] = value.ja?.text ?? null
      enData[key] = value.en?.text ?? null
    } else {
      jaData[key] = null
      enData[key] = null
    }
  }

  return {
    en: experiment.header.en ? {
      header: experiment.header.en.text,
      data: enData,
      footers: experiment.footers.en.map(f => f.text),
    } : null,
    ja: experiment.header.ja ? {
      header: experiment.header.ja.text,
      data: jaData,
      footers: experiment.footers.ja.map(f => f.text),
    } : null,
    externalMetadata: originalMetadata,
  }
}

/**
 * Extract fields from Experiment using LLM
 */
export const extractFieldsFromExperiment = async (
  experiment: Experiment,
  originalMetadata: Record<string, unknown> | null,
  config: OllamaConfig,
): Promise<SearchableExperimentFields> => {
  const input = convertUnifiedToLlmInput(experiment, originalMetadata)
  const userContent = JSON.stringify(input, null, 2)

  const messages: OllamaMessage[] = [
    { role: "system", content: EXTRACTION_PROMPT },
    { role: "user", content: userContent },
  ]

  try {
    const response = await chat(messages, config, llmOutputJsonSchema)
    return parseSearchableFields(response)
  } catch (error) {
    logger.error("Failed to extract fields from LLM", { error: getErrorMessage(error) })
    return createEmptySearchableFields()
  }
}
