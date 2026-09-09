/**
 * Every address the JSON API answers at, written down once.
 *
 * **The path appears here and nowhere else.** `app/routes.ts` registers what
 * this list says and `./openapi.ts` documents what this list says, so a route
 * and its entry in the document cannot describe different addresses. React
 * Router spells a parameter `:name` and OpenAPI spells it `{name}`; that is a
 * mechanical difference and the generator makes it.
 *
 * Only `GET` appears. Everything the API does is reading, and a reader that
 * never sends a custom header never provokes a preflight, so no method other
 * than the one being answered has to be handled.
 */

import { z } from "zod"

import { SORT_KEYS, SORT_ORDERS } from "../search/sort"

import {
  datasetSchema,
  datasetSearchSchema,
  dbLinkTypesSchema,
  dbLinksSchema,
  researchSchema,
  researchSearchSchema,
  searchFieldsSchema,
} from "./schema"

/** What the document calls a group of operations. */
export type ApiTag = "research" | "dataset" | "search" | "dblink" | "meta"

export interface ApiEndpoint {
  /** As React Router registers it, without a leading slash. */
  path: string
  /** The route module that answers it. */
  file: string
  operationId: string
  tag: ApiTag
  summary: string
  description?: string
  params?: z.ZodObject
  query?: z.ZodObject
  response: {
    mediaType: string
    /** For a stream, the schema of one line rather than of the whole body. */
    schema: z.ZodType
    description: string
  }
  /** Statuses other than 200. Each answers with a problem document. */
  problems: (404 | 422)[]
}

/**
 * Queries that appear in the document, and are therefore promised to be
 * readable. `app/api/pages.db.test.ts` puts each of them through the parser, so
 * an example cannot go on saying something the grammar stopped allowing.
 */
/**
 * Queries that appear in the document, and are therefore promised to be
 * readable. The e2e run puts each of them to a live instance, so an example
 * cannot go on saying something the grammar stopped allowing.
 */
export const QUERY_EXAMPLES = [
  "cancer",
  "title:\"genome\" AND date_published:[2020-01-01 TO *]",
  "cancer NOT disease:C22",
  "(disease:C22 OR disease:C34) AND read-length:[100 TO *]",
  "id:hum00*",
] as const

/**
 * What `?q=` takes, written for whoever reads the document rather than for this
 * file. **The grammar is only written down here**: a caller that gets it wrong
 * is answered with a 422, and this is what it had to go on.
 */
const QUERY_DESCRIPTION = `
The query language, which is the one the site's own addresses carry — a query written here works
in the browser and back.

A Lucene subset, spelled the way ddbj-search-api's db-portal spells it.

| written | means |
| --- | --- |
| \`word\` | free text. Matches anywhere in a row's indexed text |
| \`"two words"\` | quoting is how a value holding a space or a bracket is written down; the characters match the same either way |
| \`field:value\` | constrains to one field |
| \`field:[a TO b]\` | a range, on a \`date\` or a \`number\` field. \`*\` is an end that is not there |
| \`value*\` | a wildcard, on an \`identifier\` or a \`text\` field. A bare \`*\` is refused |
| \`AND\` \`OR\` \`NOT\` | uppercase only. Two terms side by side mean \`AND\` |
| \`( )\` | grouping |

Boost, fuzzy and regular expressions are not part of it.

**\`GET /api/fields\` lists the fields**, and the values every \`term\` field takes. **Prose is not
addressable**: a row's indexed text holds the words of every free-text key but not which key they
came from, so they are reachable as \`word\` and not as \`key:word\`. **\`id\` is a research's hum
label on one listing and a dataset's own accession on the other**, so one query means two things
across the two.

Examples:

${QUERY_EXAMPLES.map((one) => `- \`${one}\``).join("\n")}
`.trim()

const searchQuery = z.object({
  q: z.string().optional().meta({ description: QUERY_DESCRIPTION }),
  sort: z.enum(SORT_KEYS).optional().meta({
    description: "Which key the results are ordered by. Defaults to `dateModified`.",
  }),
  order: z.enum(SORT_ORDERS).optional().meta({
    description:
      "Which way that key runs. Defaults to `desc` for a date and `asc` for `id`, so a "
      + "listing opens on what changed last and identifiers read in the order they were issued.",
  }),
  page: z.coerce.number().int().min(1).optional().meta({
    description: "1-based. Twenty rows to a page; the whole corpus is the bulk stream.",
  }),
})

const humId = z.object({
  humId: z.string().meta({ description: "A hum label. A superseded one resolves too." }),
})

const JSON_MEDIA = "application/json"
const NDJSON_MEDIA = "application/x-ndjson"

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    path: "api/research",
    file: "routes/api-research-list.ts",
    operationId: "searchResearch",
    tag: "research",
    summary: "Search published researches",
    description: "Each hit is the whole research at its latest published version.",
    query: searchQuery,
    response: { mediaType: JSON_MEDIA, schema: researchSearchSchema, description: "Matches." },
    problems: [422],
  },
  {
    path: "api/research.jsonl",
    file: "routes/api-research-bulk.ts",
    operationId: "bulkResearch",
    tag: "research",
    summary: "Every published research",
    description: "One research per line, at its latest published version, by hum label.",
    response: {
      mediaType: NDJSON_MEDIA,
      schema: researchSchema,
      description: "One research per line.",
    },
    problems: [],
  },
  {
    path: "api/research/:humId",
    file: "routes/api-research.ts",
    operationId: "getResearch",
    tag: "research",
    summary: "The latest published version of a research",
    description:
      "A hum label that has been superseded resolves too, and is answered rather than "
      + "redirected — the `id` and `url` of the answer name the label that is current now, so a "
      + "caller following a citation learns which one that is from the body.",
    params: humId,
    response: { mediaType: JSON_MEDIA, schema: researchSchema, description: "The research." },
    problems: [404],
  },
  {
    path: "api/research/:humId/:version",
    file: "routes/api-research-version.ts",
    operationId: "getResearchVersion",
    tag: "research",
    summary: "One published version of a research",
    description:
      "A version that was never published, or has been withdrawn, answers 404 like a number that "
      + "was never issued. Every version that can be asked for is listed on the research.",
    params: humId.extend({
      version: z.string().meta({ description: "The version, written `v3` as in the page's URL." }),
    }),
    response: { mediaType: JSON_MEDIA, schema: researchSchema, description: "The version." },
    problems: [404],
  },
  {
    path: "api/dataset",
    file: "routes/api-dataset-list.ts",
    operationId: "searchDatasets",
    tag: "dataset",
    summary: "Search published datasets",
    description:
      "Each hit is the whole dataset. The query is the one the research listing takes — the "
      + "search rows of a research carry the values of its datasets, so a query can be moved "
      + "between the two listings and keeps its meaning.",
    query: searchQuery,
    response: { mediaType: JSON_MEDIA, schema: datasetSearchSchema, description: "Matches." },
    problems: [422],
  },
  {
    path: "api/dataset.jsonl",
    file: "routes/api-dataset-bulk.ts",
    operationId: "bulkDatasets",
    tag: "dataset",
    summary: "Every published dataset",
    description: "One dataset per line, by dataset id.",
    response: {
      mediaType: NDJSON_MEDIA,
      schema: datasetSchema,
      description: "One dataset per line.",
    },
    problems: [],
  },
  {
    path: "api/dataset/:datasetId",
    file: "routes/api-dataset.ts",
    operationId: "getDataset",
    tag: "dataset",
    summary: "A published dataset",
    description:
      "A dataset id the portal issued and an accession it took from an archive are both answered "
      + "here. A superseded id resolves and is answered rather than redirected.",
    params: z.object({
      datasetId: z.string().meta({ description: "A dataset id. A superseded one resolves too." }),
    }),
    response: { mediaType: JSON_MEDIA, schema: datasetSchema, description: "The dataset." },
    problems: [404],
  },
  {
    path: "api/fields",
    file: "routes/api-fields.ts",
    operationId: "listSearchFields",
    tag: "search",
    summary: "The fields a query may name, and the values they take",
    description:
      "Everything `?q=` can be written against. A `term` field lists the values the published "
      + "set carries, so a value taken from here always matches something; a `number` field "
      + "gives the unit its values are stored in. The catalog is the list — a key typed as a "
      + "vocabulary, a number or a disease is a field, and no other key is.\n\n"
      + "**`inAnswers` says whether an object carries the field's value.** A field where it is "
      + "false can be filtered on all the same: it is a question the catalog can be asked, not "
      + "something an object says about itself.",
    response: {
      mediaType: JSON_MEDIA,
      schema: searchFieldsSchema,
      description: "The fields.",
    },
    problems: [],
  },
  {
    path: "api/dblink",
    file: "routes/api-dblink-types.ts",
    operationId: "listDbLinkTypes",
    tag: "dblink",
    summary: "The accession types the correspondence covers",
    description:
      "What may be written as `{type}` below. Anything else is refused rather than answered "
      + "empty, so a typo does not look like an accession nobody has heard of.",
    response: { mediaType: JSON_MEDIA, schema: dbLinkTypesSchema, description: "The types." },
    problems: [],
  },
  {
    path: "api/dblink/:type",
    file: "routes/api-dblink-listing.ts",
    operationId: "listDbLinks",
    tag: "dblink",
    summary: "The whole correspondence, from one side",
    description:
      "One subject per line. Only researches the portal has published take part, so an "
      + "accession whose research is not published is simply absent.",
    params: z.object({ type: z.string().meta({ description: "An accession type." }) }),
    response: {
      mediaType: NDJSON_MEDIA,
      schema: dbLinksSchema,
      description: "One subject per line.",
    },
    problems: [422],
  },
  {
    path: "api/dblink/:type/:id",
    file: "routes/api-dblink-entry.ts",
    operationId: "getDbLinks",
    tag: "dblink",
    summary: "What one accession is linked to",
    description:
      "An accession nobody has heard of and one whose research is not published answer the "
      + "same: 200 with an empty list.",
    params: z.object({
      type: z.string().meta({ description: "An accession type." }),
      id: z.string().meta({ description: "The accession." }),
    }),
    response: { mediaType: JSON_MEDIA, schema: dbLinksSchema, description: "The links." },
    problems: [422],
  },
]

/** The document describes itself; it is not in the list it is generated from. */
export const OPENAPI_PATH = "api/openapi.json"
export const OPENAPI_FILE = "routes/api-openapi.ts"

/** Where the document is drawn (`./docs.ts`). A page, so it answers with HTML. */
export const DOCS_PATH = "api/docs"
export const DOCS_FILE = "routes/api-docs.ts"
