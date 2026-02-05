/**
 * Research Version Elasticsearch schema definition
 *
 * Single source of truth: Zod schemas from @/crawler/types
 * ES mapping is generated using explicit field definitions.
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
 *
 * Note: While researchVersionSchema is defined using the f helper functions,
 * the Zod schemas in @/crawler/types serve as the TypeScript type source.
 */
export const researchVersionMapping = generateMapping(researchVersionSchema)
