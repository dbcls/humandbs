/**
 * External API response type definitions
 */
import type { Dataset, Research, Publication } from "./unified"

/** Publication with DOI enrichment */
export interface EnrichedPublication extends Publication {
  doi?: string | null
}

/** Dataset enriched with external API metadata */
export interface EnrichedDataset extends Dataset {
  originalMetadata?: Record<string, unknown> | null
}

/** Research enriched with DOI information */
export interface EnrichedResearch extends Omit<Research, "relatedPublication"> {
  relatedPublication: EnrichedPublication[]
}
