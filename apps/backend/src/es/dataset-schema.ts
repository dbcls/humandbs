/**
 * Dataset Elasticsearch schema definition
 *
 * Single source of truth: Zod schemas from @/crawler/types
 * ES mapping is generated using explicit field definitions.
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

    // Searchable fields (LLM-extracted + rule-based)
    searchable: f.object({
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

      // Demographics
      sex: f.keyword(),
      ageGroup: f.keyword(),

      // Experimental method
      assayType: f.keyword(),
      libraryKits: f.keyword(),

      // Platform (nested for vendor/model relationship)
      // Facet aggregation is done via nested aggregation in API
      platforms: f.nested({
        vendor: f.keyword(),
        model: f.keyword(),
      }),
      readType: f.keyword(),
      readLength: f.integer(),

      // Sequencing quality
      sequencingDepth: f.float(),
      targetCoverage: f.float(),
      referenceGenome: f.keyword(),

      // Variant data
      variantCounts: f.object({
        snv: f.long(),
        indel: f.long(),
        cnv: f.long(),
        sv: f.long(),
        total: f.long(),
      }),
      hasPhenotypeData: f.boolean(),

      // Target region (free text with keyword for sorting)
      targets: f.textKw(),

      // Data info
      fileTypes: f.keyword(),
      processedDataTypes: f.keyword(),
      dataVolumeGb: f.float(),

      // Policies (nested for id/name relationship)
      policies: f.nested({
        id: f.keyword(),
        name: f.bilingualKeyword(),
        url: f.keyword(),
      }),
    }),
  }),

  // Original metadata from external sources (stored but not indexed)
  originalMetadata: f.disabled(),
}

/**
 * Generated mapping for dataset index
 *
 * Note: While datasetSchema is defined using the f helper functions,
 * the Zod schemas in @/crawler/types serve as the TypeScript type source.
 * This explicit mapping approach gives full control over ES field types.
 */
export const datasetMapping = generateMapping(datasetSchema)
