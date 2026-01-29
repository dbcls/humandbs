/**
 * Research Elasticsearch schema definition
 *
 * Corresponds to Research type from crawler/types/unified.ts
 */
import { f, generateMapping } from "./generate-mapping"

/**
 * Research schema definition
 */
export const researchSchema = {
  // Identifiers
  humId: f.keyword(),

  // URLs
  url: f.bilingualKeyword(),

  // Title with full-text search and exact match
  title: f.bilingualTextKw(),

  // Version references
  versionIds: f.keyword(),
  latestVersion: f.keyword(),

  // Timestamps
  firstReleaseDate: f.date(),
  lastReleaseDate: f.date(),

  // Summary section
  summary: f.object({
    aims: f.bilingualTextValue(),
    methods: f.bilingualTextValue(),
    targets: f.bilingualTextValue(),

    // URLs with text and URL fields
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
  }),

  // Data provider (nested for independent querying)
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

  // Research project (nested)
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

  // Grant information (nested)
  grant: f.nested({
    id: f.keyword(),
    title: f.bilingualTextKw(),
    agency: f.object({
      name: f.bilingualTextKw(),
    }),
  }),

  // Related publications (nested)
  relatedPublication: f.nested({
    title: f.bilingualTextKw(),
    doi: f.keyword(),
    datasetIds: f.keyword(),
  }),

  // Controlled access users (nested)
  controlledAccessUser: f.nested({
    name: f.bilingualTextValueKw(),
    organization: f.object({
      name: f.bilingualTextValueKw(),
      address: f.object({
        country: f.keyword(),
      }),
    }),
    datasetIds: f.keyword(),
    researchTitle: f.bilingualTextKw(),
    periodOfDataUse: f.object({
      startDate: f.keyword(),
      endDate: f.keyword(),
    }),
  }),
}

/**
 * Generated mapping for research index
 */
export const researchMapping = generateMapping(researchSchema)
