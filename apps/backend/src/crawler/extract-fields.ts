import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { getResultsDirPath } from "@/crawler/fetch"
import type {
  TextValue,
  TransformedDataset,
  TransformedExperiment,
  ExtractedExperimentFields,
  SearchableDatasetFields,
  ExtractedExperiment,
  SearchableDataset,
  DiseaseInfo,
  PlatformInfo,
  SubjectCountType,
  HealthStatus,
  ReadType,
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

async function callOllama(messages: OllamaMessage[]): Promise<string> {
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

const EXTRACTION_PROMPT = `You are a data extraction assistant for biomedical research datasets.
Extract structured information from experimental metadata.

Given the following key-value pairs from a molecular biology experiment, extract the fields below.
Return ONLY a valid JSON object with the exact field names specified. No explanation needed.

Fields to extract:

## Subject/Sample Information
- subjectCount: number or null
  - Extract the number of subjects/samples/cases (e.g., "39症例" -> 39, "17例" -> 17)
- subjectCountType: "individual" | "sample" | "mixed" | null
  - "individual" if counting people/patients (症例, 例, patients, cases, individuals)
  - "sample" if counting biological samples (サンプル, samples, specimens)
  - "mixed" if unclear or both are mentioned
- healthStatus: "healthy" | "affected" | "mixed" | null
  - IMPORTANT: If a disease name is mentioned (e.g., "難聴", "がん", "diabetes"), subjects are "affected"
  - "healthy" ONLY for healthy controls or normal subjects explicitly stated
  - "mixed" if both healthy and affected subjects are included

## Disease Information
- disease: { "label": string, "icd10": string or null } or null
  - label: The disease name as written (e.g., "非症候群性難聴", "肺がん")
  - icd10: ICD-10 code if explicitly mentioned (e.g., "H90") or infer from disease name:
    - 難聴/hearing loss -> H90
    - 肺がん/lung cancer -> C34
    - 乳がん/breast cancer -> C50
    - 大腸がん/colorectal cancer -> C18-C20
    - 糖尿病/diabetes -> E10-E14

## Biospecimen Information
- tissue: string or null (e.g., "末梢血", "peripheral blood", "lung tissue")
- isTumor: boolean or null (true if tumor/cancer tissue, false otherwise)
- cellLine: string or null (cell line name if any)

## Experimental Method
- assayType: string or null
  - Normalize to standard terms: "WGS", "WES", "RNA-seq", "Target Capture", "ChIP-seq", "ATAC-seq", "Microarray", etc.
- libraryKit: string or null (library construction kit name)

## Platform Information
- platformVendor: string or null
  - Normalize vendor names: "Illumina", "Thermo Fisher", "PacBio", "Oxford Nanopore", etc.
  - "Life technologies" -> "Thermo Fisher"
- platformModel: string or null (e.g., "HiSeq 2000", "Ion PGM", "NovaSeq 6000")
- readType: "single-end" | "paired-end" | null
- readLength: number or null (read length in bp, e.g., "200 bp" -> 200)

## Target Regions
- targets: string or null (target regions as original text)

## Data Information
- fileTypes: string[] (normalize to: "FASTQ", "BAM", "CRAM", "VCF", "BED", etc.)
- dataVolumeBytes: number or null
  - Convert to bytes: 1 KB = 1024, 1 MB = 1048576, 1 GB = 1073741824, 1 TB = 1099511627776

Input data:
`

function formatExperimentData(data: Record<string, TextValue | TextValue[] | null>): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(data)) {
    if (value === null) {
      lines.push(`${key}: (not specified)`)
    } else if (Array.isArray(value)) {
      const texts = value.map(v => v.text).join(", ")
      lines.push(`${key}: ${texts}`)
    } else {
      lines.push(`${key}: ${value.text}`)
    }
  }
  return lines.join("\n")
}

function createEmptyExtractedFields(): ExtractedExperimentFields {
  return {
    subjectCount: null,
    subjectCountType: null,
    healthStatus: null,
    disease: null,
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
    dataVolumeBytes: null,
  }
}

function validateSubjectCountType(value: unknown): SubjectCountType | null {
  if (value === "individual" || value === "sample" || value === "mixed") {
    return value
  }
  return null
}

function validateHealthStatus(value: unknown): HealthStatus | null {
  if (value === "healthy" || value === "affected" || value === "mixed") {
    return value
  }
  return null
}

function validateReadType(value: unknown): ReadType | null {
  if (value === "single-end" || value === "paired-end") {
    return value
  }
  return null
}

function parseExtractedFields(jsonStr: string): ExtractedExperimentFields {
  const empty = createEmptyExtractedFields()

  try {
    const parsed = JSON.parse(jsonStr)

    return {
      subjectCount: typeof parsed.subjectCount === "number" ? parsed.subjectCount : null,
      subjectCountType: validateSubjectCountType(parsed.subjectCountType),
      healthStatus: validateHealthStatus(parsed.healthStatus),
      disease: parsed.disease && typeof parsed.disease.label === "string"
        ? {
            label: parsed.disease.label,
            icd10: typeof parsed.disease.icd10 === "string" ? parsed.disease.icd10 : null,
          }
        : null,
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
      dataVolumeBytes: typeof parsed.dataVolumeBytes === "number" ? parsed.dataVolumeBytes : null,
    }
  } catch {
    console.error("Failed to parse LLM response:", jsonStr.slice(0, 200))
    return empty
  }
}

async function extractFieldsFromExperiment(
  experiment: TransformedExperiment,
): Promise<ExtractedExperimentFields> {
  const dataText = formatExperimentData(experiment.data)

  const messages: OllamaMessage[] = [
    { role: "system", content: EXTRACTION_PROMPT },
    { role: "user", content: dataText },
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

function aggregateToSearchable(experiments: ExtractedExperiment[]): SearchableDatasetFields {
  const diseases: DiseaseInfo[] = []
  const tissues = new Set<string>()
  const assayTypes = new Set<string>()
  const platforms: PlatformInfo[] = []
  const readTypes = new Set<string>()
  const fileTypes = new Set<string>()

  let totalSubjectCount: number | null = null
  let totalDataVolumeBytes: number | null = null
  let hasHealthyControl = false
  let hasTumor = false
  let hasCellLine = false

  const seenDiseases = new Set<string>()
  const seenPlatforms = new Set<string>()

  for (const exp of experiments) {
    const { extracted } = exp

    // Diseases (dedupe by label)
    if (extracted.disease && !seenDiseases.has(extracted.disease.label)) {
      seenDiseases.add(extracted.disease.label)
      diseases.push(extracted.disease)
    }

    // Tissues
    if (extracted.tissue) {
      tissues.add(extracted.tissue)
    }

    // Assay types
    if (extracted.assayType) {
      assayTypes.add(extracted.assayType)
    }

    // Platforms (dedupe by vendor+model)
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

    // Read types
    if (extracted.readType) {
      readTypes.add(extracted.readType)
    }

    // File types
    for (const ft of extracted.fileTypes) {
      fileTypes.add(ft)
    }

    // Subject count (sum)
    if (extracted.subjectCount !== null) {
      totalSubjectCount = (totalSubjectCount ?? 0) + extracted.subjectCount
    }

    // Data volume (sum)
    if (extracted.dataVolumeBytes !== null) {
      totalDataVolumeBytes = (totalDataVolumeBytes ?? 0) + extracted.dataVolumeBytes
    }

    // Flags
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

  return {
    diseases,
    tissues: [...tissues],
    assayTypes: [...assayTypes],
    platforms,
    readTypes: [...readTypes],
    fileTypes: [...fileTypes],
    totalSubjectCount,
    totalDataVolumeBytes,
    hasHealthyControl,
    hasTumor,
    hasCellLine,
  }
}

// === I/O ===

function getDatasetJsonDir(): string {
  return join(getResultsDirPath(), "structured-json", "dataset")
}

function getExtractedJsonDir(): string {
  const dir = join(getResultsDirPath(), "llm-extracted", "dataset")
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function readDatasetJson(filename: string): TransformedDataset | null {
  const filePath = join(getDatasetJsonDir(), filename)
  if (!existsSync(filePath)) {
    return null
  }
  const content = readFileSync(filePath, "utf8")
  return JSON.parse(content) as TransformedDataset
}

function writeExtractedJson(filename: string, data: SearchableDataset): void {
  const dir = getExtractedJsonDir()
  const filePath = join(dir, filename)
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
}

// === Main ===

interface ExtractArgs {
  file?: string
  humId?: string[]
  concurrency?: number
  dryRun?: boolean
}

/** Find dataset files for given humIds */
function findDatasetFilesByHumIds(humIds: string[]): string[] {
  const dir = getDatasetJsonDir()
  const allFiles = readdirSync(dir).filter(f => f.endsWith(".json"))

  const matchingFiles: string[] = []
  for (const filename of allFiles) {
    const dataset = readDatasetJson(filename)
    if (dataset && humIds.includes(dataset.humId)) {
      matchingFiles.push(filename)
    }
  }

  return matchingFiles
}

async function processOneDataset(filename: string, dryRun: boolean): Promise<void> {
  console.log(`Processing ${filename}...`)

  const dataset = readDatasetJson(filename)
  if (!dataset) {
    console.error(`  -> File not found: ${filename}`)
    return
  }

  const extractedExperiments: ExtractedExperiment[] = []

  for (let i = 0; i < dataset.experiments.length; i++) {
    const exp = dataset.experiments[i]
    console.log(`  -> Extracting experiment ${i + 1}/${dataset.experiments.length}...`)

    const extracted = dryRun
      ? createEmptyExtractedFields()
      : await extractFieldsFromExperiment(exp)

    extractedExperiments.push({
      ...exp,
      extracted,
    })
  }

  const searchable = aggregateToSearchable(extractedExperiments)

  const result: SearchableDataset = {
    ...dataset,
    searchable,
    experiments: extractedExperiments,
  }

  if (!dryRun) {
    writeExtractedJson(filename, result)
    console.log(`  -> Saved to extracted-json/dataset/${filename}`)
  } else {
    console.log(`  -> [dry-run] Would save to extracted-json/dataset/${filename}`)
    console.log(`  -> Searchable fields:`, JSON.stringify(searchable, null, 2))
  }
}

async function processAllDatasets(
  concurrency: number,
  dryRun: boolean,
): Promise<void> {
  const dir = getDatasetJsonDir()
  const files = readdirSync(dir).filter(f => f.endsWith(".json"))

  console.log(`Found ${files.length} dataset files`)

  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency)
    await Promise.all(batch.map(f => processOneDataset(f, dryRun)))
  }
}

const parseArgs = (): ExtractArgs =>
  yargs(hideBin(process.argv))
    .option("file", { alias: "f", type: "string", description: "Process single file" })
    .option("hum-id", { alias: "i", type: "array", string: true, description: "Process datasets for specified humIds" })
    .option("concurrency", { alias: "c", type: "number", default: 1, description: "Concurrent processing" })
    .option("dry-run", { type: "boolean", default: false, description: "Dry run without LLM calls" })
    .parseSync()

async function processDatasets(
  files: string[],
  concurrency: number,
  dryRun: boolean,
): Promise<void> {
  console.log(`Processing ${files.length} dataset files...`)

  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency)
    await Promise.all(batch.map(f => processOneDataset(f, dryRun)))
  }
}

const main = async (): Promise<void> => {
  const args = parseArgs()

  console.log(`Ollama API: ${OLLAMA_BASE_URL}`)
  console.log(`Ollama Model: ${OLLAMA_MODEL}`)

  const dryRun = args.dryRun ?? false
  const concurrency = args.concurrency ?? 1

  if (args.file) {
    // Single file mode
    await processOneDataset(args.file, dryRun)
  } else if (args.humId && args.humId.length > 0) {
    // humId mode
    console.log(`Finding datasets for humIds: ${args.humId.join(", ")}`)
    const files = findDatasetFilesByHumIds(args.humId)
    console.log(`Found ${files.length} dataset files`)
    await processDatasets(files, concurrency, dryRun)
  } else {
    // All datasets mode
    const dir = getDatasetJsonDir()
    const files = readdirSync(dir).filter(f => f.endsWith(".json"))
    await processDatasets(files, concurrency, dryRun)
  }

  console.log("Done!")
}

if (require.main === module) {
  await main()
}

export {
  extractFieldsFromExperiment,
  aggregateToSearchable,
  parseExtractedFields,
  formatExperimentData,
}
