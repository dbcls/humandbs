/**
 * LLM Field Extraction
 *
 * Extracts structured fields from EnrichedDataset using Ollama LLM
 * Reads from enriched-json and outputs to extracted-unified
 *
 * Process:
 * 1. Copy enriched-json -> extracted-unified (or skip with --skip-copy)
 * 2. For each dataset (latest version only), extract fields using LLM
 * 3. Add searchable aggregated fields
 * 4. Support --resume to continue from where it left off
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import type {
  ExtractedExperimentFields,
  SearchableDatasetFields,
  DiseaseInfo,
  PlatformInfo,
  DataVolume,
  DataVolumeUnit,
  SubjectCountType,
  HealthStatus,
  ReadType,
  EnrichedDataset,
  Experiment,
  ExtractedExperiment,
  SearchableDataset,
  TextValue,
} from "@/crawler/types"
import { getErrorMessage } from "@/crawler/utils/error"
import { getResultsDir } from "@/crawler/utils/io"
import { logger, setLogLevel } from "@/crawler/utils/logger"

// Ollama API

interface OllamaMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface OllamaRequest {
  model: string
  messages: OllamaMessage[]
  format?: "json"
  stream?: boolean
}

interface OllamaResponse {
  message: {
    content: string
  }
}

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:1143"
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.3:70b"

const callOllama = async (messages: OllamaMessage[]): Promise<string> => {
  const request: OllamaRequest = {
    model: OLLAMA_MODEL,
    messages,
    format: "json",
    stream: false,
  }

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
  }

  const json = (await response.json()) as OllamaResponse
  return json.message.content
}

// Extraction Prompt

const EXTRACTION_PROMPT = `Extract structured metadata from biomedical experiment data.
Input is JSON with "en" and "ja" keys containing English and Japanese versions of the same experiment.
Use both versions to extract the most complete information.
Output in English only. Return ONLY valid JSON object, no explanation.

## Output Schema

{
  "subjectCount": number | null,
  "subjectCountType": "individual" | "sample" | "mixed" | null,
  "healthStatus": "healthy" | "affected" | "mixed" | null,
  "diseases": [{ "label": string, "icd10": string | null }],
  "tissue": string | null,
  "isTumor": boolean | null,
  "cellLine": string | null,
  "assayType": string | null,
  "libraryKit": string | null,
  "platformVendor": string | null,
  "platformModel": string | null,
  "readType": "single-end" | "paired-end" | null,
  "readLength": number | null,
  "targets": string | null,
  "fileTypes": string[],
  "dataVolume": { "value": number, "unit": "KB" | "MB" | "GB" | "TB" } | null
}

## Field Descriptions

### subjectCount (number | null)
Total number of subjects/participants/cases in the study.
- Count individuals, not samples (e.g., "39症例" -> 39, "17 cases" -> 17)
- If multiple groups, sum them (e.g., "20 patients + 10 controls" -> 30)
- null if not specified or unclear

### subjectCountType ("individual" | "sample" | "mixed" | null)
What the count represents:
- "individual": counting people/patients (症例, 例, patients, cases, subjects, individuals)
- "sample": counting biological specimens (サンプル, samples, specimens, 検体)
- "mixed": both individuals and samples mentioned, or unclear distinction
- null if not determinable

### healthStatus ("healthy" | "affected" | "mixed" | null)
Health condition of the subjects:
- "affected": subjects have a disease/condition (if ANY disease mentioned, default to this)
- "healthy": ONLY healthy controls/normal subjects explicitly stated (健常者, healthy controls)
- "mixed": both affected patients AND healthy controls included
- null if not determinable

### diseases (array of { label: string, icd10: string | null })
ALL diseases/conditions mentioned in the data. Extract EVERY disease found.
- label: disease name in English (translate Japanese if needed)
- icd10: ICD-10 code if explicitly stated (e.g., "ICD10: C71" -> "C71"), otherwise null
- Examples:
  - "astrocytoma (ICD10: C71)" -> { "label": "astrocytoma", "icd10": "C71" }
  - "肺がん" -> { "label": "lung cancer", "icd10": null }
  - "難聴" -> { "label": "hearing loss", "icd10": null }

### tissue (string | null)
Primary biological tissue/specimen type:
- Examples: "peripheral blood", "tumor tissue", "brain tissue", "saliva"
- Translate Japanese: "末梢血" -> "peripheral blood", "腫瘍組織" -> "tumor tissue"
- null if not specified

### isTumor (boolean | null)
Whether the sample is from tumor/cancer tissue:
- true: tumor, cancer, malignant tissue, or 腫瘍
- false: normal tissue, non-tumor, healthy tissue
- null: not determinable or not applicable

### cellLine (string | null)
Cell line name if used:
- Examples: "HeLa", "HEK293", "iPSC"
- null if no cell line used or not specified

### assayType (string | null)
Type of experimental assay/method:
- Extract as written in source (e.g., "Exome", "WGS", "RNA-seq", "Microarray", "ChIP-seq")
- null if not specified

### libraryKit (string | null)
Library preparation kit name:
- Examples: "Agilent SureSelect Human All Exon v.4", "TruSeq DNA PCR-Free"
- null if not specified

### platformVendor (string | null)
Sequencing platform manufacturer:
- Examples: "Illumina", "Thermo Fisher", "PacBio", "Oxford Nanopore"
- Normalize variations: "Life Technologies" -> "Thermo Fisher"
- null if not specified

### platformModel (string | null)
Specific instrument model:
- Examples: "HiSeq 2000", "NovaSeq 6000", "Ion PGM", "MinION"
- Extract from patterns like "Illumina [HiSeq 2000]" -> "HiSeq 2000"
- null if not specified

### readType ("single-end" | "paired-end" | null)
Sequencing read type:
- "single-end" or "paired-end" (case-insensitive matching)
- null if not specified

### readLength (number | null)
Read length in base pairs:
- Extract number from patterns like "100 bp", "150bp" -> 100, 150
- null if not specified

### targets (string | null)
Target regions for capture/enrichment:
- Keep as original text if specified
- null if not specified or whole genome/exome

### fileTypes (string[])
List of data file formats:
- Examples: ["FASTQ", "BAM", "VCF", "BED", "CRAM"]
- Extract from patterns like "fastq, bam" -> ["FASTQ", "BAM"]
- Empty array [] if not specified

### dataVolume ({ value: number, unit: string } | null)
Total data size:
- Extract numeric value and unit separately
- Examples: "500 GB" -> { "value": 500, "unit": "GB" }, "1.2 TB" -> { "value": 1.2, "unit": "TB" }
- null if not specified

## Important Rules

1. Prefer [EN] values when available, use [JA] to fill gaps or clarify ambiguity
2. Extract ALL diseases mentioned - this is a list, not a single value
3. If external metadata is provided, use it to supplement missing information
4. Return empty array [] for fileTypes if none found, not null

Input:
`

// Validation Functions

const createEmptyExtractedFields = (): ExtractedExperimentFields => ({
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

const parseExtractedFields = (jsonStr: string): ExtractedExperimentFields => {
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
 * Separates ja/en fields from unified structure for the existing prompt format
 */
const convertUnifiedToLlmInput = (
  experiment: Experiment,
  originalMetadata: Record<string, unknown> | null,
): BilingualExperimentInput => {
  // Convert BilingualTextValue data to single-language format
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

/** Format bilingual experiment input as JSON for LLM */
const formatLlmInput = (input: BilingualExperimentInput): string => {
  return JSON.stringify(input, null, 2)
}

/** Extract fields from Experiment using LLM */
const extractFieldsFromExperiment = async (
  experiment: Experiment,
  originalMetadata: Record<string, unknown> | null,
): Promise<ExtractedExperimentFields> => {
  const input = convertUnifiedToLlmInput(experiment, originalMetadata)
  const userContent = formatLlmInput(input)

  const messages: OllamaMessage[] = [
    { role: "system", content: EXTRACTION_PROMPT },
    { role: "user", content: userContent },
  ]

  try {
    const response = await callOllama(messages)
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

const aggregateToSearchable = (experiments: ExtractedExperiment[]): SearchableDatasetFields => {
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

    // Collect diseases from array
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

// Resume Progress Tracking

interface ExtractionProgress {
  totalExperiments: number
  status: "completed"
}

interface SearchableDatasetWithProgress extends SearchableDataset {
  _extractionProgress?: ExtractionProgress
}

// I/O

const getEnrichedJsonDir = (): string => {
  return join(getResultsDir(), "enriched-json", "dataset")
}

const getExtractedUnifiedDir = (): string => {
  const dir = join(getResultsDir(), "extracted-unified", "dataset")
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Copy enriched-json to extracted-unified (if not already exists)
 */
const copyEnrichedToExtracted = (force = false): void => {
  const srcBase = join(getResultsDir(), "enriched-json")
  const dstBase = join(getResultsDir(), "extracted-unified")

  if (!existsSync(srcBase)) {
    logger.error("Error: enriched-json directory does not exist")
    logger.error("Please run enrich-unified first")
    process.exit(1)
  }

  if (existsSync(dstBase) && !force) {
    logger.info("extracted-unified directory already exists (use --force to overwrite)")
    return
  }

  logger.info("Copying enriched-json to extracted-unified...")
  cpSync(srcBase, dstBase, { recursive: true })
  logger.info("Copy completed")
}

const readEnrichedDataset = (filename: string): EnrichedDataset | null => {
  const filePath = join(getEnrichedJsonDir(), filename)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, "utf8"))
  } catch {
    return null
  }
}

const readExtractedDataset = (filename: string): SearchableDatasetWithProgress | null => {
  const filePath = join(getExtractedUnifiedDir(), filename)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, "utf8"))
  } catch {
    return null
  }
}

const writeExtractedDataset = (filename: string, data: SearchableDatasetWithProgress): void => {
  const dir = getExtractedUnifiedDir()
  const filePath = join(dir, filename)
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
}

// Dataset Processing

/** Parse version number from version string (e.g., "v3" -> 3) */
const parseVersionNumber = (version: string): number => {
  const match = version.match(/^v(\d+)$/)
  return match ? parseInt(match[1], 10) : 0
}

/** Get list of enriched dataset files */
const listEnrichedDatasetFiles = (): string[] => {
  const dir = getEnrichedJsonDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f.endsWith(".json"))
}

/** Parse datasetId and version from filename (e.g., "JGAD000001-v1.json" -> { datasetId: "JGAD000001", version: "v1" }) */
const parseFilename = (filename: string): { datasetId: string; version: string } | null => {
  const match = filename.match(/^(.+)-(v\d+)\.json$/)
  if (!match) return null
  return { datasetId: match[1], version: match[2] }
}

/** Filter to keep only the latest version of each dataset */
const filterLatestVersions = (files: string[]): string[] => {
  const datasetVersions = new Map<string, { version: string; versionNum: number; filename: string }[]>()

  for (const filename of files) {
    const parsed = parseFilename(filename)
    if (!parsed) continue

    const versionNum = parseVersionNumber(parsed.version)
    const existing = datasetVersions.get(parsed.datasetId) ?? []
    existing.push({ version: parsed.version, versionNum, filename })
    datasetVersions.set(parsed.datasetId, existing)
  }

  const result: string[] = []
  for (const versions of datasetVersions.values()) {
    // Sort by version number descending and take the first (latest)
    versions.sort((a, b) => b.versionNum - a.versionNum)
    result.push(versions[0].filename)
  }

  return result.sort()
}

/** Process experiments in parallel batches */
const processExperimentsParallel = async (
  experiments: Experiment[],
  originalMetadata: Record<string, unknown> | null,
  experimentConcurrency: number,
  dryRun: boolean,
): Promise<ExtractedExperiment[]> => {
  const results: ExtractedExperiment[] = new Array(experiments.length)
  const total = experiments.length

  // Process in batches
  for (let i = 0; i < total; i += experimentConcurrency) {
    const batchEnd = Math.min(i + experimentConcurrency, total)
    const batchIndices = Array.from({ length: batchEnd - i }, (_, idx) => i + idx)

    logger.info("Extracting experiments", { range: `${i + 1}-${batchEnd}/${total}` })

    const batchPromises = batchIndices.map(async (idx) => {
      const experiment = experiments[idx]

      const extracted = dryRun
        ? createEmptyExtractedFields()
        : await extractFieldsFromExperiment(experiment, originalMetadata)

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

/** Process a single dataset with resume support (dataset-level) */
const processDataset = async (
  filename: string,
  options: { dryRun: boolean; force: boolean; experimentConcurrency: number },
): Promise<void> => {
  const { dryRun, force, experimentConcurrency } = options
  const parsed = parseFilename(filename)
  if (!parsed) {
    logger.error("Invalid filename format", { filename })
    return
  }

  const { datasetId, version } = parsed
  logger.info("Processing dataset", { datasetId, version })

  // Check for existing progress (dataset-level resume)
  const existing = readExtractedDataset(filename)
  const progress = existing?._extractionProgress

  // Skip if already completed (unless --force)
  if (progress?.status === "completed" && !force) {
    logger.info("Skipped: already completed", { filename })
    return
  }

  // Read source data (from enriched-json)
  const enriched = readEnrichedDataset(filename)
  if (!enriched) {
    logger.error("Failed to read enriched dataset", { filename })
    return
  }

  const totalExperiments = enriched.experiments.length
  logger.debug("Dataset experiments", { totalExperiments, experimentConcurrency })

  // Process all experiments in parallel batches
  const experiments = await processExperimentsParallel(
    enriched.experiments,
    enriched.originalMetadata ?? null,
    experimentConcurrency,
    dryRun,
  )

  // Aggregate and save
  const searchable = aggregateToSearchable(experiments)

  const finalResult: SearchableDatasetWithProgress = {
    ...enriched,
    searchable,
    experiments,
    _extractionProgress: {
      totalExperiments,
      status: "completed",
    },
  }

  if (!dryRun) {
    writeExtractedDataset(filename, finalResult)
    logger.info("Saved dataset", { output: `extracted-unified/dataset/${filename}` })
  } else {
    logger.info("[dry-run] Would save dataset", { output: `extracted-unified/dataset/${filename}` })
    logger.debug("Searchable fields", { searchable })
  }
}

// CLI

interface ExtractArgs {
  file?: string
  humId?: string[]
  datasetId?: string[]
  concurrency?: number
  experimentConcurrency?: number
  dryRun?: boolean
  force?: boolean
  skipCopy?: boolean
  latestOnly?: boolean
  verbose?: boolean
  quiet?: boolean
}

const parseArgs = (): ExtractArgs => {
  const args = yargs(hideBin(process.argv))
    .option("file", { alias: "f", type: "string", description: "Process single file (by datasetId)" })
    .option("hum-id", { alias: "i", type: "array", string: true, description: "Process datasets for specified humIds" })
    .option("dataset-id", { alias: "d", type: "array", string: true, description: "Process specific datasetIds" })
    .option("concurrency", { alias: "c", type: "number", default: 4, description: "Concurrent dataset processing" })
    .option("experiment-concurrency", { alias: "e", type: "number", default: 4, description: "Concurrent experiment LLM calls per dataset" })
    .option("dry-run", { type: "boolean", default: false, description: "Dry run without LLM calls" })
    .option("force", { type: "boolean", default: false, description: "Force reprocess even if already completed" })
    .option("skip-copy", { type: "boolean", default: false, description: "Skip copying enriched-json to extracted-unified" })
    .option("latest-only", { type: "boolean", default: true, description: "Process only the latest version of each dataset" })
    .option("verbose", { alias: "v", type: "boolean", default: false, description: "Show debug logs" })
    .option("quiet", { alias: "q", type: "boolean", default: false, description: "Show only warnings and errors" })
    .parseSync() as ExtractArgs

  if (args.verbose) {
    setLogLevel("debug")
  } else if (args.quiet) {
    setLogLevel("warn")
  }

  return args
}

const main = async (): Promise<void> => {
  const args = parseArgs()

  logger.info("Ollama configuration", { api: OLLAMA_BASE_URL, model: OLLAMA_MODEL })

  const dryRun = args.dryRun ?? false
  const concurrency = args.concurrency ?? 1
  const experimentConcurrency = args.experimentConcurrency ?? 8
  const latestOnly = args.latestOnly ?? true
  const force = args.force ?? false

  logger.debug("Concurrency settings", { datasetConcurrency: concurrency, experimentConcurrency })

  if (!args.skipCopy) {
    copyEnrichedToExtracted(args.force)
  }

  // Get list of dataset files
  let files = listEnrichedDatasetFiles()

  // Filter by specific file
  if (args.file) {
    const targetFile = args.file.endsWith(".json") ? args.file : `${args.file}.json`
    files = files.filter(f => f === targetFile || f.startsWith(args.file!))
  }

  // Filter by humId
  if (args.humId && args.humId.length > 0) {
    const humIdSet = new Set(args.humId)
    files = files.filter(f => {
      const data = readEnrichedDataset(f)
      return data && humIdSet.has(data.humId)
    })
  }

  // Filter by datasetId
  if (args.datasetId && args.datasetId.length > 0) {
    const datasetIdSet = new Set(args.datasetId)
    files = files.filter(f => {
      const parsed = parseFilename(f)
      return parsed && datasetIdSet.has(parsed.datasetId)
    })
  }

  // Filter to latest versions only
  if (latestOnly) {
    files = filterLatestVersions(files)
  }

  if (files.length === 0) {
    logger.info("No datasets to process")
    return
  }

  logger.info("Starting extraction", { datasetCount: files.length })

  // Process datasets with concurrency
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency)
    await Promise.all(batch.map(f => processDataset(f, { dryRun, force, experimentConcurrency })))
  }

  const outputDir = join(getResultsDir(), "extracted-unified")
  logger.info("Completed", { outputDir })
}

if (import.meta.main) {
  await main()
}
