/**
 * Bilingual Dataset Merging
 *
 * Groups ja/en datasets by datasetId + version and matches experiments
 * between languages for bilingual LLM extraction.
 */
import { existsSync, readdirSync, readFileSync } from "fs"
import { join } from "path"

import { getResultsDirPath } from "@/crawler/io"
import type {
  TransformedExperiment,
  TransformedPublication,
  TransformedGrant,
  TransformedPerson,
  TransformedResearchProject,
  EnrichedDataset,
  BilingualDataset,
  BilingualExperimentPair,
  PublicationMatchType,
  GrantMatchType,
  ControlledAccessUserMatchType,
  ResearchProjectMatchType,
} from "@/crawler/types"

// === Accession ID Extraction ===

const ACCESSION_PATTERNS = [
  /JGAD\d+/,
  /JGAS\d+/,
  /DRA\d+/,
  /DRR\d+/,
  /DRS\d+/,
  /DRX\d+/,
  /GEA\d+/,
  /PRJDB\d+/,
]

/** Extract accession ID from experiment header */
export const extractAccessionId = (exp: TransformedExperiment): string | null => {
  const headerText = exp.header?.text ?? ""

  for (const pattern of ACCESSION_PATTERNS) {
    const match = headerText.match(pattern)
    if (match) {
      return match[0]
    }
  }

  return null
}

// === Header Normalization ===

/** Normalize header for comparison */
export const normalizeHeader = (header: string): string => {
  return header
    .toLowerCase()
    .replace(/[（）()「」【】[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Check if two headers are similar */
export const isSimilarHeader = (jaHeader: string, enHeader: string): boolean => {
  const ja = normalizeHeader(jaHeader)
  const en = normalizeHeader(enHeader)

  // Exact match after normalization
  if (ja === en) return true

  // One contains the other
  if (ja.includes(en) || en.includes(ja)) return true

  // Check for common keywords (assay types, etc.)
  const keywords = [
    "exome", "wgs", "wes", "rna-seq", "rnaseq", "chip-seq", "chipseq",
    "microarray", "gwas", "snp", "methylation", "atac-seq", "atacseq",
    "whole genome", "whole exome", "targeted",
  ]

  const jaLower = ja.toLowerCase()
  const enLower = en.toLowerCase()

  for (const keyword of keywords) {
    if (jaLower.includes(keyword) && enLower.includes(keyword)) {
      return true
    }
  }

  return false
}

// === Experiment Matching ===

/** Match experiments between ja and en using multiple strategies */
export const matchExperiments = (
  jaExperiments: TransformedExperiment[],
  enExperiments: TransformedExperiment[],
): BilingualExperimentPair[] => {
  const results: BilingualExperimentPair[] = []
  const matchedJaIndices = new Set<number>()
  const matchedEnIndices = new Set<number>()

  // Strategy 1: Match by accession ID
  for (let jaIdx = 0; jaIdx < jaExperiments.length; jaIdx++) {
    if (matchedJaIndices.has(jaIdx)) continue

    const jaExp = jaExperiments[jaIdx]
    const jaAccessionId = extractAccessionId(jaExp)
    if (!jaAccessionId) continue

    for (let enIdx = 0; enIdx < enExperiments.length; enIdx++) {
      if (matchedEnIndices.has(enIdx)) continue

      const enExp = enExperiments[enIdx]
      const enAccessionId = extractAccessionId(enExp)

      if (jaAccessionId === enAccessionId) {
        results.push({
          experimentKey: jaAccessionId,
          ja: jaExp,
          en: enExp,
          matchType: "exact",
        })
        matchedJaIndices.add(jaIdx)
        matchedEnIndices.add(enIdx)
        break
      }
    }
  }

  // Strategy 2: Match by header similarity
  for (let jaIdx = 0; jaIdx < jaExperiments.length; jaIdx++) {
    if (matchedJaIndices.has(jaIdx)) continue

    const jaExp = jaExperiments[jaIdx]
    const jaHeader = jaExp.header?.text ?? ""

    for (let enIdx = 0; enIdx < enExperiments.length; enIdx++) {
      if (matchedEnIndices.has(enIdx)) continue

      const enExp = enExperiments[enIdx]
      const enHeader = enExp.header?.text ?? ""

      if (isSimilarHeader(jaHeader, enHeader)) {
        results.push({
          experimentKey: `fuzzy-${jaIdx}`,
          ja: jaExp,
          en: enExp,
          matchType: "fuzzy",
        })
        matchedJaIndices.add(jaIdx)
        matchedEnIndices.add(enIdx)
        break
      }
    }
  }

  // Strategy 3: Match by position (only for remaining unmatched experiments)
  const unmatchedJaIndices = [...Array(jaExperiments.length).keys()].filter(
    i => !matchedJaIndices.has(i),
  )
  const unmatchedEnIndices = [...Array(enExperiments.length).keys()].filter(
    i => !matchedEnIndices.has(i),
  )

  const minUnmatched = Math.min(unmatchedJaIndices.length, unmatchedEnIndices.length)
  for (let i = 0; i < minUnmatched; i++) {
    const jaIdx = unmatchedJaIndices[i]
    const enIdx = unmatchedEnIndices[i]
    results.push({
      experimentKey: `position-${jaIdx}`,
      ja: jaExperiments[jaIdx],
      en: enExperiments[enIdx],
      matchType: "position",
    })
    matchedJaIndices.add(jaIdx)
    matchedEnIndices.add(enIdx)
  }

  // Add remaining unmatched ja experiments
  for (let jaIdx = 0; jaIdx < jaExperiments.length; jaIdx++) {
    if (matchedJaIndices.has(jaIdx)) continue

    results.push({
      experimentKey: `unmatched-ja-${jaIdx}`,
      ja: jaExperiments[jaIdx],
      en: null,
      matchType: "unmatched-ja",
    })
  }

  // Add remaining unmatched en experiments
  for (let enIdx = 0; enIdx < enExperiments.length; enIdx++) {
    if (matchedEnIndices.has(enIdx)) continue

    results.push({
      experimentKey: `unmatched-en-${enIdx}`,
      ja: null,
      en: enExperiments[enIdx],
      matchType: "unmatched-en",
    })
  }

  return results
}

// === Publication Matching ===

/** Bilingual publication pair */
export interface BilingualPublicationPair {
  ja: TransformedPublication | null
  en: TransformedPublication | null
  matchType: PublicationMatchType
}

/** Normalize title for comparison */
const normalizeTitle = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Check if two titles are similar */
const isSimilarTitle = (jaTitle: string, enTitle: string): boolean => {
  const ja = normalizeTitle(jaTitle)
  const en = normalizeTitle(enTitle)

  if (ja === "" || en === "") return false
  if (ja === en) return true

  // Check if one contains the other (for partial matches)
  if (ja.length > 10 && en.length > 10) {
    if (ja.includes(en) || en.includes(ja)) return true
  }

  // Calculate word overlap ratio
  const jaWords = new Set(ja.split(" ").filter(w => w.length > 2))
  const enWords = new Set(en.split(" ").filter(w => w.length > 2))

  if (jaWords.size === 0 || enWords.size === 0) return false

  let overlap = 0
  for (const word of jaWords) {
    if (enWords.has(word)) overlap++
  }

  const overlapRatio = overlap / Math.min(jaWords.size, enWords.size)
  return overlapRatio >= 0.5
}

/** Check if datasetIds arrays have overlap */
const hasDatasetIdOverlap = (
  ids1: string[] | undefined,
  ids2: string[] | undefined,
): boolean => {
  if (!ids1 || !ids2 || ids1.length === 0 || ids2.length === 0) return false
  const set1 = new Set(ids1)
  return ids2.some(id => set1.has(id))
}

/** Match publications between ja and en */
export const matchPublications = (
  jaPubs: TransformedPublication[],
  enPubs: TransformedPublication[],
): BilingualPublicationPair[] => {
  const results: BilingualPublicationPair[] = []
  const matchedJaIndices = new Set<number>()
  const matchedEnIndices = new Set<number>()

  // Strategy 1: Match by DOI
  for (let jaIdx = 0; jaIdx < jaPubs.length; jaIdx++) {
    if (matchedJaIndices.has(jaIdx)) continue

    const jaPub = jaPubs[jaIdx]
    if (!jaPub.doi) continue

    for (let enIdx = 0; enIdx < enPubs.length; enIdx++) {
      if (matchedEnIndices.has(enIdx)) continue

      const enPub = enPubs[enIdx]
      if (jaPub.doi === enPub.doi) {
        results.push({ ja: jaPub, en: enPub, matchType: "exact-doi" })
        matchedJaIndices.add(jaIdx)
        matchedEnIndices.add(enIdx)
        break
      }
    }
  }

  // Strategy 2: Match by datasetIds
  for (let jaIdx = 0; jaIdx < jaPubs.length; jaIdx++) {
    if (matchedJaIndices.has(jaIdx)) continue

    const jaPub = jaPubs[jaIdx]
    if (!jaPub.datasetIds || jaPub.datasetIds.length === 0) continue

    for (let enIdx = 0; enIdx < enPubs.length; enIdx++) {
      if (matchedEnIndices.has(enIdx)) continue

      const enPub = enPubs[enIdx]
      if (hasDatasetIdOverlap(jaPub.datasetIds, enPub.datasetIds)) {
        results.push({ ja: jaPub, en: enPub, matchType: "exact-datasetIds" })
        matchedJaIndices.add(jaIdx)
        matchedEnIndices.add(enIdx)
        break
      }
    }
  }

  // Strategy 3: Match by title similarity
  for (let jaIdx = 0; jaIdx < jaPubs.length; jaIdx++) {
    if (matchedJaIndices.has(jaIdx)) continue

    const jaPub = jaPubs[jaIdx]
    if (!jaPub.title) continue

    for (let enIdx = 0; enIdx < enPubs.length; enIdx++) {
      if (matchedEnIndices.has(enIdx)) continue

      const enPub = enPubs[enIdx]
      if (enPub.title && isSimilarTitle(jaPub.title, enPub.title)) {
        results.push({ ja: jaPub, en: enPub, matchType: "fuzzy-title" })
        matchedJaIndices.add(jaIdx)
        matchedEnIndices.add(enIdx)
        break
      }
    }
  }

  // Strategy 4: Match by position (remaining unmatched)
  const unmatchedJa = [...Array(jaPubs.length).keys()].filter(i => !matchedJaIndices.has(i))
  const unmatchedEn = [...Array(enPubs.length).keys()].filter(i => !matchedEnIndices.has(i))

  const minUnmatched = Math.min(unmatchedJa.length, unmatchedEn.length)
  for (let i = 0; i < minUnmatched; i++) {
    results.push({
      ja: jaPubs[unmatchedJa[i]],
      en: enPubs[unmatchedEn[i]],
      matchType: "position",
    })
    matchedJaIndices.add(unmatchedJa[i])
    matchedEnIndices.add(unmatchedEn[i])
  }

  // Add remaining unmatched
  for (let i = minUnmatched; i < unmatchedJa.length; i++) {
    results.push({ ja: jaPubs[unmatchedJa[i]], en: null, matchType: "unmatched-ja" })
  }
  for (let i = minUnmatched; i < unmatchedEn.length; i++) {
    results.push({ ja: null, en: enPubs[unmatchedEn[i]], matchType: "unmatched-en" })
  }

  return results
}

// === Grant Matching ===

/** Bilingual grant pair */
export interface BilingualGrantPair {
  ja: TransformedGrant | null
  en: TransformedGrant | null
  matchType: GrantMatchType
}

/** Check if grantId arrays have overlap */
const hasGrantIdOverlap = (ids1: string[], ids2: string[]): boolean => {
  if (ids1.length === 0 || ids2.length === 0) return false
  const set1 = new Set(ids1)
  return ids2.some(id => set1.has(id))
}

/** Match grants between ja and en */
export const matchGrants = (
  jaGrants: TransformedGrant[],
  enGrants: TransformedGrant[],
): BilingualGrantPair[] => {
  const results: BilingualGrantPair[] = []
  const matchedJaIndices = new Set<number>()
  const matchedEnIndices = new Set<number>()

  // Strategy 1: Match by grantId overlap
  for (let jaIdx = 0; jaIdx < jaGrants.length; jaIdx++) {
    if (matchedJaIndices.has(jaIdx)) continue

    const jaGrant = jaGrants[jaIdx]
    if (jaGrant.id.length === 0) continue

    for (let enIdx = 0; enIdx < enGrants.length; enIdx++) {
      if (matchedEnIndices.has(enIdx)) continue

      const enGrant = enGrants[enIdx]
      if (hasGrantIdOverlap(jaGrant.id, enGrant.id)) {
        results.push({ ja: jaGrant, en: enGrant, matchType: "exact-grantId" })
        matchedJaIndices.add(jaIdx)
        matchedEnIndices.add(enIdx)
        break
      }
    }
  }

  // Strategy 2: Match by position (remaining unmatched)
  const unmatchedJa = [...Array(jaGrants.length).keys()].filter(i => !matchedJaIndices.has(i))
  const unmatchedEn = [...Array(enGrants.length).keys()].filter(i => !matchedEnIndices.has(i))

  const minUnmatched = Math.min(unmatchedJa.length, unmatchedEn.length)
  for (let i = 0; i < minUnmatched; i++) {
    results.push({
      ja: jaGrants[unmatchedJa[i]],
      en: enGrants[unmatchedEn[i]],
      matchType: "position",
    })
    matchedJaIndices.add(unmatchedJa[i])
    matchedEnIndices.add(unmatchedEn[i])
  }

  // Add remaining unmatched
  for (let i = minUnmatched; i < unmatchedJa.length; i++) {
    results.push({ ja: jaGrants[unmatchedJa[i]], en: null, matchType: "unmatched-ja" })
  }
  for (let i = minUnmatched; i < unmatchedEn.length; i++) {
    results.push({ ja: null, en: enGrants[unmatchedEn[i]], matchType: "unmatched-en" })
  }

  return results
}

// === Controlled Access User Matching ===

/** Bilingual controlled access user pair */
export interface BilingualControlledAccessUserPair {
  ja: TransformedPerson | null
  en: TransformedPerson | null
  matchType: ControlledAccessUserMatchType
}

/** Check if periodOfDataUse matches */
const isPeriodOfDataUseEqual = (
  p1: TransformedPerson["periodOfDataUse"],
  p2: TransformedPerson["periodOfDataUse"],
): boolean => {
  if (!p1 || !p2) return false
  return p1.startDate === p2.startDate && p1.endDate === p2.endDate
}

/** Match controlled access users between ja and en */
export const matchControlledAccessUsers = (
  jaUsers: TransformedPerson[],
  enUsers: TransformedPerson[],
): BilingualControlledAccessUserPair[] => {
  const results: BilingualControlledAccessUserPair[] = []
  const matchedJaIndices = new Set<number>()
  const matchedEnIndices = new Set<number>()

  // Strategy 1: Match by both datasetIds AND periodOfDataUse
  for (let jaIdx = 0; jaIdx < jaUsers.length; jaIdx++) {
    if (matchedJaIndices.has(jaIdx)) continue

    const jaUser = jaUsers[jaIdx]
    if (!jaUser.datasetIds || jaUser.datasetIds.length === 0) continue
    if (!jaUser.periodOfDataUse) continue

    for (let enIdx = 0; enIdx < enUsers.length; enIdx++) {
      if (matchedEnIndices.has(enIdx)) continue

      const enUser = enUsers[enIdx]
      if (
        hasDatasetIdOverlap(jaUser.datasetIds, enUser.datasetIds) &&
        isPeriodOfDataUseEqual(jaUser.periodOfDataUse, enUser.periodOfDataUse)
      ) {
        results.push({ ja: jaUser, en: enUser, matchType: "exact-both" })
        matchedJaIndices.add(jaIdx)
        matchedEnIndices.add(enIdx)
        break
      }
    }
  }

  // Strategy 2: Match by datasetIds only
  for (let jaIdx = 0; jaIdx < jaUsers.length; jaIdx++) {
    if (matchedJaIndices.has(jaIdx)) continue

    const jaUser = jaUsers[jaIdx]
    if (!jaUser.datasetIds || jaUser.datasetIds.length === 0) continue

    for (let enIdx = 0; enIdx < enUsers.length; enIdx++) {
      if (matchedEnIndices.has(enIdx)) continue

      const enUser = enUsers[enIdx]
      if (hasDatasetIdOverlap(jaUser.datasetIds, enUser.datasetIds)) {
        results.push({ ja: jaUser, en: enUser, matchType: "exact-datasetIds" })
        matchedJaIndices.add(jaIdx)
        matchedEnIndices.add(enIdx)
        break
      }
    }
  }

  // Strategy 3: Match by position (remaining unmatched)
  const unmatchedJa = [...Array(jaUsers.length).keys()].filter(i => !matchedJaIndices.has(i))
  const unmatchedEn = [...Array(enUsers.length).keys()].filter(i => !matchedEnIndices.has(i))

  const minUnmatched = Math.min(unmatchedJa.length, unmatchedEn.length)
  for (let i = 0; i < minUnmatched; i++) {
    results.push({
      ja: jaUsers[unmatchedJa[i]],
      en: enUsers[unmatchedEn[i]],
      matchType: "position",
    })
    matchedJaIndices.add(unmatchedJa[i])
    matchedEnIndices.add(unmatchedEn[i])
  }

  // Add remaining unmatched
  for (let i = minUnmatched; i < unmatchedJa.length; i++) {
    results.push({ ja: jaUsers[unmatchedJa[i]], en: null, matchType: "unmatched-ja" })
  }
  for (let i = minUnmatched; i < unmatchedEn.length; i++) {
    results.push({ ja: null, en: enUsers[unmatchedEn[i]], matchType: "unmatched-en" })
  }

  return results
}

// === Research Project Matching ===

/** Bilingual research project pair */
export interface BilingualResearchProjectPair {
  ja: TransformedResearchProject | null
  en: TransformedResearchProject | null
  matchType: ResearchProjectMatchType
}

/** Check if URLs match */
const isUrlEqual = (
  url1: TransformedResearchProject["url"],
  url2: TransformedResearchProject["url"],
): boolean => {
  if (!url1 || !url2) return false
  return url1.url === url2.url
}

/** Check if project names are similar */
const isSimilarProjectName = (
  name1: TransformedResearchProject["name"],
  name2: TransformedResearchProject["name"],
): boolean => {
  const text1 = name1?.text ?? ""
  const text2 = name2?.text ?? ""
  return isSimilarTitle(text1, text2)
}

/** Match research projects between ja and en */
export const matchResearchProjects = (
  jaProjects: TransformedResearchProject[],
  enProjects: TransformedResearchProject[],
): BilingualResearchProjectPair[] => {
  const results: BilingualResearchProjectPair[] = []
  const matchedJaIndices = new Set<number>()
  const matchedEnIndices = new Set<number>()

  // Strategy 1: Match by URL
  for (let jaIdx = 0; jaIdx < jaProjects.length; jaIdx++) {
    if (matchedJaIndices.has(jaIdx)) continue

    const jaProject = jaProjects[jaIdx]
    if (!jaProject.url) continue

    for (let enIdx = 0; enIdx < enProjects.length; enIdx++) {
      if (matchedEnIndices.has(enIdx)) continue

      const enProject = enProjects[enIdx]
      if (isUrlEqual(jaProject.url, enProject.url)) {
        results.push({ ja: jaProject, en: enProject, matchType: "exact-url" })
        matchedJaIndices.add(jaIdx)
        matchedEnIndices.add(enIdx)
        break
      }
    }
  }

  // Strategy 2: Match by name similarity
  for (let jaIdx = 0; jaIdx < jaProjects.length; jaIdx++) {
    if (matchedJaIndices.has(jaIdx)) continue

    const jaProject = jaProjects[jaIdx]

    for (let enIdx = 0; enIdx < enProjects.length; enIdx++) {
      if (matchedEnIndices.has(enIdx)) continue

      const enProject = enProjects[enIdx]
      if (isSimilarProjectName(jaProject.name, enProject.name)) {
        results.push({ ja: jaProject, en: enProject, matchType: "fuzzy-name" })
        matchedJaIndices.add(jaIdx)
        matchedEnIndices.add(enIdx)
        break
      }
    }
  }

  // Strategy 3: Match by position (remaining unmatched)
  const unmatchedJa = [...Array(jaProjects.length).keys()].filter(i => !matchedJaIndices.has(i))
  const unmatchedEn = [...Array(enProjects.length).keys()].filter(i => !matchedEnIndices.has(i))

  const minUnmatched = Math.min(unmatchedJa.length, unmatchedEn.length)
  for (let i = 0; i < minUnmatched; i++) {
    results.push({
      ja: jaProjects[unmatchedJa[i]],
      en: enProjects[unmatchedEn[i]],
      matchType: "position",
    })
    matchedJaIndices.add(unmatchedJa[i])
    matchedEnIndices.add(unmatchedEn[i])
  }

  // Add remaining unmatched
  for (let i = minUnmatched; i < unmatchedJa.length; i++) {
    results.push({ ja: jaProjects[unmatchedJa[i]], en: null, matchType: "unmatched-ja" })
  }
  for (let i = minUnmatched; i < unmatchedEn.length; i++) {
    results.push({ ja: null, en: enProjects[unmatchedEn[i]], matchType: "unmatched-en" })
  }

  return results
}

// === I/O Functions ===

const getEnrichedJsonDir = (): string =>
  join(getResultsDirPath(), "enriched-json", "dataset")

const readDatasetJson = (filename: string): EnrichedDataset | null => {
  const filePath = join(getEnrichedJsonDir(), filename)
  if (!existsSync(filePath)) {
    return null
  }
  const content = readFileSync(filePath, "utf8")
  return JSON.parse(content) as EnrichedDataset
}

// === Bilingual Grouping ===

interface DatasetFileInfo {
  filename: string
  dataset: EnrichedDataset
}

/**
 * Group enriched datasets by datasetId + version as bilingual pairs.
 * Returns a Map where each entry represents a ja/en pair for the same dataset version.
 */
export const groupBilingualDatasets = (): Map<string, BilingualDataset> => {
  const dir = getEnrichedJsonDir()
  if (!existsSync(dir)) {
    console.warn(`Enriched JSON directory does not exist: ${dir}`)
    return new Map()
  }

  const files = readdirSync(dir).filter(f => f.endsWith(".json"))

  // Group by datasetId + version
  const groups = new Map<string, { ja: DatasetFileInfo | null; en: DatasetFileInfo | null }>()

  for (const filename of files) {
    const dataset = readDatasetJson(filename)
    if (!dataset) continue

    const key = `${dataset.datasetId}-${dataset.version}`
    const existing = groups.get(key) ?? { ja: null, en: null }

    if (dataset.lang === "ja") {
      existing.ja = { filename, dataset }
    } else {
      existing.en = { filename, dataset }
    }

    groups.set(key, existing)
  }

  // Convert to BilingualDataset
  const result = new Map<string, BilingualDataset>()

  for (const [key, { ja, en }] of groups) {
    const referenceDataset = ja?.dataset ?? en?.dataset
    if (!referenceDataset) continue

    const jaExperiments = ja?.dataset.experiments ?? []
    const enExperiments = en?.dataset.experiments ?? []

    const experimentPairs = matchExperiments(jaExperiments, enExperiments)

    const bilingual: BilingualDataset = {
      datasetId: referenceDataset.datasetId,
      version: referenceDataset.version,
      versionReleaseDate: referenceDataset.versionReleaseDate,
      humId: referenceDataset.humId,
      jaDataset: ja?.dataset ?? null,
      enDataset: en?.dataset ?? null,
      experimentPairs,
      originalMetadata: ja?.dataset.originalMetadata ?? en?.dataset.originalMetadata ?? null,
    }

    result.set(key, bilingual)
  }

  return result
}

/**
 * Group bilingual datasets and filter by specified criteria.
 */
export const getBilingualDatasetsFiltered = (options: {
  humIds?: string[]
  datasetIds?: string[]
  latestVersionOnly?: boolean
}): BilingualDataset[] => {
  const allDatasets = groupBilingualDatasets()
  let datasets = [...allDatasets.values()]

  // Filter by humIds
  if (options.humIds && options.humIds.length > 0) {
    const humIdSet = new Set(options.humIds)
    datasets = datasets.filter(d => humIdSet.has(d.humId))
  }

  // Filter by datasetIds
  if (options.datasetIds && options.datasetIds.length > 0) {
    const datasetIdSet = new Set(options.datasetIds)
    datasets = datasets.filter(d => datasetIdSet.has(d.datasetId))
  }

  // Filter to latest version only
  if (options.latestVersionOnly) {
    const latestVersions = new Map<string, BilingualDataset>()

    for (const dataset of datasets) {
      const key = dataset.datasetId
      const existing = latestVersions.get(key)

      if (!existing || dataset.versionReleaseDate > existing.versionReleaseDate) {
        latestVersions.set(key, dataset)
      }
    }

    datasets = [...latestVersions.values()]
  }

  return datasets
}
