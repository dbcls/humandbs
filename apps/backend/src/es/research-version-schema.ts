/**
 * Research Version Elasticsearch schema definition
 *
 * Single source of truth: Zod schemas from @/crawler/types
 * ES mapping is generated using explicit field definitions.
 */
import { f, generateMapping } from "./generate-mapping"

/**
 * ResearchVersion schema definition
 *
 * Per-version content snapshot fields (title / summary / dataProvider /
 * researchProject / grant / relatedPublication) mirror the same shapes on
 * `researchSchema` so an owner's draft edits land on the version doc and the
 * Research root retains the `latestVersion` snapshot. No `copy_to all_text`
 * on these fields: full-text search still runs on the Research root index
 * (which holds the public snapshot); reindexing search onto the RV index is
 * out of scope.
 */
export const researchVersionSchema = {
  // Identifiers
  humId: f.keyword(),
  humVersionId: f.keyword(),
  version: f.keyword(),

  // Dates
  versionReleaseDate: f.date(),

  // Dataset references (datasets field is stored in _source as Array<{datasetId, version}>
  // but not indexed — no current need to search/filter by dataset ID on ResearchVersion)

  // Release note with bilingual text+rawHtml
  releaseNote: f.bilingualTextValue(),

  // Per-version content snapshot
  title: f.bilingualTextKw(),
  summary: f.object({
    aims: f.bilingualTextValue(),
    methods: f.bilingualTextValue(),
    targets: f.bilingualTextValue(),
    url: f.object({
      ja: f.nested({
        url: f.keyword(),
        text: f.textKw(),
      }),
      en: f.nested({
        url: f.keyword(),
        text: f.textKw(),
      }),
    }),
  }),
  dataProvider: f.nested({
    name: f.bilingualTextValueKw(),
    email: f.keyword(),
    orcid: f.keyword(),
    organization: f.object({
      name: f.bilingualTextValueKw(),
      address: f.object({
        country: f.keyword(),
      }),
    }),
    datasetIds: f.keyword(),
    researchTitle: f.bilingualText(),
    periodOfDataUse: f.object({
      startDate: f.keyword(),
      endDate: f.keyword(),
    }),
  }),
  researchProject: f.nested({
    name: f.bilingualTextValueKw(),
    url: f.object({
      ja: f.object({
        text: f.keyword(),
        url: f.keyword(),
      }),
      en: f.object({
        text: f.keyword(),
        url: f.keyword(),
      }),
    }),
  }),
  grant: f.nested({
    id: f.keyword(),
    title: f.bilingualTextKw(),
    agency: f.object({
      name: f.bilingualTextKw(),
    }),
  }),
  relatedPublication: f.nested({
    title: f.bilingualTextKw(),
    doi: f.keyword(),
    datasetIds: f.keyword(),
  }),
}

/**
 * Generated mapping for research-version index
 *
 * Note: While researchVersionSchema is defined using the f helper functions,
 * the Zod schemas in @/crawler/types serve as the TypeScript type source.
 */
export const researchVersionMapping = generateMapping(researchVersionSchema)
