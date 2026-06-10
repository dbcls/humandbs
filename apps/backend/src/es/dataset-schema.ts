/**
 * Dataset Elasticsearch schema definition
 *
 * Single source of truth: Zod schemas from @/crawler/types
 * ES mapping is generated using explicit field definitions.
 */
import { CATCH_ALL_FIELD as C, f, generateMapping } from "./generate-mapping"

/**
 * Dataset schema definition
 *
 * Text fields and facet-value keywords carry `copy_to: all_text` so free-word
 * search hits the whole document via a single `match` on `all_text`.
 * Excluded from the catch-all: IDs / codes (datasetId, icd10, policy id),
 * numeric / boolean fields, and `experiments.data` (a `flattened` field, which
 * Elasticsearch does not allow as a `copy_to` source — see api-guide.md).
 */
export const datasetSchema = {
  // Identifiers
  datasetId: f.keyword(),
  version: f.keyword(),
  humId: f.keyword(),
  humVersionId: f.keyword(),

  // Catch-all full-text field (copy_to target; not present in _source)
  all_text: f.text(),

  // Dates
  versionReleaseDate: f.date(),
  releaseDate: f.date(),
  // Dataset-level last-modified date: the max versionReleaseDate across all
  // versions of this datasetId, denormalized onto every version doc so it is
  // version-invariant. `collapse` keeps one version per datasetId; a
  // version-invariant date lets the listing sort the same in both directions
  // (a version-variant field would order asc groups by the oldest version while
  // the listing displays the latest one). Mirrors Research's `dateModified`.
  dateModified: f.date(),

  // Classification
  criteria: f.keyword(C),
  typeOfData: f.bilingualTextKw(C),

  // Experiments (nested for independent querying)
  experiments: f.nested({
    // Header with bilingual text+rawHtml
    header: f.bilingualTextValueKw(C),

    // Dynamic key-value data (flattened cannot be a copy_to source)
    data: f.flattened(),

    // Searchable fields (LLM-extracted + rule-based)
    searchable: f.object({
      // Subject/sample info
      subjectCount: f.integer(),
      subjectCountType: f.keyword(C),
      healthStatus: f.keyword(C),

      // Disease info (nested for label/icd10 relationship)
      diseases: f.nested({
        label: f.keyword(C),
        icd10: f.keyword(),
      }),

      // Biological sample info
      tissues: f.keyword(C),
      isTumor: f.keyword(C),
      cellLine: f.keyword(C),
      population: f.keyword(C),
      cohorts: f.keyword(C),

      // Demographics
      sex: f.keyword(C),
      ageGroup: f.keyword(C),

      // Experimental method
      assayType: f.keyword(C),
      libraryKits: f.keyword(C),

      // Platform (nested for vendor/model relationship)
      // Facet aggregation is done via nested aggregation in API
      platforms: f.nested({
        vendor: f.keyword(C),
        model: f.keyword(C),
      }),
      readType: f.keyword(C),
      readLength: f.integer(),

      // Sequencing quality
      sequencingDepth: f.float(),
      targetCoverage: f.float(),
      referenceGenome: f.keyword(C),

      // Variant data
      variantCounts: f.object({
        snv: f.long(),
        indel: f.long(),
        cnv: f.long(),
        sv: f.long(),
        total: f.long(),
        autosomes: f.long(),
        chrX: f.long(),
      }),
      hasPhenotypeData: f.boolean(),

      // Target region (free text with keyword for sorting)
      targets: f.textKw(C),

      // Data info
      fileTypes: f.keyword(C),
      processedDataTypes: f.keyword(C),
      dataVolumeGb: f.float(),

      // Policies (nested for id/name relationship)
      policies: f.nested({
        id: f.keyword(),
        name: f.bilingualKeyword(C),
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
