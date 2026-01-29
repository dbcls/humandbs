/**
 * LLM field extraction for experiment data
 */
import { z } from "zod"

import { normalizePolicies } from "@/crawler/processors/normalize"
import type {
  TextValue,
  Experiment,
  RefinedExperimentFields,
  RefinedExperiment,
  NormalizedPolicy,
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

const DataVolumeSchema = z.object({
  value: z.number(),
  unit: z.enum(["KB", "MB", "GB", "TB"]),
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

export const RefinedExperimentFieldsSchema = z.object({
  subjectCount: z.number().nullable().catch(null),
  subjectCountType: z.enum(["individual", "sample", "mixed"]).nullable().catch(null),
  healthStatus: z.enum(["healthy", "affected", "mixed"]).nullable().catch(null),
  diseases: safeFilteredArray(DiseaseInfoSchema),
  tissues: z.array(z.string()).catch([]),
  isTumor: z.boolean().nullable().catch(null),
  cellLine: z.string().nullable().catch(null),
  population: z.string().nullable().catch(null),
  assayType: z.string().nullable().catch(null),
  libraryKits: z.array(z.string()).catch([]),
  platformVendor: z.string().nullable().catch(null),
  platformModel: z.string().nullable().catch(null),
  readType: z.enum(["single-end", "paired-end"]).nullable().catch(null),
  readLength: z.number().nullable().catch(null),
  targets: z.string().nullable().catch(null),
  fileTypes: z.array(z.string()).catch([]),
  dataVolume: DataVolumeSchema.nullable().catch(null),
})

// Validation Functions

/**
 * Create empty refined fields with default values
 */
export const createEmptyRefinedFields = (): RefinedExperimentFields => ({
  subjectCount: null,
  subjectCountType: null,
  healthStatus: null,
  diseases: [],
  tissues: [],
  isTumor: null,
  cellLine: null,
  population: null,
  assayType: null,
  libraryKits: [],
  platformVendor: null,
  platformModel: null,
  readType: null,
  readLength: null,
  targets: null,
  fileTypes: [],
  dataVolume: null,
  policies: [],
})

/**
 * Check if refined fields are all default (empty) values
 * Note: policies are excluded from this check as they are rule-based, not LLM-extracted
 */
export const isEmptyRefinedFields = (fields: RefinedExperimentFields): boolean => {
  return (
    fields.subjectCount === null &&
    fields.subjectCountType === null &&
    fields.healthStatus === null &&
    fields.diseases.length === 0 &&
    fields.tissues.length === 0 &&
    fields.isTumor === null &&
    fields.cellLine === null &&
    fields.population === null &&
    fields.assayType === null &&
    fields.libraryKits.length === 0 &&
    fields.platformVendor === null &&
    fields.platformModel === null &&
    fields.readType === null &&
    fields.readLength === null &&
    fields.targets === null &&
    fields.fileTypes.length === 0 &&
    fields.dataVolume === null
  )
}

/**
 * Parse LLM JSON output into RefinedExperimentFields
 * Note: policies are extracted separately (rule-based) and added as empty array here
 */
export const parseRefinedFields = (jsonStr: string): RefinedExperimentFields => {
  const empty = createEmptyRefinedFields()

  try {
    const parsed = JSON.parse(jsonStr)
    const llmFields = RefinedExperimentFieldsSchema.parse(parsed)
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
): Promise<RefinedExperimentFields> => {
  const input = convertUnifiedToLlmInput(experiment, originalMetadata)
  const userContent = JSON.stringify(input, null, 2)

  const messages: OllamaMessage[] = [
    { role: "system", content: EXTRACTION_PROMPT },
    { role: "user", content: userContent },
  ]

  try {
    const response = await chat(messages, config)
    return parseRefinedFields(response)
  } catch (error) {
    logger.error("Failed to extract fields from LLM", { error: getErrorMessage(error) })
    return createEmptyRefinedFields()
  }
}

/**
 * Extract policies from experiment data (rule-based, not LLM)
 */
const extractPoliciesFromExperiment = (experiment: Experiment): NormalizedPolicy[] => {
  const policiesField = experiment.data["Policies"]
  if (!policiesField) return []

  return normalizePolicies(
    policiesField.ja?.text ?? null,
    policiesField.en?.text ?? null,
    policiesField.ja?.rawHtml ?? null,
    policiesField.en?.rawHtml ?? null,
  )
}

/**
 * Process experiments in parallel batches
 */
export const processExperimentsParallel = async (
  experiments: Experiment[],
  originalMetadata: Record<string, unknown> | null,
  concurrency: number,
  dryRun: boolean,
  config?: OllamaConfig,
): Promise<RefinedExperiment[]> => {
  const results: RefinedExperiment[] = new Array(experiments.length)
  const total = experiments.length

  for (let i = 0; i < total; i += concurrency) {
    const batchEnd = Math.min(i + concurrency, total)
    const batchIndices = Array.from({ length: batchEnd - i }, (_, idx) => i + idx)

    logger.info(`Extracting experiments ${i + 1}-${batchEnd}/${total}`)

    const batchPromises = batchIndices.map(async (idx) => {
      const experiment = experiments[idx]

      const llmRefined = dryRun
        ? createEmptyRefinedFields()
        : await extractFieldsFromExperiment(experiment, originalMetadata, config)

      // Add rule-based policies extraction
      const policies = extractPoliciesFromExperiment(experiment)

      const refined: RefinedExperimentFields = {
        ...llmRefined,
        policies,
      }

      return { idx, refined }
    })

    const batchResults = await Promise.all(batchPromises)

    for (const { idx, refined } of batchResults) {
      results[idx] = { ...experiments[idx], refined }
    }
  }

  return results
}
