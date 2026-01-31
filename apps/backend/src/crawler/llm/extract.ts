/**
 * LLM field extraction for experiment data
 */
import { z } from "zod"

import type {
  TextValue,
  Experiment,
  SearchableExperimentFields,
} from "@/crawler/types"
import { getErrorMessage } from "@/crawler/utils/error"
import { logger } from "@/crawler/utils/logger"

import { chat, type OllamaMessage, type OllamaConfig } from "./client"
import { EXTRACTION_PROMPT } from "./prompts"

// Zod Schemas

const DiseaseInfoSchema = z.object({
  label: z.string(),
  icd10: z.string().nullable().catch(null),
}).strict()

const VariantCountsSchema = z.object({
  snv: z.number().nullable().catch(null),
  indel: z.number().nullable().catch(null),
  cnv: z.number().nullable().catch(null),
  sv: z.number().nullable().catch(null),
  total: z.number().nullable().catch(null),
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

export const SearchableExperimentFieldsSchema = z.object({
  subjectCount: z.number().nullable().catch(null),
  subjectCountType: z.enum(["individual", "sample", "mixed"]).nullable().catch(null),
  healthStatus: z.enum(["healthy", "affected", "mixed"]).nullable().catch(null),
  diseases: safeFilteredArray(DiseaseInfoSchema),
  tissues: z.array(z.string()).catch([]),
  isTumor: z.boolean().nullable().catch(null),
  cellLine: z.string().nullable().catch(null),
  population: z.string().nullable().catch(null),
  sex: z.enum(["male", "female", "mixed"]).nullable().catch(null),
  ageGroup: z.enum(["infant", "child", "adolescent", "adult", "elderly", "mixed"]).nullable().catch(null),
  assayType: z.string().nullable().catch(null),
  libraryKits: z.array(z.string()).catch([]),
  platformVendor: z.string().nullable().catch(null),
  platformModel: z.string().nullable().catch(null),
  readType: z.enum(["single-end", "paired-end"]).nullable().catch(null),
  readLength: z.number().nullable().catch(null),
  sequencingDepth: z.number().nullable().catch(null),
  targetCoverage: z.number().nullable().catch(null),
  referenceGenome: z.string().nullable().catch(null),
  variantCounts: VariantCountsSchema.nullable().catch(null),
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
  cellLine: null,
  population: null,
  sex: null,
  ageGroup: null,
  assayType: null,
  libraryKits: [],
  platformVendor: null,
  platformModel: null,
  readType: null,
  readLength: null,
  sequencingDepth: null,
  targetCoverage: null,
  referenceGenome: null,
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
    fields.cellLine === null &&
    fields.population === null &&
    fields.sex === null &&
    fields.ageGroup === null &&
    fields.assayType === null &&
    fields.libraryKits.length === 0 &&
    fields.platformVendor === null &&
    fields.platformModel === null &&
    fields.readType === null &&
    fields.readLength === null &&
    fields.sequencingDepth === null &&
    fields.targetCoverage === null &&
    fields.referenceGenome === null &&
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

/** Input structure for bilingual extraction from Unified structure */
interface BilingualExperimentInput {
  en: {
    header: TextValue | null
    data: Record<string, TextValue | null>
    footers: TextValue[]
  } | null
  ja: {
    header: TextValue | null
    data: Record<string, TextValue | null>
    footers: TextValue[]
  } | null
  externalMetadata: Record<string, unknown> | null
}

/**
 * Convert Experiment to LLM input format
 * Separates ja/en fields from unified structure for the prompt format
 */
const convertUnifiedToLlmInput = (
  experiment: Experiment,
  originalMetadata: Record<string, unknown> | null,
): BilingualExperimentInput => {
  const jaData: Record<string, TextValue | null> = {}
  const enData: Record<string, TextValue | null> = {}

  for (const [key, value] of Object.entries(experiment.data)) {
    if (value) {
      jaData[key] = value.ja
      enData[key] = value.en
    } else {
      jaData[key] = null
      enData[key] = null
    }
  }

  return {
    en: experiment.header.en ? {
      header: experiment.header.en,
      data: enData,
      footers: experiment.footers.en,
    } : null,
    ja: experiment.header.ja ? {
      header: experiment.header.ja,
      data: jaData,
      footers: experiment.footers.ja,
    } : null,
    externalMetadata: originalMetadata,
  }
}

/**
 * Extract fields from Experiment using LLM
 */
export const extractFieldsFromExperiment = async (
  experiment: Experiment,
  originalMetadata: Record<string, unknown> | null = null,
  config?: OllamaConfig,
): Promise<SearchableExperimentFields> => {
  const input = convertUnifiedToLlmInput(experiment, originalMetadata)
  const userContent = JSON.stringify(input, null, 2)

  const messages: OllamaMessage[] = [
    { role: "system", content: EXTRACTION_PROMPT },
    { role: "user", content: userContent },
  ]

  try {
    const response = await chat(messages, config)
    return parseSearchableFields(response)
  } catch (error) {
    logger.error("Failed to extract fields from LLM", { error: getErrorMessage(error) })
    return createEmptySearchableFields()
  }
}

/**
 * Process experiments in parallel batches
 * Merges LLM-extracted fields with existing searchable fields (preserving policies from structure step)
 */
export const processExperimentsParallel = async (
  experiments: Experiment[],
  originalMetadata: Record<string, unknown> | null,
  concurrency: number,
  dryRun: boolean,
  config?: OllamaConfig,
): Promise<Experiment[]> => {
  const results: Experiment[] = new Array(experiments.length)
  const total = experiments.length

  for (let i = 0; i < total; i += concurrency) {
    const batchEnd = Math.min(i + concurrency, total)
    const batchIndices = Array.from({ length: batchEnd - i }, (_, idx) => i + idx)

    logger.info(`Extracting experiments ${i + 1}-${batchEnd}/${total}`)

    const batchPromises = batchIndices.map(async (idx) => {
      const experiment = experiments[idx]

      const llmSearchable = dryRun
        ? createEmptySearchableFields()
        : await extractFieldsFromExperiment(experiment, originalMetadata, config)

      // Merge LLM-extracted fields with existing searchable (preserve policies from structure step)
      const existingSearchable = experiment.searchable
      const searchable: SearchableExperimentFields = {
        ...llmSearchable,
        policies: existingSearchable?.policies ?? [],
      }

      return { idx, searchable }
    })

    const batchResults = await Promise.all(batchPromises)

    for (const { idx, searchable } of batchResults) {
      results[idx] = { ...experiments[idx], searchable }
    }
  }

  return results
}
