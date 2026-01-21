/**
 * LLM Field Extraction
 *
 * Extracts structured fields from experiment data using Ollama LLM.
 * Reads from enriched-json and outputs to llm-extracted.
 *
 * Process:
 * 1. Copy enriched-json -> llm-extracted
 * 2. For each dataset, extract fields using LLM
 * 3. Add searchable aggregated fields
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { getResultsDirPath } from "@/crawler/io"
import type {
  TransformedExperiment,
  ExtractedExperimentFields,
  SearchableDatasetFields,
  ExtractedExperiment,
  DiseaseInfo,
  PlatformInfo,
  DataVolume,
  DataVolumeUnit,
  SubjectCountType,
  HealthStatus,
  ReadType,
  EnrichedDataset,
  SearchableEnrichedDataset,
} from "@/crawler/types"

// === Ollama API ===

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
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen:32b"

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

// === Extraction Logic ===

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

/** Input structure for bilingual extraction (experiment level) */
interface BilingualExperimentInput {
  en: TransformedExperiment | null
  ja: TransformedExperiment | null
  externalMetadata: Record<string, unknown> | null
}

/** Format bilingual experiment as JSON for LLM */
export const formatBilingualExperimentInput = (
  experimentEn: TransformedExperiment | null,
  experimentJa: TransformedExperiment | null,
  externalMetadata: Record<string, unknown> | null,
): string => {
  const input: BilingualExperimentInput = {
    en: experimentEn,
    ja: experimentJa,
    externalMetadata,
  }
  return JSON.stringify(input, null, 2)
}

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
    console.error("Failed to parse LLM response:", jsonStr.slice(0, 200))
    return empty
  }
}

/** Extract fields from bilingual experiment */
export const extractFieldsFromBilingualExperiment = async (
  experimentEn: TransformedExperiment | null,
  experimentJa: TransformedExperiment | null,
  externalMetadata: Record<string, unknown> | null,
): Promise<ExtractedExperimentFields> => {
  const userContent = formatBilingualExperimentInput(experimentEn, experimentJa, externalMetadata)

  const messages: OllamaMessage[] = [
    { role: "system", content: EXTRACTION_PROMPT },
    { role: "user", content: userContent },
  ]

  try {
    const response = await callOllama(messages)
    return parseExtractedFields(response)
  } catch (error) {
    console.error("LLM extraction failed:", error instanceof Error ? error.message : String(error))
    return createEmptyExtractedFields()
  }
}

// === Aggregation Logic ===

/** Convert DataVolume to GB for aggregation */
const convertToGB = (vol: DataVolume): number => {
  switch (vol.unit) {
    case "KB": return vol.value / (1024 * 1024)
    case "MB": return vol.value / 1024
    case "GB": return vol.value
    case "TB": return vol.value * 1024
  }
}

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

// === I/O ===

const getEnrichedJsonDir = (): string =>
  join(getResultsDirPath(), "enriched-json", "dataset")

const getLlmExtractedDir = (): string => {
  const dir = join(getResultsDirPath(), "llm-extracted", "dataset")
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Copy enriched-json to llm-extracted (if not already exists)
 */
export const copyEnrichedToExtracted = (force = false): void => {
  const srcBase = join(getResultsDirPath(), "enriched-json")
  const dstBase = join(getResultsDirPath(), "llm-extracted")

  if (!existsSync(srcBase)) {
    console.error("Error: enriched-json directory does not exist")
    console.error("Please run fetch-external-api first")
    process.exit(1)
  }

  if (existsSync(dstBase) && !force) {
    console.log("llm-extracted directory already exists (use --force to overwrite)")
    return
  }

  console.log("Copying enriched-json to llm-extracted...")
  cpSync(srcBase, dstBase, { recursive: true })
  console.log("Done copying")
}

const readDatasetJson = (filename: string): EnrichedDataset | null => {
  const filePath = join(getEnrichedJsonDir(), filename)
  if (!existsSync(filePath)) {
    return null
  }
  const content = readFileSync(filePath, "utf8")
  return JSON.parse(content) as EnrichedDataset
}

const writeExtractedJson = (filename: string, data: SearchableEnrichedDataset): void => {
  const dir = getLlmExtractedDir()
  const filePath = join(dir, filename)
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
}

// === Main ===

interface ExtractArgs {
  file?: string
  humId?: string[]
  concurrency?: number
  dryRun?: boolean
  force?: boolean
  skipCopy?: boolean
}
/** Group dataset files by datasetId and find latest version for each lang */
interface DatasetGroup {
  datasetId: string
  enFile: string | null
  jaFile: string | null
  enDataset: EnrichedDataset | null
  jaDataset: EnrichedDataset | null
}

const groupDatasetsByIdAndLang = (): Map<string, DatasetGroup> => {
  const dir = getEnrichedJsonDir()
  if (!existsSync(dir)) return new Map()

  const files = readdirSync(dir).filter(f => f.endsWith(".json"))
  const groups = new Map<string, DatasetGroup>()

  for (const filename of files) {
    const dataset = readDatasetJson(filename)
    if (!dataset) continue

    const key = dataset.datasetId
    const existing = groups.get(key) ?? {
      datasetId: key,
      enFile: null,
      jaFile: null,
      enDataset: null,
      jaDataset: null,
    }

    // Keep the latest version for each lang (compare by versionReleaseDate)
    if (dataset.lang === "en") {
      if (!existing.enDataset || dataset.versionReleaseDate > existing.enDataset.versionReleaseDate) {
        existing.enFile = filename
        existing.enDataset = dataset
      }
    } else {
      if (!existing.jaDataset || dataset.versionReleaseDate > existing.jaDataset.versionReleaseDate) {
        existing.jaFile = filename
        existing.jaDataset = dataset
      }
    }

    groups.set(key, existing)
  }

  return groups
}

/** Process a dataset pair (en + ja) */
const processDatasetPair = async (group: DatasetGroup, dryRun: boolean): Promise<void> => {
  console.log(`Processing ${group.datasetId}...`)

  const { enDataset, jaDataset, enFile, jaFile } = group

  // Skip if already processed
  if (enFile) {
    const extractedPath = join(getLlmExtractedDir(), enFile)
    if (existsSync(extractedPath)) {
      const existing = JSON.parse(readFileSync(extractedPath, "utf8"))
      if (existing.searchable) {
        console.log("  -> Skip: already processed")
        return
      }
    }
  }

  // Use en as reference, fall back to ja
  const referenceDataset = enDataset ?? jaDataset
  if (!referenceDataset) {
    console.error("  -> No dataset found")
    return
  }

  const experimentCount = referenceDataset.experiments.length
  console.log(`  -> ${experimentCount} experiments, en=${enDataset ? "yes" : "no"}, ja=${jaDataset ? "yes" : "no"}`)

  // Merge externalMetadata from both
  const externalMetadata = enDataset?.originalMetadata ?? jaDataset?.originalMetadata ?? null

  // Extract fields for each experiment pair
  const extractedFields: ExtractedExperimentFields[] = []

  for (let i = 0; i < experimentCount; i++) {
    const expEn = enDataset?.experiments[i] ?? null
    const expJa = jaDataset?.experiments[i] ?? null
    console.log(`  -> Extracting experiment ${i + 1}/${experimentCount}...`)

    const extracted = dryRun
      ? createEmptyExtractedFields()
      : await extractFieldsFromBilingualExperiment(expEn, expJa, externalMetadata)

    extractedFields.push(extracted)
  }

  const searchable = aggregateToSearchable(
    extractedFields.map((extracted, i) => ({
      ...referenceDataset.experiments[i],
      extracted,
    }))
  )

  // Write results to both en and ja files
  const writeResult = (dataset: EnrichedDataset, filename: string) => {
    const extractedExperiments: ExtractedExperiment[] = dataset.experiments.map((exp, i) => ({
      ...exp,
      extracted: extractedFields[i] ?? createEmptyExtractedFields(),
    }))

    const result: SearchableEnrichedDataset = {
      ...dataset,
      searchable,
      experiments: extractedExperiments,
    }

    if (!dryRun) {
      writeExtractedJson(filename, result)
      console.log(`  -> Saved to llm-extracted/dataset/${filename}`)
    } else {
      console.log(`  -> [dry-run] Would save to llm-extracted/dataset/${filename}`)
    }
  }

  if (enDataset && enFile) {
    writeResult(enDataset, enFile)
  }
  if (jaDataset && jaFile) {
    writeResult(jaDataset, jaFile)
  }

  if (dryRun) {
    console.log("  -> Searchable fields:", JSON.stringify(searchable, null, 2))
  }
}

const parseArgs = (): ExtractArgs =>
  yargs(hideBin(process.argv))
    .option("file", { alias: "f", type: "string", description: "Process single file" })
    .option("hum-id", { alias: "i", type: "array", string: true, description: "Process datasets for specified humIds" })
    .option("concurrency", { alias: "c", type: "number", default: 1, description: "Concurrent processing" })
    .option("dry-run", { type: "boolean", default: false, description: "Dry run without LLM calls" })
    .option("force", { type: "boolean", default: false, description: "Force overwrite llm-extracted directory" })
    .option("skip-copy", { type: "boolean", default: false, description: "Skip copying enriched-json to llm-extracted" })
    .parseSync()

const processDatasetGroups = async (
  groups: DatasetGroup[],
  concurrency: number,
  dryRun: boolean,
): Promise<void> => {
  console.log(`Processing ${groups.length} dataset groups (latest versions, en+ja pairs)...`)

  for (let i = 0; i < groups.length; i += concurrency) {
    const batch = groups.slice(i, i + concurrency)
    await Promise.all(batch.map(g => processDatasetPair(g, dryRun)))
  }
}

const main = async (): Promise<void> => {
  const args = parseArgs()

  console.log(`Ollama API: ${OLLAMA_BASE_URL}`)
  console.log(`Ollama Model: ${OLLAMA_MODEL}`)

  const dryRun = args.dryRun ?? false
  const concurrency = args.concurrency ?? 1

  if (!args.skipCopy) {
    copyEnrichedToExtracted(args.force)
  }

  // Group all datasets by datasetId, keeping only latest version per lang
  const allGroups = groupDatasetsByIdAndLang()
  let groups = [...allGroups.values()]

  // Filter by humId if specified
  if (args.humId && args.humId.length > 0) {
    console.log(`Filtering by humIds: ${args.humId.join(", ")}`)
    groups = groups.filter(g => {
      const humId = g.enDataset?.humId ?? g.jaDataset?.humId
      return humId && args.humId!.includes(humId)
    })
  }

  // Filter by specific file if specified (for debugging)
  if (args.file) {
    const targetDatasetId = args.file.split("-")[0] // e.g., "JGAD000004-v4-en.json" -> "JGAD000004"
    groups = groups.filter(g => g.datasetId === targetDatasetId)
  }

  if (groups.length === 0) {
    console.log("No datasets to process")
    return
  }

  await processDatasetGroups(groups, concurrency, dryRun)

  const outputDir = join(getResultsDirPath(), "llm-extracted")
  console.log(`Done! Output: ${outputDir}`)
}

if (import.meta.main) {
  await main()
}
