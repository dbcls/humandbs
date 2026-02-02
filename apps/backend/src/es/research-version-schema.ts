/**
 * Research Version Elasticsearch schema definition
 *
 * Corresponds to ResearchVersion type from crawler/types/unified.ts
 */
import { f, generateMapping } from "./generate-mapping"

/**
 * ResearchVersion schema definition
 */
export const researchVersionSchema = {
  // Identifiers
  humId: f.keyword(),
  humVersionId: f.keyword(),
  version: f.keyword(),

  // Dates
  versionReleaseDate: f.date(),

  // Dataset references
  datasetIds: f.keyword(),

  // Release note with bilingual text+rawHtml
  releaseNote: f.bilingualTextValue(),
}

/**
 * Generated mapping for research-version index
 */
export const researchVersionMapping = generateMapping(researchVersionSchema)
