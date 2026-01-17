import { existsSync, readdirSync, writeFileSync, mkdirSync, readFileSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { getResultsDirPath, DETAIL_PAGE_BASE_URL } from "@/crawler/io"
import type {
  LangType,
  TextValue,
  TransformedResearch,
  TransformedResearchVersion,
  TransformedPerson,
  TransformedGrant,
  TransformedPublication,
  TransformedResearchProject,
  SearchableDataset,
  ExtractedExperiment,
  DiseaseInfo,
  PlatformInfo,
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

const joinPipe = (arr: unknown[] | null | undefined): string => {
  if (!arr || arr.length === 0) return ""
  return arr.map(v => escapeForTsv(v)).join("|")
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

// === Directory Functions ===

const getTsvDir = (outputDir?: string): string => {
  const base = outputDir ?? join(getResultsDirPath(), "tsv")
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true })
  }
  return base
}

const getStructuredJsonDir = (type: "research" | "research-version" | "dataset"): string => {
  return join(getResultsDirPath(), "structured-json", type)
}

const getLlmExtractedDir = (): string => {
  return join(getResultsDirPath(), "llm-extracted", "dataset")
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

// === Export Research TSV (simplified) ===

const RESEARCH_HEADERS = [
  "humId",
  "lang",
  "humVersionUrl",
  "title",
  "summary_aims",
  "summary_methods",
  "summary_targets",
  "summary_urls",
  "dataProviderCount",
  "researchProjectCount",
  "grantCount",
  "publicationCount",
  "controlledAccessUserCount",
  "versionIds",
  "latestVersion",
  "firstReleaseDate",
  "lastReleaseDate",
]

const researchToRow = (r: TransformedResearch): unknown[] => {
  const latestHumVersionId = `${r.humId}-${r.latestVersion}`
  return [
    r.humId,
    r.lang,
    genDetailUrl(latestHumVersionId, r.lang),
    r.title,
    textValueToString(r.summary.aims),
    textValueToString(r.summary.methods),
    textValueToString(r.summary.targets),
    r.summary.url.map(u => u.url).join("|"),
    r.dataProvider.length,
    r.researchProject.length,
    r.grant.length,
    r.relatedPublication.length,
    r.controlledAccessUser.length,
    r.versionIds.join("|"),
    r.latestVersion,
    r.firstReleaseDate,
    r.lastReleaseDate,
  ]
}

export const exportResearchTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting research.tsv...")

  const dir = getStructuredJsonDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  const researches = readJsonFiles<TransformedResearch>(dir, filter)
  const rows = researches.map(r => researchToRow(r) as string[])

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research.tsv"), RESEARCH_HEADERS, rows)
}

// === Export Research Data Provider TSV ===

const DATA_PROVIDER_HEADERS = [
  "humId",
  "lang",
  "humVersionUrl",
  "index",
  "name",
  "organization",
  "email",
  "orcid",
]

const dataProviderToRows = (r: TransformedResearch): unknown[][] => {
  const latestHumVersionId = `${r.humId}-${r.latestVersion}`
  const url = genDetailUrl(latestHumVersionId, r.lang)

  return r.dataProvider.map((dp, i) => [
    r.humId,
    r.lang,
    url,
    i,
    textValueToString(dp.name),
    dp.organization ? textValueToString(dp.organization.name) : "",
    dp.email ?? "",
    dp.orcid ?? "",
  ])
}

export const exportDataProviderTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting research-data-provider.tsv...")

  const dir = getStructuredJsonDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  const researches = readJsonFiles<TransformedResearch>(dir, filter)
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
  "humVersionUrl",
  "index",
  "name",
  "url",
]

const researchProjectToRows = (r: TransformedResearch): unknown[][] => {
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

  const dir = getStructuredJsonDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  const researches = readJsonFiles<TransformedResearch>(dir, filter)
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
  "humVersionUrl",
  "index",
  "ids",
  "title",
  "agency",
]

const grantToRows = (r: TransformedResearch): unknown[][] => {
  const latestHumVersionId = `${r.humId}-${r.latestVersion}`
  const url = genDetailUrl(latestHumVersionId, r.lang)

  return r.grant.map((g, i) => [
    r.humId,
    r.lang,
    url,
    i,
    g.id.join("|"),
    g.title,
    g.agency.name,
  ])
}

export const exportGrantTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting research-grant.tsv...")

  const dir = getStructuredJsonDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  const researches = readJsonFiles<TransformedResearch>(dir, filter)
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
  "humVersionUrl",
  "index",
  "title",
  "doi",
  "datasetIds",
]

const publicationToRows = (r: TransformedResearch): unknown[][] => {
  const latestHumVersionId = `${r.humId}-${r.latestVersion}`
  const url = genDetailUrl(latestHumVersionId, r.lang)

  return r.relatedPublication.map((p, i) => [
    r.humId,
    r.lang,
    url,
    i,
    p.title,
    p.doi ?? "",
    p.datasetIds?.join("|") ?? "",
  ])
}

export const exportPublicationTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting research-publication.tsv...")

  const dir = getStructuredJsonDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  const researches = readJsonFiles<TransformedResearch>(dir, filter)
  const rows: string[][] = []
  for (const r of researches) {
    rows.push(...publicationToRows(r) as string[][])
  }

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-publication.tsv"), PUBLICATION_HEADERS, rows)
}

// === Export Research Controlled Access User TSV ===

const CONTROLLED_ACCESS_USER_HEADERS = [
  "humId",
  "lang",
  "humVersionUrl",
  "index",
  "name",
  "organization",
  "country",
  "researchTitle",
  "datasetIds",
  "periodOfDataUse_start",
  "periodOfDataUse_end",
]

const controlledAccessUserToRows = (r: TransformedResearch): unknown[][] => {
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
    u.datasetIds?.join("|") ?? "",
    u.periodOfDataUse?.startDate ?? "",
    u.periodOfDataUse?.endDate ?? "",
  ])
}

export const exportControlledAccessUserTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting research-controlled-access-user.tsv...")

  const dir = getStructuredJsonDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  const researches = readJsonFiles<TransformedResearch>(dir, filter)
  const rows: string[][] = []
  for (const r of researches) {
    rows.push(...controlledAccessUserToRows(r) as string[][])
  }

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-controlled-access-user.tsv"), CONTROLLED_ACCESS_USER_HEADERS, rows)
}

// === Export ResearchVersion TSV ===

const RESEARCH_VERSION_HEADERS = [
  "humId",
  "lang",
  "version",
  "humVersionId",
  "humVersionUrl",
  "datasetIds",
  "releaseDate",
  "releaseNote",
]

const researchVersionToRow = (rv: TransformedResearchVersion): unknown[] => {
  return [
    rv.humId,
    rv.lang,
    rv.version,
    rv.humVersionId,
    genDetailUrl(rv.humVersionId, rv.lang),
    rv.datasetIds.join("|"),
    rv.releaseDate,
    textValueToString(rv.releaseNote),
  ]
}

export const exportResearchVersionTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting research-version.tsv...")

  const dir = getStructuredJsonDir("research-version")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  const versions = readJsonFiles<TransformedResearchVersion>(dir, filter)
  const rows = versions.map(rv => researchVersionToRow(rv) as string[])

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-version.tsv"), RESEARCH_VERSION_HEADERS, rows)
}

// === Export Dataset TSV (aggregated) ===

const DATASET_HEADERS = [
  "datasetId",
  "lang",
  "version",
  "versionReleaseDate",
  "humId",
  "humVersionId",
  "humVersionUrl",
  "typeOfData",
  "criteria",
  "releaseDate",
  "experimentCount",
  "searchable_diseases",
  "searchable_tissues",
  "searchable_assayTypes",
  "searchable_platforms",
  "searchable_readTypes",
  "searchable_fileTypes",
  "searchable_totalSubjectCount",
  "searchable_totalDataVolumeBytes",
  "searchable_hasHealthyControl",
  "searchable_hasTumor",
  "searchable_hasCellLine",
]

const diseaseToString = (d: DiseaseInfo): string => {
  return d.icd10 ? `${d.label}(${d.icd10})` : d.label
}

const platformToString = (p: PlatformInfo): string => {
  return `${p.vendor}:${p.model}`
}

const datasetToRow = (ds: SearchableDataset): unknown[] => {
  return [
    ds.datasetId,
    ds.lang,
    ds.version,
    ds.versionReleaseDate,
    ds.humId,
    ds.humVersionId,
    genDetailUrl(ds.humVersionId, ds.lang),
    joinPipe(ds.typeOfData),
    joinPipe(ds.criteria),
    joinPipe(ds.releaseDate),
    ds.experiments.length,
    ds.searchable.diseases.map(diseaseToString).join("|"),
    ds.searchable.tissues.join("|"),
    ds.searchable.assayTypes.join("|"),
    ds.searchable.platforms.map(platformToString).join("|"),
    ds.searchable.readTypes.join("|"),
    ds.searchable.fileTypes.join("|"),
    ds.searchable.totalSubjectCount ?? "",
    ds.searchable.totalDataVolumeBytes ?? "",
    ds.searchable.hasHealthyControl,
    ds.searchable.hasTumor,
    ds.searchable.hasCellLine,
  ]
}

export const exportDatasetTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting dataset.tsv...")

  const dir = getLlmExtractedDir()
  const filter = (filename: string): boolean => {
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  let datasets = readJsonFiles<SearchableDataset>(dir, filter)

  if (options.humId) {
    datasets = datasets.filter(ds => ds.humId === options.humId)
  }

  const rows = datasets.map(ds => datasetToRow(ds) as string[])

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "dataset.tsv"), DATASET_HEADERS, rows)
}

// === Export Experiment TSV (expanded) ===

const EXPERIMENT_HEADERS = [
  "datasetId",
  "lang",
  "version",
  "humId",
  "humVersionId",
  "humVersionUrl",
  "experimentIndex",
  "experimentHeader",
  "experimentData",
  "ext_subjectCount",
  "ext_subjectCountType",
  "ext_healthStatus",
  "ext_disease_label",
  "ext_disease_icd10",
  "ext_tissue",
  "ext_isTumor",
  "ext_cellLine",
  "ext_assayType",
  "ext_libraryKit",
  "ext_platformVendor",
  "ext_platformModel",
  "ext_readType",
  "ext_readLength",
  "ext_targets",
  "ext_fileTypes",
  "ext_dataVolumeBytes",
]

const experimentToRow = (
  ds: SearchableDataset,
  exp: ExtractedExperiment,
  index: number,
): unknown[] => {
  const ext = exp.extracted
  return [
    ds.datasetId,
    ds.lang,
    ds.version,
    ds.humId,
    ds.humVersionId,
    genDetailUrl(ds.humVersionId, ds.lang),
    index,
    textValueToString(exp.header),
    JSON.stringify(exp.data),
    ext.subjectCount ?? "",
    ext.subjectCountType ?? "",
    ext.healthStatus ?? "",
    ext.disease?.label ?? "",
    ext.disease?.icd10 ?? "",
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
    ext.fileTypes.join("|"),
    ext.dataVolumeBytes ?? "",
  ]
}

export const exportExperimentTsv = async (options: ExportOptions): Promise<void> => {
  console.log("Exporting experiment.tsv...")

  const dir = getLlmExtractedDir()
  const filter = (filename: string): boolean => {
    if (options.lang && !filename.endsWith(`-${options.lang}.json`)) return false
    return true
  }

  let datasets = readJsonFiles<SearchableDataset>(dir, filter)

  if (options.humId) {
    datasets = datasets.filter(ds => ds.humId === options.humId)
  }

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

  // Research and related
  await exportResearchTsv(options)
  await exportDataProviderTsv(options)
  await exportResearchProjectTsv(options)
  await exportGrantTsv(options)
  await exportPublicationTsv(options)
  await exportControlledAccessUserTsv(options)

  // Research Version
  await exportResearchVersionTsv(options)

  // Dataset and Experiment
  await exportDatasetTsv(options)
  await exportExperimentTsv(options)

  console.log("TSV export completed!")
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

if (require.main === module) {
  await main()
}
