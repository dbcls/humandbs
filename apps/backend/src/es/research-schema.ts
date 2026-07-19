/**
 * Research Elasticsearch schema definition
 *
 * Single source of truth: Zod schemas from @/crawler/types
 * ES mapping is generated using explicit field definitions.
 */
import { CATCH_ALL_FIELD as C, f, generateMapping } from "./generate-mapping"

/**
 * Research schema definition
 *
 * Natural-language text fields carry `copy_to: all_text` so that free-word
 * search hits the whole document (including nested fields) via a single
 * `match` on `all_text`. ID / URL / date fields are intentionally excluded —
 * IDs are served by dedicated term/prefix clauses.
 */
export const researchSchema = {
  // Identifiers
  humId: f.keyword(),

  // Catch-all full-text field (copy_to target; not present in _source)
  all_text: f.text(),

  // URLs
  url: f.bilingualKeyword(),

  // Title with full-text search and exact match
  title: f.bilingualTextKw(C),

  // Version references
  versionIds: f.keyword(),
  latestVersion: f.keyword(),

  // Timestamps
  datePublished: f.date(),
  dateModified: f.date(),

  // Status and draft tracking
  status: f.keyword(),
  draftVersion: f.keyword(),

  // Short bilingual summaries for the listing view. Deliberately excluded from
  // `all_text` (no `C` argument) — display-only, not part of full-text search.
  summaryShort: f.object({
    methods: f.bilingualTextValue(),
    typeOfData: f.bilingualTextValue(),
    targets: f.bilingualTextValue(),
  }),

  // Summary section
  summary: f.object({
    aims: f.bilingualTextValue(C),
    methods: f.bilingualTextValue(C),
    targets: f.bilingualTextValue(C),

    // URLs with text and URL fields
    url: f.object({
      ja: f.nested({
        url: f.keyword(),
        text: f.textKw(C),
      }),
      en: f.nested({
        url: f.keyword(),
        text: f.textKw(C),
      }),
    }),

  }),

  // Data provider (nested for independent querying)
  dataProvider: f.nested({
    name: f.bilingualTextValueKw(C),
    email: f.keyword(),
    orcid: f.keyword(),
    organization: f.object({
      name: f.bilingualTextValueKw(C),
      address: f.object({
        country: f.keyword(),
      }),
    }),
    datasetIds: f.keyword(),
    researchTitle: f.bilingualText(C),
    periodOfDataUse: f.object({
      startDate: f.keyword(),
      endDate: f.keyword(),
    }),
  }),

  // Research project (nested)
  researchProject: f.nested({
    name: f.bilingualTextValueKw(C),
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

  // Grant information (nested)
  grant: f.nested({
    id: f.keyword(),
    title: f.bilingualTextKw(C),
    agency: f.object({
      name: f.bilingualTextKw(C),
    }),
  }),

  // Related publications (nested)
  relatedPublication: f.nested({
    title: f.bilingualTextKw(C),
    doi: f.keyword(),
    datasetIds: f.keyword(),
  }),

  // Controlled access users (nested)
  controlledAccessUser: f.nested({
    name: f.bilingualTextValueKw(C),
    organization: f.object({
      name: f.bilingualTextValueKw(C),
      address: f.object({
        country: f.keyword(),
      }),
    }),
    datasetIds: f.keyword(),
    researchTitle: f.bilingualTextKw(C),
    periodOfDataUse: f.object({
      startDate: f.keyword(),
      endDate: f.keyword(),
    }),
  }),
}

/**
 * Generated mapping for research index
 *
 * Note: While researchSchema is defined using the f helper functions,
 * the Zod schemas in @/crawler/types serve as the TypeScript type source.
 * ES-specific fields (status, uids) are added here for workflow support.
 */
export const researchMapping = generateMapping(researchSchema)
