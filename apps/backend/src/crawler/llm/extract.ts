/**
 * LLM field extraction for experiment data
 */
import type {
  TextValue,
  Experiment,
  ExtractedExperimentFields,
  ExtractedExperiment,
  SearchableDatasetFields,
  DiseaseInfo,
  PlatformInfo,
  DataVolume,
  DataVolumeUnit,
  SubjectCountType,
  HealthStatus,
  ReadType,
} from "@/crawler/types"
import { getErrorMessage } from "@/crawler/utils/error"
import { logger } from "@/crawler/utils/logger"

import { chat, type OllamaMessage, type OllamaConfig } from "./client"
import { EXTRACTION_PROMPT } from "./prompts"

// Validation Functions

/**
 * Create empty extracted fields with default values
 */
export const createEmptyExtractedFields = (): ExtractedExperimentFields => ({
  subjectCount: null,
  subjectCountType: null,
  healthStatus: null,
  diseases: [],
  tissue: null,
  isTumor: null,
  cellLine: null,
  assayType: null,
  libraryKit: null,
  platformVendor: null,
  platformModel: null,
  readType: null,
  readLength: null,
  targets: null,
  fileTypes: [],
  dataVolume: null,
})

const validateSubjectCountType = (value: unknown): SubjectCountType | null => {
  if (value === "individual" || value === "sample" || value === "mixed") {
    return value
  }
  return null
}

const validateHealthStatus = (value: unknown): HealthStatus | null => {
  if (value === "healthy" || value === "affected" || value === "mixed") {
    return value
  }
  return null
}

const validateReadType = (value: unknown): ReadType | null => {
  if (value === "single-end" || value === "paired-end") {
    return value
  }
  return null
}

const validateDataVolumeUnit = (value: unknown): DataVolumeUnit | null => {
  if (value === "KB" || value === "MB" || value === "GB" || value === "TB") {
    return value
  }
  return null
}

const parseDataVolume = (value: unknown): DataVolume | null => {
  if (!value || typeof value !== "object") return null
  const obj = value as Record<string, unknown>
  if (typeof obj.value !== "number") return null
  const unit = validateDataVolumeUnit(obj.unit)
  if (!unit) return null
  return { value: obj.value, unit }
}

const parseDiseases = (value: unknown): DiseaseInfo[] => {
  if (!Array.isArray(value)) return []
  return value
    .filter((d): d is Record<string, unknown> =>
      d !== null && typeof d === "object" && typeof (d as Record<string, unknown>).label === "string",
    )
    .map(d => ({
      label: d.label as string,
      icd10: typeof d.icd10 === "string" ? d.icd10 : null,
    }))
}

/**
 * Parse LLM JSON output into ExtractedExperimentFields
 */
export const parseExtractedFields = (jsonStr: string): ExtractedExperimentFields => {
  const empty = createEmptyExtractedFields()

  try {
    const parsed = JSON.parse(jsonStr)

    return {
      subjectCount: typeof parsed.subjectCount === "number" ? parsed.subjectCount : null,
      subjectCountType: validateSubjectCountType(parsed.subjectCountType),
      healthStatus: validateHealthStatus(parsed.healthStatus),
      diseases: parseDiseases(parsed.diseases),
      tissue: typeof parsed.tissue === "string" ? parsed.tissue : null,
      isTumor: typeof parsed.isTumor === "boolean" ? parsed.isTumor : null,
      cellLine: typeof parsed.cellLine === "string" ? parsed.cellLine : null,
      assayType: typeof parsed.assayType === "string" ? parsed.assayType : null,
      libraryKit: typeof parsed.libraryKit === "string" ? parsed.libraryKit : null,
      platformVendor: typeof parsed.platformVendor === "string" ? parsed.platformVendor : null,
      platformModel: typeof parsed.platformModel === "string" ? parsed.platformModel : null,
      readType: validateReadType(parsed.readType),
      readLength: typeof parsed.readLength === "number" ? parsed.readLength : null,
      targets: typeof parsed.targets === "string" ? parsed.targets : null,
      fileTypes: Array.isArray(parsed.fileTypes)
        ? parsed.fileTypes.filter((t: unknown) => typeof t === "string")
        : [],
      dataVolume: parseDataVolume(parsed.dataVolume),
    }
  } catch {
    logger.error("Failed to parse LLM response", { preview: jsonStr.slice(0, 200) })
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
): Promise<ExtractedExperimentFields> => {
  const input = convertUnifiedToLlmInput(experiment, originalMetadata)
  const userContent = JSON.stringify(input, null, 2)

  const messages: OllamaMessage[] = [
    { role: "system", content: EXTRACTION_PROMPT },
    { role: "user", content: userContent },
  ]

  try {
    const response = await chat(messages, config)
    return parseExtractedFields(response)
  } catch (error) {
    logger.error("Failed to extract fields from LLM", { error: getErrorMessage(error) })
    return createEmptyExtractedFields()
  }
}

// Aggregation Logic

/** Convert DataVolume to GB for aggregation */
const convertToGB = (vol: DataVolume): number => {
  switch (vol.unit) {
    case "KB": return vol.value / (1024 * 1024)
    case "MB": return vol.value / 1024
    case "GB": return vol.value
    case "TB": return vol.value * 1024
  }
}

/**
 * Aggregate extracted experiment fields to dataset-level searchable fields
 */
export const aggregateToSearchable = (experiments: ExtractedExperiment[]): SearchableDatasetFields => {
  const diseases: DiseaseInfo[] = []
  const tissues = new Set<string>()
  const assayTypes = new Set<string>()
  const platforms: PlatformInfo[] = []
  const readTypes = new Set<string>()
  const fileTypes = new Set<string>()

  let totalSubjectCount: number | null = null
  let totalDataVolumeGB: number | null = null
  let hasHealthyControl = false
  let hasTumor = false
  let hasCellLine = false

  const seenDiseases = new Set<string>()
  const seenPlatforms = new Set<string>()

  for (const exp of experiments) {
    const { extracted } = exp

    // Collect diseases
    for (const disease of extracted.diseases) {
      if (!seenDiseases.has(disease.label)) {
        seenDiseases.add(disease.label)
        diseases.push(disease)
      }
    }

    if (extracted.tissue) {
      tissues.add(extracted.tissue)
    }

    if (extracted.assayType) {
      assayTypes.add(extracted.assayType)
    }

    if (extracted.platformVendor && extracted.platformModel) {
      const key = `${extracted.platformVendor}:${extracted.platformModel}`
      if (!seenPlatforms.has(key)) {
        seenPlatforms.add(key)
        platforms.push({
          vendor: extracted.platformVendor,
          model: extracted.platformModel,
        })
      }
    }

    if (extracted.readType) {
      readTypes.add(extracted.readType)
    }

    for (const ft of extracted.fileTypes) {
      fileTypes.add(ft)
    }

    if (extracted.subjectCount !== null) {
      totalSubjectCount = (totalSubjectCount ?? 0) + extracted.subjectCount
    }

    if (extracted.dataVolume !== null) {
      totalDataVolumeGB = (totalDataVolumeGB ?? 0) + convertToGB(extracted.dataVolume)
    }

    if (extracted.healthStatus === "healthy" || extracted.healthStatus === "mixed") {
      hasHealthyControl = true
    }
    if (extracted.isTumor === true) {
      hasTumor = true
    }
    if (extracted.cellLine) {
      hasCellLine = true
    }
  }

  // Convert total to appropriate unit
  let totalDataVolume: DataVolume | null = null
  if (totalDataVolumeGB !== null) {
    if (totalDataVolumeGB >= 1024) {
      totalDataVolume = { value: Math.round(totalDataVolumeGB / 1024 * 100) / 100, unit: "TB" }
    } else {
      totalDataVolume = { value: Math.round(totalDataVolumeGB * 100) / 100, unit: "GB" }
    }
  }

  return {
    diseases,
    tissues: [...tissues],
    assayTypes: [...assayTypes],
    platforms,
    readTypes: [...readTypes],
    fileTypes: [...fileTypes],
    totalSubjectCount,
    totalDataVolume,
    hasHealthyControl,
    hasTumor,
    hasCellLine,
  }
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
): Promise<ExtractedExperiment[]> => {
  const results: ExtractedExperiment[] = new Array(experiments.length)
  const total = experiments.length

  for (let i = 0; i < total; i += concurrency) {
    const batchEnd = Math.min(i + concurrency, total)
    const batchIndices = Array.from({ length: batchEnd - i }, (_, idx) => i + idx)

    logger.info(`Extracting experiments ${i + 1}-${batchEnd}/${total}`)

    const batchPromises = batchIndices.map(async (idx) => {
      const experiment = experiments[idx]

      const extracted = dryRun
        ? createEmptyExtractedFields()
        : await extractFieldsFromExperiment(experiment, originalMetadata, config)

      return { idx, extracted }
    })

    const batchResults = await Promise.all(batchPromises)

    for (const { idx, extracted } of batchResults) {
      // Exclude matchType from output
      const { matchType: _, ...experimentWithoutMatchType } = experiments[idx]
      results[idx] = {
        ...experimentWithoutMatchType,
        extracted,
      }
    }
  }

  return results
}
