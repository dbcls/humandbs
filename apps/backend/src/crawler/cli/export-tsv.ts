/**
 * TSV Export
 *
 * Exports data from extracted-json directory to TSV files for manual editing
 * All TSV files are sorted by humId
 * Uses Unified (ja/en integrated) data format
 */
import { existsSync, readdirSync, writeFileSync, mkdirSync, readFileSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import type {
  BilingualTextValue,
  BilingualText,
  Research,
  ResearchVersion,
  Person,
  Grant,
  Publication,
  ResearchProject,
  SearchableDataset,
  ExtractedExperiment,
} from "@/crawler/types"
import { getResultsDir } from "@/crawler/utils/io"
import { logger, setLogLevel } from "@/crawler/utils/logger"
import { escapeForTsv, toTsvRow } from "@/crawler/utils/tsv"

// Options

interface ExportOptions {
  humId?: string
  output?: string
}

// Utility Functions

const writeTsv = (filePath: string, headers: string[], rows: string[][]): void => {
  const content = [toTsvRow(headers), ...rows.map(r => toTsvRow(r))].join("\n")
  writeFileSync(filePath, content, "utf8")
  logger.info("Written TSV file", { filePath, rows: rows.length })
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

// Bilingual Value Helpers

const bilingualTextToJa = (bt: BilingualText | null | undefined): string => {
  if (!bt) return ""
  return escapeForTsv(bt.ja ?? "")
}

const bilingualTextToEn = (bt: BilingualText | null | undefined): string => {
  if (!bt) return ""
  return escapeForTsv(bt.en ?? "")
}

const bilingualTextValueToJa = (btv: BilingualTextValue | null | undefined): string => {
  if (!btv?.ja) return ""
  return escapeForTsv(btv.ja.text)
}

const bilingualTextValueToEn = (btv: BilingualTextValue | null | undefined): string => {
  if (!btv?.en) return ""
  return escapeForTsv(btv.en.text)
}

// Directory Functions

const getTsvDir = (outputDir?: string): string => {
  const base = outputDir ?? join(getResultsDir(), "tsv")
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true })
  }
  return base
}

const getExtractedDir = (type: "research" | "research-version" | "dataset"): string => {
  return join(getResultsDir(), "extracted-json", type)
}

// Read JSON Functions

const readJsonFiles = <T>(dir: string, filter?: (filename: string) => boolean): T[] => {
  if (!existsSync(dir)) {
    logger.warn("Directory not found", { dir })
    return []
  }

  const files = readdirSync(dir).filter(f => f.endsWith(".json"))
  const filteredFiles = filter ? files.filter(filter) : files

  return filteredFiles.map(f => {
    const content = readFileSync(join(dir, f), "utf8")
    return JSON.parse(content) as T
  })
}

// Export Research TSV

const RESEARCH_HEADERS = [
  "humId",
  "title_ja",
  "title_en",
  "url_ja",
  "url_en",
  "versionIds",
  "latestVersion",
  "firstReleaseDate",
  "lastReleaseDate",
  "comment",
]

const researchToRow = (r: Research): unknown[] => {
  return [
    r.humId,
    bilingualTextToJa(r.title),
    bilingualTextToEn(r.title),
    r.url.ja ?? "",
    r.url.en ?? "",
    JSON.stringify(r.versionIds),
    r.latestVersion,
    r.firstReleaseDate,
    r.lastReleaseDate,
    "", // comment
  ]
}

export const exportResearchTsv = async (options: ExportOptions): Promise<void> => {
  logger.info("Exporting research.tsv...")

  const dir = getExtractedDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    return true
  }

  const researches = readJsonFiles<Research>(dir, filter)
    .sort(sortByHumId)

  const rows = researches.map(r => researchToRow(r) as string[])

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research.tsv"), RESEARCH_HEADERS, rows)
}

// Export Research Summary TSV

const RESEARCH_SUMMARY_HEADERS = [
  "humId",
  "url_ja",
  "url_en",
  "aims_ja",
  "aims_en",
  "methods_ja",
  "methods_en",
  "targets_ja",
  "targets_en",
  "footers_ja",
  "footers_en",
  "comment",
]

const researchSummaryToRow = (r: Research): unknown[] => {
  return [
    r.humId,
    r.url.ja ?? "",
    r.url.en ?? "",
    bilingualTextValueToJa(r.summary.aims),
    bilingualTextValueToEn(r.summary.aims),
    bilingualTextValueToJa(r.summary.methods),
    bilingualTextValueToEn(r.summary.methods),
    bilingualTextValueToJa(r.summary.targets),
    bilingualTextValueToEn(r.summary.targets),
    JSON.stringify(r.summary.footers.ja.map(f => f.text)),
    JSON.stringify(r.summary.footers.en.map(f => f.text)),
    "", // comment
  ]
}

export const exportResearchSummaryTsv = async (options: ExportOptions): Promise<void> => {
  logger.info("Exporting research-summary.tsv...")

  const dir = getExtractedDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    return true
  }

  const researches = readJsonFiles<Research>(dir, filter)
    .sort(sortByHumId)

  const rows = researches.map(r => researchSummaryToRow(r) as string[])

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-summary.tsv"), RESEARCH_SUMMARY_HEADERS, rows)
}

// Export Data Provider TSV

const DATA_PROVIDER_HEADERS = [
  "humId",
  "url_ja",
  "url_en",
  "index",
  "name_ja",
  "name_en",
  "email",
  "orcid",
  "organization_name_ja",
  "organization_name_en",
  "organization_country",
  "comment",
]

const dataProviderToRows = (r: Research): unknown[][] => {
  return r.dataProvider.map((dp: Person, i) => [
    r.humId,
    r.url.ja ?? "",
    r.url.en ?? "",
    i,
    bilingualTextValueToJa(dp.name),
    bilingualTextValueToEn(dp.name),
    dp.email ?? "",
    dp.orcid ?? "",
    dp.organization ? bilingualTextValueToJa(dp.organization.name) : "",
    dp.organization ? bilingualTextValueToEn(dp.organization.name) : "",
    dp.organization?.address?.country ?? "",
    "", // comment
  ])
}

export const exportDataProviderTsv = async (options: ExportOptions): Promise<void> => {
  logger.info("Exporting research-data-provider.tsv...")

  const dir = getExtractedDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    return true
  }

  const researches = readJsonFiles<Research>(dir, filter)
    .sort(sortByHumId)

  const rows: string[][] = []
  for (const r of researches) {
    rows.push(...dataProviderToRows(r) as string[][])
  }

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-data-provider.tsv"), DATA_PROVIDER_HEADERS, rows)
}

// Export Grant TSV

const GRANT_HEADERS = [
  "humId",
  "url_ja",
  "url_en",
  "index",
  "grantId",
  "title_ja",
  "title_en",
  "agency_name_ja",
  "agency_name_en",
  "comment",
]

const grantToRows = (r: Research): unknown[][] => {
  return r.grant.map((g: Grant, i) => [
    r.humId,
    r.url.ja ?? "",
    r.url.en ?? "",
    i,
    JSON.stringify(g.id),
    bilingualTextToJa(g.title),
    bilingualTextToEn(g.title),
    bilingualTextToJa(g.agency.name),
    bilingualTextToEn(g.agency.name),
    "", // comment
  ])
}

export const exportGrantTsv = async (options: ExportOptions): Promise<void> => {
  logger.info("Exporting research-grant.tsv...")

  const dir = getExtractedDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    return true
  }

  const researches = readJsonFiles<Research>(dir, filter)
    .sort(sortByHumId)

  const rows: string[][] = []
  for (const r of researches) {
    rows.push(...grantToRows(r) as string[][])
  }

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-grant.tsv"), GRANT_HEADERS, rows)
}

// Export Publication TSV

const PUBLICATION_HEADERS = [
  "humId",
  "url_ja",
  "url_en",
  "index",
  "title_ja",
  "title_en",
  "doi",
  "datasetIds",
  "comment",
]

const publicationToRows = (r: Research): unknown[][] => {
  return r.relatedPublication.map((p: Publication, i) => [
    r.humId,
    r.url.ja ?? "",
    r.url.en ?? "",
    i,
    bilingualTextToJa(p.title),
    bilingualTextToEn(p.title),
    p.doi ?? "",
    JSON.stringify(p.datasetIds ?? []),
    "", // comment
  ])
}

export const exportPublicationTsv = async (options: ExportOptions): Promise<void> => {
  logger.info("Exporting research-publication.tsv...")

  const dir = getExtractedDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    return true
  }

  const researches = readJsonFiles<Research>(dir, filter)
    .sort(sortByHumId)

  const rows: string[][] = []
  for (const r of researches) {
    rows.push(...publicationToRows(r) as string[][])
  }

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-publication.tsv"), PUBLICATION_HEADERS, rows)
}

// Export Research Project TSV

const PROJECT_HEADERS = [
  "humId",
  "url_ja",
  "url_en",
  "index",
  "name_ja",
  "name_en",
  "project_url_ja",
  "project_url_en",
  "comment",
]

const projectToRows = (r: Research): unknown[][] => {
  return r.researchProject.map((rp: ResearchProject, i) => [
    r.humId,
    r.url.ja ?? "",
    r.url.en ?? "",
    i,
    bilingualTextValueToJa(rp.name),
    bilingualTextValueToEn(rp.name),
    rp.url?.ja?.url ?? "",
    rp.url?.en?.url ?? "",
    "", // comment
  ])
}

export const exportProjectTsv = async (options: ExportOptions): Promise<void> => {
  logger.info("Exporting research-project.tsv...")

  const dir = getExtractedDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    return true
  }

  const researches = readJsonFiles<Research>(dir, filter)
    .sort(sortByHumId)

  const rows: string[][] = []
  for (const r of researches) {
    rows.push(...projectToRows(r) as string[][])
  }

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-project.tsv"), PROJECT_HEADERS, rows)
}

// Export Controlled Access User TSV

const CAU_HEADERS = [
  "humId",
  "url_ja",
  "url_en",
  "index",
  "name_ja",
  "name_en",
  "organization_name_ja",
  "organization_name_en",
  "organization_country",
  "researchTitle_ja",
  "researchTitle_en",
  "datasetIds",
  "periodOfDataUse_start",
  "periodOfDataUse_end",
  "comment",
]

const cauToRows = (r: Research): unknown[][] => {
  return r.controlledAccessUser.map((u: Person, i) => [
    r.humId,
    r.url.ja ?? "",
    r.url.en ?? "",
    i,
    bilingualTextValueToJa(u.name),
    bilingualTextValueToEn(u.name),
    u.organization ? bilingualTextValueToJa(u.organization.name) : "",
    u.organization ? bilingualTextValueToEn(u.organization.name) : "",
    u.organization?.address?.country ?? "",
    bilingualTextToJa(u.researchTitle ?? null),
    bilingualTextToEn(u.researchTitle ?? null),
    JSON.stringify(u.datasetIds ?? []),
    u.periodOfDataUse?.startDate ?? "",
    u.periodOfDataUse?.endDate ?? "",
    "", // comment
  ])
}

export const exportCauTsv = async (options: ExportOptions): Promise<void> => {
  logger.info("Exporting research-cau.tsv...")

  const dir = getExtractedDir("research")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    return true
  }

  const researches = readJsonFiles<Research>(dir, filter)
    .sort(sortByHumId)

  const rows: string[][] = []
  for (const r of researches) {
    rows.push(...cauToRows(r) as string[][])
  }

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-cau.tsv"), CAU_HEADERS, rows)
}

// Export Research Version TSV

const RESEARCH_VERSION_HEADERS = [
  "humId",
  "humVersionId",
  "version",
  "versionReleaseDate",
  "releaseNote_ja",
  "releaseNote_en",
  "datasetIds",
  "comment",
]

const researchVersionToRow = (rv: ResearchVersion): unknown[] => {
  return [
    rv.humId,
    rv.humVersionId,
    rv.version,
    rv.versionReleaseDate,
    bilingualTextValueToJa(rv.releaseNote),
    bilingualTextValueToEn(rv.releaseNote),
    JSON.stringify(rv.datasetIds),
    "", // comment
  ]
}

export const exportResearchVersionTsv = async (options: ExportOptions): Promise<void> => {
  logger.info("Exporting research-version.tsv...")

  const dir = getExtractedDir("research-version")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.startsWith(options.humId)) return false
    return true
  }

  const versions = readJsonFiles<ResearchVersion>(dir, filter)
    .sort((a, b) => {
      const humCompare = sortByHumId(a, b)
      if (humCompare !== 0) return humCompare
      const vA = parseInt(a.version.replace("v", ""), 10)
      const vB = parseInt(b.version.replace("v", ""), 10)
      return vA - vB
    })

  const rows = versions.map(rv => researchVersionToRow(rv) as string[])

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "research-version.tsv"), RESEARCH_VERSION_HEADERS, rows)
}

// Export Dataset TSV

const DATASET_HEADERS = [
  "humId",
  "humVersionId",
  "version",
  "datasetId",
  "versionReleaseDate",
  "typeOfData_ja",
  "typeOfData_en",
  "criteria",
  "releaseDate",
  // Searchable fields
  "searchable_diseases",
  "searchable_tissues",
  "searchable_populations",
  "searchable_assayTypes",
  "searchable_platforms",
  "searchable_readTypes",
  "searchable_fileTypes",
  "searchable_totalSubjectCount",
  "searchable_totalDataVolume",
  "searchable_hasHealthyControl",
  "searchable_hasTumor",
  "searchable_hasCellLine",
  // Manual curation fields
  "ageGroup",
  "region",
  "sex",
  "comment",
]

const datasetToRow = (d: SearchableDataset): unknown[] => {
  return [
    d.humId,
    d.humVersionId,
    d.version,
    d.datasetId,
    d.versionReleaseDate,
    d.typeOfData.ja ?? "",
    d.typeOfData.en ?? "",
    JSON.stringify(d.criteria),
    JSON.stringify(d.releaseDate),
    // Searchable
    JSON.stringify(d.searchable?.diseases ?? []),
    JSON.stringify(d.searchable?.tissues ?? []),
    JSON.stringify(d.searchable?.populations ?? []),
    JSON.stringify(d.searchable?.assayTypes ?? []),
    JSON.stringify(d.searchable?.platforms ?? []),
    JSON.stringify(d.searchable?.readTypes ?? []),
    JSON.stringify(d.searchable?.fileTypes ?? []),
    d.searchable?.totalSubjectCount ?? "",
    d.searchable?.totalDataVolume
      ? `${d.searchable.totalDataVolume.value} ${d.searchable.totalDataVolume.unit}`
      : "",
    d.searchable?.hasHealthyControl ?? "",
    d.searchable?.hasTumor ?? "",
    d.searchable?.hasCellLine ?? "",
    // Manual curation fields (empty by default)
    "", // ageGroup
    "", // region
    "", // sex
    "", // comment
  ]
}

export const exportDatasetTsv = async (options: ExportOptions): Promise<void> => {
  logger.info("Exporting dataset.tsv...")

  const dir = getExtractedDir("dataset")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.includes(options.humId)) return false
    return true
  }

  const datasets = readJsonFiles<SearchableDataset>(dir, filter)
    .sort(sortByHumIdVersionDataset)

  const rows = datasets.map(d => datasetToRow(d) as string[])

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "dataset.tsv"), DATASET_HEADERS, rows)
}

// Export Experiment TSV

const EXPERIMENT_HEADERS = [
  "humId",
  "humVersionId",
  "version",
  "datasetId",
  "experimentIndex",
  "header_ja",
  "header_en",
  // Extracted fields
  "extracted_subjectCount",
  "extracted_subjectCountType",
  "extracted_healthStatus",
  "extracted_diseases",
  "extracted_tissues",
  "extracted_isTumor",
  "extracted_cellLine",
  "extracted_population",
  "extracted_assayType",
  "extracted_libraryKits",
  "extracted_platformVendor",
  "extracted_platformModel",
  "extracted_readType",
  "extracted_readLength",
  "extracted_targets",
  "extracted_fileTypes",
  "extracted_dataVolume",
  "comment",
]

const experimentToRow = (
  d: SearchableDataset,
  exp: ExtractedExperiment,
  expIndex: number,
): unknown[] => {
  const ext = exp.extracted
  return [
    d.humId,
    d.humVersionId,
    d.version,
    d.datasetId,
    expIndex,
    bilingualTextValueToJa(exp.header),
    bilingualTextValueToEn(exp.header),
    // Extracted
    ext?.subjectCount ?? "",
    ext?.subjectCountType ?? "",
    ext?.healthStatus ?? "",
    JSON.stringify(ext?.diseases?.map(dis => dis.icd10 ? `${dis.label}(${dis.icd10})` : dis.label) ?? []),
    JSON.stringify(ext?.tissues ?? []),
    ext?.isTumor ?? "",
    ext?.cellLine ?? "",
    ext?.population ?? "",
    ext?.assayType ?? "",
    JSON.stringify(ext?.libraryKits ?? []),
    ext?.platformVendor ?? "",
    ext?.platformModel ?? "",
    ext?.readType ?? "",
    ext?.readLength ?? "",
    ext?.targets ?? "",
    JSON.stringify(ext?.fileTypes ?? []),
    ext?.dataVolume ? `${ext.dataVolume.value} ${ext.dataVolume.unit}` : "",
    "", // comment
  ]
}

export const exportExperimentTsv = async (options: ExportOptions): Promise<void> => {
  logger.info("Exporting experiment.tsv...")

  const dir = getExtractedDir("dataset")
  const filter = (filename: string): boolean => {
    if (options.humId && !filename.includes(options.humId)) return false
    return true
  }

  const datasets = readJsonFiles<SearchableDataset>(dir, filter)
    .sort(sortByHumIdVersionDataset)

  const rows: string[][] = []
  for (const d of datasets) {
    for (let i = 0; i < d.experiments.length; i++) {
      const exp = d.experiments[i]
      rows.push(experimentToRow(d, exp, i) as string[])
    }
  }

  const tsvDir = getTsvDir(options.output)
  writeTsv(join(tsvDir, "experiment.tsv"), EXPERIMENT_HEADERS, rows)
}

// Export All

export const exportAllTsv = async (options: ExportOptions): Promise<void> => {
  logger.info("Starting TSV export", { options })

  // Research
  await exportResearchTsv(options)
  await exportResearchSummaryTsv(options)
  await exportDataProviderTsv(options)
  await exportGrantTsv(options)
  await exportPublicationTsv(options)
  await exportProjectTsv(options)
  await exportCauTsv(options)

  // Research Version
  await exportResearchVersionTsv(options)

  // Dataset and Experiment
  await exportDatasetTsv(options)
  await exportExperimentTsv(options)

  const outputDir = getTsvDir(options.output)
  logger.info("Completed", { outputDir })
}

// CLI

interface CliArgs {
  humId?: string
  output?: string
}

const parseArgs = (): CliArgs => {
  const args = yargs(hideBin(process.argv))
    .option("hum-id", {
      alias: "i",
      type: "string",
      description: "Filter by humId (e.g., hum0001)",
    })
    .option("output", {
      alias: "o",
      type: "string",
      description: "Output directory (default: crawler-results/tsv)",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      description: "Show debug logs",
      default: false,
    })
    .option("quiet", {
      alias: "q",
      type: "boolean",
      description: "Show only warnings and errors",
      default: false,
    })
    .parseSync() as CliArgs & { verbose?: boolean; quiet?: boolean }

  if (args.verbose) {
    setLogLevel("debug")
  } else if (args.quiet) {
    setLogLevel("warn")
  }

  return args
}

const main = async (): Promise<void> => {
  const args = parseArgs()
  await exportAllTsv({
    humId: args.humId,
    output: args.output,
  })
}

if (import.meta.main) {
  await main()
}
