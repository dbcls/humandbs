/**
 * TSV Export
 *
 * Exports data from llm-extracted directory to TSV files for manual editing.
 * All TSV files are sorted by humId.
 */
import { existsSync, readdirSync, writeFileSync, mkdirSync, readFileSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { getResultsDirPath, DETAIL_PAGE_BASE_URL } from "@/crawler/io"
import type {
  LangType,
  TextValue,
  DiseaseInfo,
  PlatformInfo,
  DataVolume,
  ExtractedExperiment,
  EnrichedResearch,
  EnrichedPublication,
  TransformedResearchVersion,
  SearchableEnrichedDataset,
} from "@/crawler/types"

// === Options ===

interface ExportOptions {
  humId?: string
  lang?: LangType
  output?: string
}

// === Utility Functions ===

const escapeForTsv = (value: unknown): string => {
  if (value === null || value === undefined) {
    return ""
  }

  const str = typeof value === "object" ? JSON.stringify(value) : String(value)

  // Escape tabs, newlines, and carriage returns
  return str
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
}

const textValueToString = (tv: TextValue | null | undefined): string => {
  if (!tv) return ""
  return escapeForTsv(tv.text)
}

const toTsvRow = (values: unknown[]): string => {
  return values.map(v => escapeForTsv(v)).join("\t")
}

const writeTsv = (filePath: string, headers: string[], rows: string[][]): void => {
  const content = [toTsvRow(headers), ...rows.map(r => toTsvRow(r))].join("\n")
  writeFileSync(filePath, content, "utf8")
  console.log(`  Written: ${filePath} (${rows.length} rows)`)
}

const genDetailUrl = (humVersionId: string, lang: LangType): string => {
  return lang === "ja"
    ? `${DETAIL_PAGE_BASE_URL}${humVersionId}`
    : `${DETAIL_PAGE_BASE_URL}en/${humVersionId}`
}

/** Sort function for humId (e.g., hum0001, hum0002, ...) */
const sortByHumId = <T extends { humId: string }>(a: T, b: T): number => {
  const numA = parseInt(a.humId.replace("hum", ""), 10)
  const numB = parseInt(b.humId.replace("hum", ""), 10)
  return numA - numB
}

/** Sort function for humId + version + datasetId */
const sortByHumIdVersionDataset = <T extends { humId: string; version: string; datasetId: string }>(
  a: T,
  b: T,
): number => {
  const humIdCompare = sortByHumId(a, b)
  if (humIdCompare !== 0) return humIdCompare

  // Compare version (v1, v2, ...)
  const versionA = parseInt(a.version.replace("v", ""), 10)
  const versionB = parseInt(b.version.replace("v", ""), 10)
  if (versionA !== versionB) return versionA - versionB

  // Compare datasetId
  return a.datasetId.localeCompare(b.datasetId)
}

// === Directory Functions ===

const getTsvDir = (outputDir?: string): string => {
  const base = outputDir ?? join(getResultsDirPath(), "tsv")
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true })
  }
  return base
}

const getLlmExtractedDir = (type: "research" | "research-version" | "dataset"): string => {
  return join(getResultsDirPath(), "llm-extracted", type)
}

// === Read JSON Functions ===

const readJsonFiles = <T>(dir: string, filter?: (filename: string) => boolean): T[] => {
  if (!existsSync(dir)) {
    console.warn(`Directory not found: ${dir}`)
    return []
  }

  const files = readdirSync(dir).filter(f => f.endsWith(".json"))
  const filteredFiles = filter ? files.filter(filter) : files

  return filteredFiles.map(f => {
    const content = readFileSync(join(dir, f), "utf8")
    return JSON.parse(content) as T
  })
}

// === Export Research Summary TSV ===

const RESEARCH_SUMMARY_HEADERS = [
  "humId",
  "lang",
  "url",
  "title",
  "aims",
  "methods",
  "targets",
  "footers",
  "versionIds",
  "latestVersion",
  "firstReleaseDate",
  "lastReleaseDate",
]

const researchSummaryToRow = (r: EnrichedResearch): unknown[] => {
  const latestHumVersionId = `${r.humId}-${r.latestVersion}`
  return [
    r.humId,
    r.lang,
    genDetailUrl(latestHumVersionId, r.lang),
    r.title,
    textValueToString(r.summary.aims),
    textValueToString(r.summary.methods),
    textValueToString(r.summary.targets),
    JSON.stringify(r.summary.footers.map(f => f.text)),
    JSON.stringify(r.versionIds),
    r.latestVersion,
    r.firstReleaseDate,
    r.lastReleaseDate,
  ]
}

export const exportResearchSummaryTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting research-summary.tsv...")

  const dir = getLlmExtractedDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  const researches = readJsonFiles<EnrichedResearch>(dir, filter)
    .sort(sortByHumId)

  const rows = researches.map(r => researchSummaryToRow(r) as string[])

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-summary.tsv"), RESEARCH_SUMMARY_HEADERS, rows)
}

// === Export Research Data Provider TSV ===

const DATA_PROVIDER_HEADERS = [
  "humId",
  "lang",
  "url",
  "index",
  "name",
  "email",
  "orcid",
  "organization_name",
  "organization_country",
]

const dataProviderToRows = (r: EnrichedResearch): unknown[][] => {
  const latestHumVersionId = `${r.humId}-${r.latestVersion}`
  const url = genDetailUrl(latestHumVersionId, r.lang)

  return r.dataProvider.map((dp, i) => [
    r.humId,
    r.lang,
    url,
    i,
    textValueToString(dp.name),
    dp.email ?? "",
    dp.orcid ?? "",
    dp.organization ? textValueToString(dp.organization.name) : "",
    dp.organization?.address?.country ?? "",
  ])
}

export const exportDataProviderTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting research-data-provider.tsv...")

  const dir = getLlmExtractedDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  const researches = readJsonFiles<EnrichedResearch>(dir, filter)
    .sort(sortByHumId)

  const rows: string[][] = []
  for (const r of researches) {
    rows.push(...dataProviderToRows(r) as string[][])
  }

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-data-provider.tsv"), DATA_PROVIDER_HEADERS, rows)
}

// === Export Research Project TSV ===

const RESEARCH_PROJECT_HEADERS = [
  "humId",
  "lang",
  "url",
  "index",
  "name",
  "project_url",
]

const researchProjectToRows = (r: EnrichedResearch): unknown[][] => {
  const latestHumVersionId = `${r.humId}-${r.latestVersion}`
  const pageUrl = genDetailUrl(latestHumVersionId, r.lang)

  return r.researchProject.map((rp, i) => [
    r.humId,
    r.lang,
    pageUrl,
    i,
    textValueToString(rp.name),
    rp.url?.url ?? "",
  ])
}

export const exportResearchProjectTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting research-project.tsv...")

  const dir = getLlmExtractedDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  const researches = readJsonFiles<EnrichedResearch>(dir, filter)
    .sort(sortByHumId)

  const rows: string[][] = []
  for (const r of researches) {
    rows.push(...researchProjectToRows(r) as string[][])
  }

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-project.tsv"), RESEARCH_PROJECT_HEADERS, rows)
}

// === Export Research Grant TSV ===

const GRANT_HEADERS = [
  "humId",
  "lang",
  "url",
  "index",
  "id",
  "title",
  "agency_name",
]

const grantToRows = (r: EnrichedResearch): unknown[][] => {
  const latestHumVersionId = `${r.humId}-${r.latestVersion}`
  const url = genDetailUrl(latestHumVersionId, r.lang)

  return r.grant.map((g, i) => [
    r.humId,
    r.lang,
    url,
    i,
    JSON.stringify(g.id),
    g.title,
    g.agency.name,
  ])
}

export const exportGrantTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting research-grant.tsv...")

  const dir = getLlmExtractedDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  const researches = readJsonFiles<EnrichedResearch>(dir, filter)
    .sort(sortByHumId)

  const rows: string[][] = []
  for (const r of researches) {
    rows.push(...grantToRows(r) as string[][])
  }

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-grant.tsv"), GRANT_HEADERS, rows)
}

// === Export Research Publication TSV ===

const PUBLICATION_HEADERS = [
  "humId",
  "lang",
  "url",
  "index",
  "title",
  "doi",
  "datasetIds",
]

const publicationToRows = (r: EnrichedResearch): unknown[][] => {
  const latestHumVersionId = `${r.humId}-${r.latestVersion}`
  const url = genDetailUrl(latestHumVersionId, r.lang)

  return r.relatedPublication.map((p: EnrichedPublication, i) => [
    r.humId,
    r.lang,
    url,
    i,
    p.title,
    p.doi ?? "",
    JSON.stringify(p.datasetIds ?? []),
  ])
}

export const exportPublicationTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting research-publication.tsv...")

  const dir = getLlmExtractedDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  const researches = readJsonFiles<EnrichedResearch>(dir, filter)
    .sort(sortByHumId)

  const rows: string[][] = []
  for (const r of researches) {
    rows.push(...publicationToRows(r) as string[][])
  }

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-publication.tsv"), PUBLICATION_HEADERS, rows)
}

// === Export Research CAU (Controlled Access User) TSV ===

const CAU_HEADERS = [
  "humId",
  "lang",
  "url",
  "index",
  "name",
  "organization",
  "country",
  "researchTitle",
  "datasetIds",
  "periodOfDataUse_startDate",
  "periodOfDataUse_endDate",
]

const cauToRows = (r: EnrichedResearch): unknown[][] => {
  const latestHumVersionId = `${r.humId}-${r.latestVersion}`
  const url = genDetailUrl(latestHumVersionId, r.lang)

  return r.controlledAccessUser.map((u, i) => [
    r.humId,
    r.lang,
    url,
    i,
    textValueToString(u.name),
    u.organization ? textValueToString(u.organization.name) : "",
    u.organization?.address?.country ?? "",
    u.researchTitle ?? "",
    JSON.stringify(u.datasetIds ?? []),
    u.periodOfDataUse?.startDate ?? "",
    u.periodOfDataUse?.endDate ?? "",
  ])
}

export const exportCauTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting research-cau.tsv...")

  const dir = getLlmExtractedDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  const researches = readJsonFiles<EnrichedResearch>(dir, filter)
    .sort(sortByHumId)

  const rows: string[][] = []
  for (const r of researches) {
    rows.push(...cauToRows(r) as string[][])
  }

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-cau.tsv"), CAU_HEADERS, rows)
}

// === Export Research Version TSV ===

const RESEARCH_VERSION_HEADERS = [
  "humId",
  "lang",
  "version",
  "releaseNoteUrl",
  "releaseDate",
  "releaseNote",
  "datasetIds",
]

const researchVersionToRow = (rv: TransformedResearchVersion): unknown[] => {
  return [
    rv.humId,
    rv.lang,
    rv.version,
    genDetailUrl(rv.humVersionId, rv.lang) + "-release",
    rv.releaseDate,
    textValueToString(rv.releaseNote),
    JSON.stringify(rv.datasetIds),
  ]
}

export const exportResearchVersionTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting research-version.tsv...")

  const dir = getLlmExtractedDir("research-version")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  const versions = readJsonFiles<TransformedResearchVersion>(dir, filter)
    .sort(sortByHumId)

  const rows = versions.map(rv => researchVersionToRow(rv) as string[])

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-version.tsv"), RESEARCH_VERSION_HEADERS, rows)
}

// === Export Dataset TSV ===

const DATASET_HEADERS = [
  "humId",
  "lang",
  "version",
  "url",
  "datasetId",
  "versionReleaseDate",
  "typeOfData",
  "criteria",
  "releaseDate",
  "searchable_diseases",
  "searchable_tissues",
  "searchable_assayTypes",
  "searchable_platforms",
  "searchable_readTypes",
  "searchable_fileTypes",
  "searchable_totalSubjectCount",
  "searchable_totalDataVolume",
  "searchable_hasHealthyControl",
  "searchable_hasTumor",
  "searchable_hasCellLine",
  "originalMetadata",
]

const diseaseToString = (d: DiseaseInfo): string => {
  return d.icd10 ? `${d.label}(${d.icd10})` : d.label
}

const platformToString = (p: PlatformInfo): string => {
  return `${p.vendor}:${p.model}`
}

const dataVolumeToString = (vol: DataVolume | null): string => {
  if (!vol) return ""
  return `${vol.value} ${vol.unit}`
}

const datasetToRow = (ds: SearchableEnrichedDataset): unknown[] => {
  return [
    ds.humId,
    ds.lang,
    ds.version,
    genDetailUrl(ds.humVersionId, ds.lang),
    ds.datasetId,
    ds.versionReleaseDate,
    escapeForTsv(ds.typeOfData ?? ""),
    JSON.stringify(ds.criteria ?? []),
    JSON.stringify(ds.releaseDate ?? []),
    JSON.stringify(ds.searchable.diseases.map(diseaseToString)),
    JSON.stringify(ds.searchable.tissues),
    JSON.stringify(ds.searchable.assayTypes),
    JSON.stringify(ds.searchable.platforms.map(platformToString)),
    JSON.stringify(ds.searchable.readTypes),
    JSON.stringify(ds.searchable.fileTypes),
    ds.searchable.totalSubjectCount ?? "",
    dataVolumeToString(ds.searchable.totalDataVolume),
    ds.searchable.hasHealthyControl,
    ds.searchable.hasTumor,
    ds.searchable.hasCellLine,
    ds.originalMetadata ? JSON.stringify(ds.originalMetadata) : "",
  ]
}

export const exportDatasetTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting dataset.tsv...")

  const dir = getLlmExtractedDir("dataset")
  const filter = (filename: string): boolean => {
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  let datasets = readJsonFiles<SearchableEnrichedDataset>(dir, filter)

  if (options.humId) {
    datasets = datasets.filter(ds => ds.humId === options.humId)
  }

  // Sort by humId, version, datasetId
  datasets.sort(sortByHumIdVersionDataset)

  const rows = datasets.map(ds => datasetToRow(ds) as string[])

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "dataset.tsv"), DATASET_HEADERS, rows)
}

// === Export Experiment TSV ===

const EXPERIMENT_HEADERS = [
  "humId",
  "lang",
  "version",
  "url",
  "datasetId",
  "versionReleaseDate",
  "experimentIndex",
  "header",
  "extracted_subjectCount",
  "extracted_subjectCountType",
  "extracted_healthStatus",
  "extracted_diseases",
  "extracted_tissue",
  "extracted_isTumor",
  "extracted_cellLine",
  "extracted_assayType",
  "extracted_libraryKit",
  "extracted_platformVendor",
  "extracted_platformModel",
  "extracted_readType",
  "extracted_readLength",
  "extracted_targets",
  "extracted_fileTypes",
  "extracted_dataVolume",
]

const experimentToRow = (
  ds: SearchableEnrichedDataset,
  exp: ExtractedExperiment,
  index: number,
): unknown[] => {
  const ext = exp.extracted
  return [
    ds.humId,
    ds.lang,
    ds.version,
    genDetailUrl(ds.humVersionId, ds.lang),
    ds.datasetId,
    ds.versionReleaseDate,
    index,
    textValueToString(exp.header),
    ext.subjectCount ?? "",
    ext.subjectCountType ?? "",
    ext.healthStatus ?? "",
    JSON.stringify(ext.diseases.map(diseaseToString)),
    ext.tissue ?? "",
    ext.isTumor ?? "",
    ext.cellLine ?? "",
    ext.assayType ?? "",
    ext.libraryKit ?? "",
    ext.platformVendor ?? "",
    ext.platformModel ?? "",
    ext.readType ?? "",
    ext.readLength ?? "",
    ext.targets ?? "",
    JSON.stringify(ext.fileTypes),
    dataVolumeToString(ext.dataVolume),
  ]
}

export const exportExperimentTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting experiment.tsv...")

  const dir = getLlmExtractedDir("dataset")
  const filter = (filename: string): boolean => {
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  let datasets = readJsonFiles<SearchableEnrichedDataset>(dir, filter)

  if (options.humId) {
    datasets = datasets.filter(ds => ds.humId === options.humId)
  }

  // Sort by humId, version, datasetId
  datasets.sort(sortByHumIdVersionDataset)

  const rows: string[][] = []
  for (const ds of datasets) {
    for (let i = 0; i < ds.experiments.length; i++) {
      rows.push(experimentToRow(ds, ds.experiments[i], i) as string[])
    }
  }

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "experiment.tsv"), EXPERIMENT_HEADERS, rows)
}

// === Export All ===

export const exportAllTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Starting TSV export...")
  console.log(`  Options: ${JSON.stringify(options)}`)

  // Research related
  await exportResearchSummaryTsv(options)
  await exportDataProviderTsv(options)
  await exportResearchProjectTsv(options)
  await exportGrantTsv(options)
  await exportPublicationTsv(options)
  await exportCauTsv(options)

  // Research Version
  await exportResearchVersionTsv(options)

  // Dataset and Experiment
  await exportDatasetTsv(options)
  await exportExperimentTsv(options)

  const outputDir = getTsvDir(options.output)
  console.log(`TSV export completed! Output: ${outputDir}`)
}

// === CLI ===

interface CliArgs {
  humId?: string
  lang?: LangType
  output?: string
}

const parseArgs = (): CliArgs =>
  yargs(hideBin(process.argv))
    .option("hum-id", {
      alias: "i",
      type: "string",
      description: "Filter by humId (e.g., hum0001)",
    })
    .option("lang", {
      alias: "l",
      choices: ["ja", "en"] as const,
      description: "Filter by language",
    })
    .option("output", {
      alias: "o",
      type: "string",
      description: "Output directory (default: crawler-results/tsv)",
    })
    .parseSync()

const main = async (): Promise<void> => {
  const args = parseArgs()
  await exportAllTsv({
    humId: args.humId,
    lang: args.lang,
    output: args.output,
  })
}

if (import.meta.main) {
  await main()
}
