/**
 * Dataset Elasticsearch schema definition
 *
 * Corresponds to RefinedDataset type from crawler/types/extracted.ts
 */
import { f, generateMapping } from "./generate-mapping"

/**
 * Dataset schema definition
 */
export const datasetSchema = {
  // Identifiers
  datasetId: f.keyword(),
  version: f.keyword(),
  humId: f.keyword(),
  humVersionId: f.keyword(),

  // Dates
  versionReleaseDate: f.date(),
  releaseDate: f.date(),

  // Classification
  criteria: f.keyword(),
  typeOfData: f.bilingualKeyword(),

  // Experiments (nested for independent querying)
  experiments: f.nested({
    experimentKey: f.keyword(),

    // Header with bilingual text+rawHtml
    header: f.bilingualTextValueKw(),

    // Dynamic key-value data
    data: f.flattened(),

    // Footers (text only, rawHtml stored but not indexed)
    footers: f.object({
      ja: f.object({
        text: f.text(),
        rawHtml: f.noindex(),
      }),
      en: f.object({
        text: f.text(),
        rawHtml: f.noindex(),
      }),
    }),

    // Refined fields (LLM-extracted + rule-based)
    refined: f.object({
      // Subject/sample info
      subjectCount: f.integer(),
      subjectCountType: f.keyword(),
      healthStatus: f.keyword(),

      // Disease info (nested for label/icd10 relationship)
      diseases: f.nested({
        label: f.keyword(),
        icd10: f.keyword(),
      }),

      // Biological sample info
      tissues: f.keyword(),
      isTumor: f.boolean(),
      cellLine: f.keyword(),
      population: f.keyword(),

      // Experimental method
      assayType: f.keyword(),
      libraryKits: f.keyword(),

      // Platform
      platformVendor: f.keyword(),
      platformModel: f.keyword(),
      readType: f.keyword(),
      readLength: f.integer(),

      // Target region (free text)
      targets: f.text(),

      // Data info
      fileTypes: f.keyword(),
      dataVolumeBytes: f.long(),

      // Policies (nested for id/name relationship)
      policies: f.nested({
        id: f.keyword(),
        name: f.bilingualKeyword(),
        url: f.keyword(),
      }),
    }),
  }),
}

/**
 * Generated mapping for dataset index
 */
export const datasetMapping = generateMapping(datasetSchema)
