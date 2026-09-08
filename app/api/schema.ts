/**
 * The shape of every answer, written once.
 *
 * These schemas are both the types the projection is built against and the
 * source the OpenAPI document is generated from, so what the document promises
 * and what the code produces cannot be two different things. Nothing validates
 * an answer at run time — the projection is total and the compiler checks it
 * against these; validating output would only be a second opinion about the
 * same function.
 *
 * The conventions the shapes encode, in one place:
 *
 * - **an optional key is a value that is not there.** Empty and unsettled both
 *   arrive as nothing, and both leave the key out
 * - **`null` means "known not to exist".** It is the only value state that
 *   survives, because it is the only one that says something
 * - **an array is always present.** A reader can take its length without
 *   checking for the key first
 */

import { z } from "zod"

const dateString = z.string().meta({ description: "A calendar day, `YYYY-MM-DD`, cut in JST." })

/**
 * A value per language. A language with nothing to say is absent; a language
 * whose value is known not to exist is `null`. Both languages are always
 * offered — the API has no locale, and falling one back onto the other would
 * present a value as a translation that nobody said was one.
 */
export const textSchema = z.object({
  ja: z.string().nullable().optional(),
  en: z.string().nullable().optional(),
}).meta({
  id: "Text",
  description:
    "A value in both languages. A language with nothing to say is absent; `null` is a language "
    + "whose value is known not to exist. Neither falls back on the other.",
})

export const linkSchema = z.object({
  url: z.string(),
  text: z.string(),
}).meta({ id: "Link", description: "A destination and the words that stand for it." })

/**
 * Links whose two languages point at different resources. Unlike prose, these
 * keep their destination: a machine-usable reference is a typed slot rather than
 * something buried in a sentence.
 */
export const linksSchema = z.object({
  ja: z.array(linkSchema).nullable().optional(),
  en: z.array(linkSchema).nullable().optional(),
}).meta({
  id: "Links",
  description:
    "Links whose two languages point at different resources. Unlike prose, these keep their "
    + "destination: a reference a machine can use is a field of its own rather than something "
    + "written inside a sentence.",
})

/** A vocabulary value. The code is the spelling an address uses to filter by it. */
export const termSchema = z.object({
  code: z.string(),
  label: textSchema,
}).meta({
  id: "Term",
  description:
    "A vocabulary value. `code` is the spelling a query names it by, so a value found here can "
    + "be written straight into `?q=`.",
})

/**
 * A disease: **what classifications call it, and what the article called it.**
 * `terms` may be empty — a disease no classification names is an ordinary
 * value, so a code cannot be assumed to be there.
 */
export const diseaseSchema = z.object({
  terms: z.array(termSchema),
  name: textSchema,
}).meta({
  id: "Disease",
  description:
    "What classifications call it, and what the research called it. **`terms` may be empty** — a "
    + "disease no classification names is an ordinary value, so a code cannot be assumed to be "
    + "there.",
})

/**
 * A number in the key's canonical unit. What was typed to get there is editing.
 *
 * `label` says which number this is where a key holds several — the part of the
 * genome counted, the data product measured — and `note` carries what qualifies
 * it without being part of it. Both are absent when the value does not have one,
 * so the common case is the same two fields it has always been.
 */
export const numberValueSchema = z.object({
  value: z.number(),
  unit: z.string().nullable(),
  label: z.string().optional(),
  note: z.string().optional(),
}).meta({
  id: "NumberValue",
  description:
    "A number in the key's canonical unit, which is the unit `/api/fields` gives for that field "
    + "and not necessarily the one it was entered in. `label` says which number this is where a "
    + "key holds several; `note` carries what qualifies it without being part of it. Both are "
    + "absent when there is none.",
})

const valueHead = { key: z.string(), label: textSchema }

/** A value under a catalog key. The type says which of the payloads is present. */
export const valueSchema = z.discriminatedUnion("type", [
  z.object({ ...valueHead, type: z.literal("text"), text: textSchema }),
  z.object({ ...valueHead, type: z.literal("single"), value: z.string().nullable() }),
  z.object({ ...valueHead, type: z.literal("accession"), value: z.string().nullable() }),
  z.object({ ...valueHead, type: z.literal("vocabulary"), terms: z.array(termSchema).nullable() }),
  z.object({ ...valueHead, type: z.literal("number"), numbers: z.array(numberValueSchema).nullable() }),
  z.object({
    ...valueHead,
    type: z.literal("disease"),
    diseases: z.array(diseaseSchema).nullable(),
  }),
]).meta({
  id: "Value",
  description:
    "A value under a catalog key. `type` says which of the payloads is present, and `key` is the "
    + "code `/api/fields` lists it under. **Not every key a query may name appears here** — see "
    + "`inAnswers` on that endpoint.",
})

export const fileSchema = z.object({
  name: z.string(),
  size: z.number().int(),
  url: z.string(),
}).meta({
  id: "File",
  description:
    "A file as the store lists it. **The address is not promised**: its form is kept, but a file "
    + "carries a published state of its own that an administrator can turn off.",
})

export const researchSchema = z.object({
  id: z.string().meta({ description: "The hum label." }),
  version: z.number().int(),
  url: z.string(),
  datePublished: dateString.meta({ description: "When this version was released." }),
  versions: z.array(z.object({
    version: z.number().int(),
    datePublished: dateString,
  })).meta({ description: "Every published version. The newest is when the research last changed." }),
  title: textSchema.optional(),
  summary: z.object({
    aims: textSchema.optional(),
    methods: textSchema.optional(),
    targets: textSchema.optional(),
    url: linksSchema.optional(),
  }),
  listingSummary: z.object({
    methods: textSchema.optional(),
    targets: textSchema.optional(),
    typeOfData: textSchema.optional(),
  }),
  releaseNote: textSchema.optional(),
  dataProviders: z.array(z.object({
    name: textSchema.optional(),
    organization: z.object({
      name: textSchema.optional(),
      address: textSchema.optional(),
    }),
    orcid: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
  })),
  researchProjects: z.array(z.object({
    name: textSchema.optional(),
    url: linksSchema.optional(),
  })),
  grants: z.array(z.object({
    title: textSchema.optional(),
    agency: textSchema.optional(),
    grantIds: z.array(z.string()),
  })),
  relatedPublications: z.array(z.object({
    title: z.string().nullable().optional(),
    doi: z.string().nullable().optional(),
    datasets: z.array(z.string()),
  })),
  datasets: z.array(z.string()).meta({
    description: "Dataset ids this version lists. Only published ones appear.",
  }),
  controlledAccessUsers: z.array(z.object({
    principalInvestigator: textSchema,
    affiliation: textSchema,
    country: z.string(),
    researchTitle: textSchema,
    periodStart: dateString.nullable(),
    periodEnd: dateString.nullable(),
    datasets: z.array(z.string()),
  })),
  files: z.array(fileSchema).meta({
    description: "The research's public box, as the store lists it.",
  }),
}).meta({
  id: "Research",
  description:
    "A study, at one of its published versions. **It has no date of its own** — `versions` holds "
    + "every published one, and the last of them is when the research last changed. Its datasets "
    + "appear as ids: each has an address of its own, and one research can hold hundreds.",
})

export const experimentSchema = z.object({
  label: z.string().nullable().optional(),
  values: z.array(valueSchema),
}).meta({
  id: "Experiment",
  description:
    "One run within a dataset. It has no address and no identifier of its own: it is part of how "
    + "the dataset describes itself.",
})

export const datasetSchema = z.object({
  id: z.string().meta({ description: "The dataset id." }),
  research: z.string().meta({ description: "The hum label of the research it belongs to." }),
  url: z.string(),
  datePublished: dateString.nullable(),
  dateModified: dateString.nullable(),
  values: z.array(valueSchema),
  experiments: z.array(experimentSchema),
  files: z.array(fileSchema).meta({
    description: "The files this dataset points at, kept to what the box lists.",
  }),
}).meta({
  id: "Dataset",
  description:
    "One body of data, belonging to exactly one research. Its dates come from the archive that "
    + "holds it where the portal has none of its own.",
})

function searchResultOf<T extends z.ZodType>(hit: T, id: string, description: string) {
  return z.object({
    total: z.number().int(),
    page: z.number().int(),
    pageCount: z.number().int(),
    query: z.string().meta({
      description:
        "The query as the portal read it back out. A query that means the same thing written "
        + "two ways comes back the one way, which is what makes two searches comparable.",
    }),
    hits: z.array(hit).meta({
      description: "Twenty to a page. Each is the whole object, not a summary of it.",
    }),
  }).meta({ id, description })
}

const SEARCH_RESULT = "One page of a search. `total` counts the whole match, `pageCount` the "
  + "pages it comes in; the whole published set is the bulk stream instead."

export const researchSearchSchema
  = searchResultOf(researchSchema, "ResearchSearchResult", SEARCH_RESULT)
export const datasetSearchSchema
  = searchResultOf(datasetSchema, "DatasetSearchResult", SEARCH_RESULT)

// --- fields ---------------------------------------------------------------

/**
 * A field a query may name.
 *
 * **`type` is what the query language makes of it**, which is what decides
 * the forms a value may take: `identifier` and `text` accept a wildcard,
 * `date` and `number` a range, `term` neither — its values are codes out of a
 * closed set, so there is nothing to walk towards and nothing between two of
 * them.
 *
 * `values` is present on a `term` field and lists what the published set
 * actually carries. `unit` is present on a `number` field, whose values are a
 * span rather than a list. The fields belonging to the search row itself carry
 * neither, and no label: they are named by the query language, not by the
 * catalog.
 */
export const searchFieldSchema = z.object({
  code: z.string().meta({ description: "How a query names the field." }),
  type: z.enum(["identifier", "text", "date", "term", "number"]),
  label: textSchema.optional().meta({ description: "The catalog's name for the key." }),
  unit: z.string().optional().meta({ description: "The unit the stored values are in." }),
  values: z.array(termSchema).optional().meta({
    description: "Every value the published set carries, at the level a query can name it.",
  }),
  inAnswers: z.boolean().meta({
    description:
      "Whether an answer carries this field's value. A field that does not can still be "
      + "filtered on — it is a question the catalog can be asked, not something an object "
      + "says about itself.",
  }),
}).meta({
  id: "SearchField",
  description:
    "A field a query may name. **`type` is what the query language makes of it**, which decides "
    + "the forms a value may take: `identifier` and `text` accept a wildcard, `date` and "
    + "`number` a range, `term` neither — its values are codes out of a closed set.",
})

export const searchFieldsSchema = z.object({
  fields: z.array(searchFieldSchema),
}).meta({
  id: "SearchFields",
  description: "Everything `?q=` can be written against, in the order the portal shows them.",
})

// --- dblink ---------------------------------------------------------------

export const accessionTypeSchema = z.enum(["humandbs", "jga-dataset", "jga-study"])
  .meta({
    id: "AccessionType",
    description: "Which side of the correspondence an identifier is from.",
  })

export const xrefSchema = z.object({
  identifier: z.string(),
  type: accessionTypeSchema,
  url: z.string(),
}).meta({
  id: "Xref",
  description: "An entry on the other side of a correspondence, and where it can be read.",
})

export const dbLinksSchema = z.object({
  identifier: z.string(),
  type: accessionTypeSchema,
  dbXrefs: z.array(xrefSchema).meta({
    description: "Related entries, by type then identifier. Empty when there are none.",
  }),
}).meta({
  id: "DbLinks",
  description:
    "What one accession is linked to. **Only researches the portal has published take part**, so "
    + "an accession whose research is unpublished answers the same as one nobody has heard of: "
    + "200 with an empty list.",
})

export const dbLinkTypesSchema = z.object({
  types: z.array(accessionTypeSchema),
}).meta({
  id: "DbLinkTypes",
  description: "The accession types `/api/dblink/{type}` answers for.",
})

// --- errors ---------------------------------------------------------------

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
}).meta({
  id: "Problem",
  description:
    "RFC 7807 problem details. **A 404 says nothing about what was asked for**: the sentence is "
    + "fixed per kind of object and never repeats the label, because an unpublished object and "
    + "one that never existed are not told apart.",
})

export type ApiText = z.infer<typeof textSchema>
export type ApiLink = z.infer<typeof linkSchema>
export type ApiLinks = z.infer<typeof linksSchema>
export type ApiTerm = z.infer<typeof termSchema>
export type ApiNumber = z.infer<typeof numberValueSchema>
export type ApiDisease = z.infer<typeof diseaseSchema>
export type ApiValue = z.infer<typeof valueSchema>
export type ApiSearchField = z.infer<typeof searchFieldSchema>
export type ApiResearch = z.infer<typeof researchSchema>
export type ApiDataset = z.infer<typeof datasetSchema>
