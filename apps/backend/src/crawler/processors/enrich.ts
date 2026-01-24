/**
 * Enrichment processor
 *
 * Enriches unified data with external API metadata (JGA, DRA, DOI)
 */
import { DEFAULT_API_DELAY_MS } from "@/crawler/config/urls"
import type {
  Dataset,
  Research,
  EnrichedDataset,
  EnrichedResearch,
  EnrichedPublication,
  DoiSearchResult,
} from "@/crawler/types"

// Types

/**
 * Enrichment options
 */
export interface EnrichOptions {
  /** Use cache for API calls */
  useCache?: boolean
  /** Delay between API calls in milliseconds */
  delayMs?: number
}

/**
 * API client interface for getting metadata
 */
export interface MetadataApiClient {
  /** Get JGAD metadata */
  getJgadMetadata: (datasetId: string, useCache: boolean) => Promise<Record<string, unknown> | null>
  /** Get DRA metadata */
  getDraMetadata: (datasetId: string, useCache: boolean) => Promise<Record<string, unknown> | null>
  /** Check if accession is DRA format */
  isDraAccession: (accession: string) => boolean
  /** Batch search DOIs */
  batchSearchDois: (
    humId: string,
    publications: { title: string; doi?: string | null }[],
    firstReleaseDate?: string | null,
    useCache?: boolean,
    delayMs?: number,
  ) => Promise<Map<string, DoiSearchResult | null>>
}

// Dataset Enrichment

/**
 * Get original metadata for a dataset
 */
export const getOriginalMetadata = async (
  datasetId: string,
  apiClient: MetadataApiClient,
  useCache: boolean,
): Promise<Record<string, unknown> | null> => {
  // Try JGAD first
  if (datasetId.startsWith("JGAD")) {
    return await apiClient.getJgadMetadata(datasetId, useCache)
  }

  // Try DRA/ERA/SRA
  if (apiClient.isDraAccession(datasetId)) {
    return await apiClient.getDraMetadata(datasetId, useCache)
  }

  return null
}

/**
 * Enrich a single dataset with external metadata
 */
export const enrichDataset = async (
  dataset: Dataset,
  apiClient: MetadataApiClient,
  options: EnrichOptions = {},
): Promise<EnrichedDataset> => {
  const useCache = options.useCache ?? true

  // Get original metadata
  const metadata = await getOriginalMetadata(dataset.datasetId, apiClient, useCache)

  return {
    ...dataset,
    originalMetadata: metadata,
  }
}

/**
 * Enrich multiple datasets with external metadata
 */
export const enrichDatasets = async (
  datasets: Dataset[],
  apiClient: MetadataApiClient,
  options: EnrichOptions = {},
): Promise<EnrichedDataset[]> => {
  const useCache = options.useCache ?? true
  const delayMs = options.delayMs ?? DEFAULT_API_DELAY_MS
  const results: EnrichedDataset[] = []

  for (let i = 0; i < datasets.length; i++) {
    const dataset = datasets[i]
    const metadata = await getOriginalMetadata(dataset.datasetId, apiClient, useCache)

    results.push({
      ...dataset,
      originalMetadata: metadata,
    })

    // Rate limiting
    if (i < datasets.length - 1 && metadata !== null) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  return results
}

// Research Enrichment

/**
 * Enrich research with DOI information
 */
export const enrichResearch = async (
  research: Research,
  apiClient: MetadataApiClient,
  options: EnrichOptions = {},
): Promise<EnrichedResearch> => {
  const useCache = options.useCache ?? true
  const delayMs = options.delayMs ?? DEFAULT_API_DELAY_MS

  // Check if any publications need DOI
  const needsDoi = research.relatedPublication.some(
    pub => pub.doi === undefined || pub.doi === null,
  )

  if (!needsDoi) {
    return {
      ...research,
      relatedPublication: research.relatedPublication,
    }
  }

  // Prepare publications for DOI search
  // Use English title first, fallback to Japanese
  const publications = research.relatedPublication.map(pub => ({
    title: pub.title.en ?? pub.title.ja ?? "",
    doi: pub.doi,
  }))

  // Batch search DOIs
  const doiResults = await apiClient.batchSearchDois(
    research.humId,
    publications,
    research.firstReleaseDate,
    useCache,
    delayMs,
  )

  // Enrich publications with DOI results
  const enrichedPublications: EnrichedPublication[] = research.relatedPublication.map(pub => {
    const title = pub.title.en ?? pub.title.ja ?? ""
    const result = doiResults.get(title)

    if (result && result.doi) {
      return {
        ...pub,
        doi: result.doi,
      }
    }

    return pub
  })

  return {
    ...research,
    relatedPublication: enrichedPublications,
  }
}

// Batch Processing

/**
 * Result of batch enrichment
 */
export interface BatchEnrichResult {
  datasetsEnriched: number
  datasetsSkipped: number
  researchEnriched: number
  researchSkipped: number
  errors: string[]
}

/**
 * Check if dataset is already enriched
 */
export const isDatasetEnriched = (dataset: Dataset | EnrichedDataset): boolean => {
  return "originalMetadata" in dataset && dataset.originalMetadata !== undefined
}

/**
 * Check if research needs DOI enrichment
 */
export const researchNeedsDoi = (research: Research): boolean => {
  return research.relatedPublication.some(
    pub => pub.doi === undefined || pub.doi === null,
  )
}
