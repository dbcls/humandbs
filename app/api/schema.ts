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
}).meta({ id: "Text" })

export const linkSchema = z.object({
  url: z.string(),
  text: z.string(),
}).meta({ id: "Link" })

/**
 * Links whose two languages point at different resources. Unlike prose, these
 * keep their destination: a machine-usable reference is a typed slot rather than
 * something buried in a sentence.
 */
export const linksSchema = z.object({
  ja: z.array(linkSchema).nullable().optional(),
  en: z.array(linkSchema).nullable().optional(),
}).meta({ id: "Links" })

/** A vocabulary value. The code is the spelling an address uses to filter by it. */
export const termSchema = z.object({
  code: z.string(),
  label: textSchema,
}).meta({ id: "Term" })

/** A number in the key's canonical unit. What was typed to get there is editing. */
export const numberValueSchema = z.object({
  value: z.number(),
  unit: z.string().nullable(),
}).meta({ id: "NumberValue" })

const valueHead = { key: z.string(), label: textSchema }

/** A value under a catalog key. The type says which of the payloads is present. */
export const valueSchema = z.discriminatedUnion("type", [
  z.object({ ...valueHead, type: z.literal("text"), text: textSchema }),
  z.object({ ...valueHead, type: z.literal("single"), value: z.string().nullable() }),
  z.object({ ...valueHead, type: z.literal("accession"), value: z.string().nullable() }),
  z.object({ ...valueHead, type: z.literal("vocabulary"), terms: z.array(termSchema).nullable() }),
  z.object({ ...valueHead, type: z.literal("number"), number: numberValueSchema.nullable() }),
]).meta({ id: "Value" })

export const fileSchema = z.object({
  name: z.string(),
  size: z.number().int(),
  url: z.string(),
}).meta({ id: "File" })

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
  summaryShort: z.object({
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
    applicationId: z.string(),
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
}).meta({ id: "Research" })

export const experimentSchema = z.object({
  label: z.string().nullable().optional(),
  values: z.array(valueSchema),
}).meta({ id: "Experiment" })

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
}).meta({ id: "Dataset" })

function searchResultOf<T extends z.ZodType>(hit: T, id: string) {
  return z.object({
    total: z.number().int(),
    page: z.number().int(),
    pageCount: z.number().int(),
    query: z.string().meta({ description: "The query as the portal read it back out." }),
    hits: z.array(hit),
  }).meta({ id })
}

export const researchSearchSchema = searchResultOf(researchSchema, "ResearchSearchResult")
export const datasetSearchSchema = searchResultOf(datasetSchema, "DatasetSearchResult")

// --- dblink ---------------------------------------------------------------

export const accessionTypeSchema = z.enum(["humandbs", "jga-dataset", "jga-study"])
  .meta({ id: "AccessionType" })

export const xrefSchema = z.object({
  identifier: z.string(),
  type: accessionTypeSchema,
  url: z.string(),
}).meta({ id: "Xref" })

export const dbLinksSchema = z.object({
  identifier: z.string(),
  type: accessionTypeSchema,
  dbXrefs: z.array(xrefSchema).meta({
    description: "Related entries, by type then identifier. Empty when there are none.",
  }),
}).meta({ id: "DbLinks" })

export const dbLinkTypesSchema = z.object({
  types: z.array(accessionTypeSchema),
}).meta({ id: "DbLinkTypes" })

// --- errors ---------------------------------------------------------------

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
}).meta({ id: "Problem" })

export type ApiText = z.infer<typeof textSchema>
export type ApiLink = z.infer<typeof linkSchema>
export type ApiLinks = z.infer<typeof linksSchema>
export type ApiTerm = z.infer<typeof termSchema>
export type ApiNumber = z.infer<typeof numberValueSchema>
export type ApiValue = z.infer<typeof valueSchema>
export type ApiResearch = z.infer<typeof researchSchema>
export type ApiDataset = z.infer<typeof datasetSchema>
