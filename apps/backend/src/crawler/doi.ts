/**
 * DOI lookup via Crossref API
 *
 * Searches for DOIs by publication title using Crossref Works API.
 * Results are cached to external-cache/doi/ directory.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"

import { getResultsDirPath } from "@/crawler/io"

// === Types ===

interface CrossrefAuthor {
  given?: string
  family?: string
  name?: string
}

interface CrossrefWorkItem {
  DOI: string
  title?: string[]
  author?: CrossrefAuthor[]
  score: number
  type?: string
  published?: {
    "date-parts"?: number[][]
  }
  "container-title"?: string[]
}

interface CrossrefResponse {
  status: string
  message: {
    items: CrossrefWorkItem[]
  }
}

/** DOI search result */
export interface DoiSearchResult {
  doi: string
  title: string
  score: number
  authors: string[]
  journal: string | null
  year: number | null
  type: string | null
}

/** Cached DOI search results for a humId */
export interface DoiCacheEntry {
  humId: string
  searchedAt: string
  results: Record<string, DoiSearchResult | null>
}

// === Constants ===

const CROSSREF_API_BASE = "https://api.crossref.org/works"
const USER_AGENT = "HumanDBsCrawler/1.0 (mailto:support@dbcls.jp)"
const MIN_SCORE_THRESHOLD = 50

// === Cache Directory ===

const getCacheDir = (): string => {
  const dir = join(getResultsDirPath(), "external-cache", "doi")
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

const getCachePath = (humId: string): string =>
  join(getCacheDir(), `${humId}.json`)

// === Helper Functions ===

const normalizeTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const titleSimilarity = (title1: string, title2: string): number => {
  const words1 = new Set(normalizeTitle(title1).split(" "))
  const words2 = new Set(normalizeTitle(title2).split(" "))

  const intersection = new Set([...words1].filter(w => words2.has(w)))
  const union = new Set([...words1, ...words2])

  return union.size > 0 ? intersection.size / union.size : 0
}

const formatAuthors = (authors: CrossrefAuthor[] | undefined): string[] => {
  if (!authors) return []
  return authors.map(a => {
    if (a.name) return a.name
    if (a.family && a.given) return `${a.given} ${a.family}`
    return a.family ?? a.given ?? "Unknown"
  })
}

/**
 * Check if a string is a valid DOI URL (https://doi.org/...)
 */
export const isDoiUrl = (value: string | null | undefined): boolean => {
  if (!value) return false
  return value.startsWith("https://doi.org/")
}

/**
 * Extract DOI from a DOI URL
 */
export const extractDoiFromUrl = (url: string): string => {
  if (url.startsWith("https://doi.org/")) {
    return url.replace("https://doi.org/", "")
  }
  return url
}

/**
 * Parse date string to year (handles YYYY-MM-DD, YYYY/MM/DD, YYYY formats)
 */
const parseYear = (dateStr: string | null | undefined): number | null => {
  if (!dateStr) return null
  const match = dateStr.match(/^(\d{4})/)
  return match ? parseInt(match[1], 10) : null
}

// === API Functions ===

const searchCrossref = async (title: string, fromYear?: number): Promise<CrossrefWorkItem[]> => {
  const params = new URLSearchParams({
    query: title,
    rows: "5",
    select: "DOI,title,author,score,type,published,container-title",
  })

  // Add year filter if specified
  if (fromYear) {
    params.set("filter", `from-pub-date:${fromYear}`)
  }

  const url = `${CROSSREF_API_BASE}?${params.toString()}`

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
      },
    })

    if (!res.ok) {
      if (res.status === 429) {
        console.warn("Crossref rate limit hit, waiting...")
        await new Promise(r => setTimeout(r, 5000))
        return searchCrossref(title, fromYear)
      }
      console.warn(`Crossref API error: ${res.status}`)
      return []
    }

    const json = (await res.json()) as CrossrefResponse
    return json.message.items ?? []
  } catch (e) {
    console.error(`Crossref search failed: ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}

const findBestMatch = (
  queryTitle: string,
  results: CrossrefWorkItem[],
): DoiSearchResult | null => {
  if (results.length === 0) return null

  let bestMatch: CrossrefWorkItem | null = null
  let bestSimilarity = 0

  for (const item of results) {
    const resultTitle = item.title?.[0] ?? ""
    const similarity = titleSimilarity(queryTitle, resultTitle)
    const combinedScore = item.score * similarity

    if (combinedScore > bestSimilarity && item.score >= MIN_SCORE_THRESHOLD) {
      bestSimilarity = combinedScore
      bestMatch = item
    }
  }

  if (!bestMatch) return null

  const resultTitle = bestMatch.title?.[0] ?? ""
  const similarity = titleSimilarity(queryTitle, resultTitle)

  if (similarity < 0.5) {
    return null
  }

  return {
    doi: bestMatch.DOI,
    title: resultTitle,
    score: bestMatch.score * similarity,
    authors: formatAuthors(bestMatch.author),
    journal: bestMatch["container-title"]?.[0] ?? null,
    year: bestMatch.published?.["date-parts"]?.[0]?.[0] ?? null,
    type: bestMatch.type ?? null,
  }
}

// === Public Functions ===

/**
 * Search for DOI by publication title
 * @param title - Publication title to search
 * @param fromYear - Optional year filter (only return publications from this year onwards)
 */
export const searchDoi = async (title: string, fromYear?: number): Promise<DoiSearchResult | null> => {
  if (!title || title.trim().length < 10) {
    return null
  }

  const results = await searchCrossref(title, fromYear)
  return findBestMatch(title, results)
}

/**
 * Batch search DOIs for multiple publications with caching
 *
 * Only searches for DOIs if the publication doesn't have a valid DOI URL (https://doi.org/...)
 * If search returns null, keeps the original doi value.
 *
 * @param humId - HumId for caching
 * @param publications - Array of publications
 * @param firstReleaseDate - Research first release date (used to filter: releaseDate - 3 years)
 * @param useCache - Whether to use cache
 * @param delayMs - Delay between API calls
 */
export const batchSearchDois = async (
  humId: string,
  publications: { title: string; doi?: string | null }[],
  firstReleaseDate?: string | null,
  useCache = true,
  delayMs = 200,
): Promise<Map<string, DoiSearchResult | null>> => {
  const result = new Map<string, DoiSearchResult | null>()
  const cachePath = getCachePath(humId)

  // Calculate fromYear (firstReleaseDate - 3 years)
  const releaseYear = parseYear(firstReleaseDate)
  const fromYear = releaseYear ? releaseYear - 3 : undefined

  // Load existing cache
  let cacheEntry: DoiCacheEntry | null = null
  if (useCache && existsSync(cachePath)) {
    try {
      const content = readFileSync(cachePath, "utf-8")
      cacheEntry = JSON.parse(content) as DoiCacheEntry
    } catch {
      // Cache corrupted
    }
  }

  if (!cacheEntry) {
    cacheEntry = {
      humId,
      searchedAt: new Date().toISOString(),
      results: {},
    }
  }

  for (let i = 0; i < publications.length; i++) {
    const pub = publications[i]
    const title = pub.title

    // Skip if already has a valid DOI URL (https://doi.org/...)
    if (isDoiUrl(pub.doi)) {
      result.set(title, {
        doi: extractDoiFromUrl(pub.doi!),
        title,
        score: 100,
        authors: [],
        journal: null,
        year: null,
        type: null,
      })
      continue
    }

    // Check cache
    if (useCache && title in cacheEntry.results) {
      const cached = cacheEntry.results[title]
      // If cached is null but original has doi, keep original
      if (cached === null && pub.doi) {
        result.set(title, {
          doi: pub.doi,
          title,
          score: 0,
          authors: [],
          journal: null,
          year: null,
          type: null,
        })
      } else {
        result.set(title, cached)
      }
      continue
    }

    // Search Crossref
    const searchResult = await searchDoi(title, fromYear)

    // If search returns null but original has doi, keep original
    if (searchResult === null && pub.doi) {
      const originalResult: DoiSearchResult = {
        doi: pub.doi,
        title,
        score: 0,
        authors: [],
        journal: null,
        year: null,
        type: null,
      }
      result.set(title, originalResult)
      cacheEntry.results[title] = null // Cache that we searched and found nothing
    } else {
      result.set(title, searchResult)
      cacheEntry.results[title] = searchResult
    }

    // Rate limiting
    if (i < publications.length - 1) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  // Save cache
  cacheEntry.searchedAt = new Date().toISOString()
  writeFileSync(cachePath, JSON.stringify(cacheEntry, null, 2))

  return result
}

/**
 * Load cached DOI results for a humId
 */
export const loadDoiCache = (humId: string): DoiCacheEntry | null => {
  const cachePath = getCachePath(humId)
  if (!existsSync(cachePath)) {
    return null
  }

  try {
    const content = readFileSync(cachePath, "utf-8")
    return JSON.parse(content) as DoiCacheEntry
  } catch {
    return null
  }
}
