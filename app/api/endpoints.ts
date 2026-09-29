/**
 * Every address the JSON API responds at, written down once.
 *
 * **The path appears here and nowhere else.** `app/routes.ts` registers what
 * this list contains and `./openapi.ts` documents what this list contains, so a route
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
  accessionTypeSchema,
  BUILT_IN_FIELD_CODES,
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
  /** The route module that responds to it. */
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
  /** Statuses other than 200. Each responds with a problem document. */
  problems: (404 | 422 | 503)[]
  /** What a status means on this endpoint, where the general sentence would mislead. */
  problemNotes?: Partial<Record<404 | 422 | 503, string>>
}

/**
 * Queries that appear in the document, and are therefore promised to be
 * readable. The e2e run puts each of them to a live instance, so an example
 * cannot go on showing something the grammar stopped allowing.
 */
export const QUERY_EXAMPLES = [
  "cancer",
  "\"lung cancer\"",
  "diabet*",
  "title:\"genome\" AND date_published:[2020-01-01 TO *]",
  "cancer NOT disease:C22",
  "(disease:C22 OR disease:C34) AND read-length:[100 TO *]",
  "id:hum00*",
] as const

/**
 * What `?q=` takes, written for whoever reads the document rather than for this
 * file. **The grammar is only written down here**: a caller that gets it wrong
 * gets a 422, and this is what it had to go on.
 */
const QUERY_DESCRIPTION = `
The query language, which is the one the site's own addresses use — a query written here works
in the browser and back.

A Lucene subset, spelled the way ddbj-search-api's db-portal spells it.

| written | means |
| --- | --- |
| \`word\` | free text: rows whose indexed text contains it anywhere, inside a longer word too (\`diabet\` finds diabetes). Case does not matter |
| \`word*\` | the same as \`word\`: free text already matches inside words, so a trailing \`*\` is dropped. \`*\` or \`?\` anywhere else is refused |
| \`two words\` | both, each anywhere (\`AND\`) |
| \`"two words"\` | the characters in that order, the space included. Quoting is also how a value holding a bracket, a colon or an operator word is written |
| \`-word\` \`+word\` | the sign is part of the word: \`-cancer\` finds "-cancer", so gene names such as \`HIF-1\` can be written as they are. Exclude with \`NOT\` |
| \`field:value\` | constrains to one field of \`GET /api/fields\`. Field names are case-sensitive; what a value means depends on the field's \`type\` (below) |
| \`field:[a TO b]\` | a range, both ends included, on a \`date\` or a \`number\` field. \`*\` is an end that is not there |
| \`id:value*\` \`id:value?\` | a prefix pattern, on \`id\` only: \`*\` any run, \`?\` one character. At least two characters before the first of them, all of \`A-Z a-z 0-9 _ . -\` |
| \`AND\` \`OR\` \`NOT\` | uppercase only; lowercase \`and\` \`or\` \`not\` are words. Two terms side by side mean \`AND\`, and \`AND\` binds tighter than \`OR\` |
| \`( )\` | grouping |

Boost, fuzzy and regular expressions are not part of it.

**A value by the field's \`type\`.** \`identifier\` (\`id\`): the whole label, case ignored — a hum label on
the research listing, a dataset id on the dataset listing. \`text\` (\`title\`): contained anywhere, like
free text, and a trailing \`*\` is dropped. \`date\`: a day, \`YYYY-MM-DD\`. \`number\`: a plain decimal,
in the field's \`unit\`. \`term\`: one of the field's \`values[].code\`, case ignored; a code the list does
not hold matches nothing (200, \`total\` 0) rather than being refused. A \`disease\` code is ICD-10, with or
without its point (\`E14.2\` is \`E142\`), and a three-character code also matches the codes under it.

**Dates on the research listing are the research's**: \`date_published\` is when its first version was
published and \`date_modified\` when its latest was, while \`datePublished\` in an answer is the date of
the version returned. On the dataset listing both are the dataset's own. Fields in \`q\` are snake_case;
the \`sort\` keys are camelCase and order by the same dates.

**JGA accessions** may be written with eleven digits, as JGA and DDBJ Search also write them:
\`JGAS00000000197\` is read as \`JGAS000197\`. A JGA study (\`JGAS\`) finds the datasets under it.

A query that cannot be read answers 422 with \`code\`, \`column\` (1-based) and \`token\`, and the
\`query\` of a 200 answer is the query as it was read, written back.

**\`GET /api/fields\` lists the fields**, and the values every \`term\` field takes. **Prose is not
addressable**: a row's indexed text holds the words of every free-text key but not which key they
came from, so they are reachable as \`word\` and not as \`key:word\`. **\`id\` is a research's hum
label on one listing and a dataset's own accession on the other**, so one query means two things
across the two.

Examples:

${QUERY_EXAMPLES.map((one) => `- \`${one}\``).join("\n")}
`.trim()

/**
 * Whether the answer carries the file listings. Every endpoint that answers a
 * research or a dataset takes it, so that the same object has the same shape
 * whichever way it was reached.
 */
const includeFiles = z.object({
  includeFiles: z.enum(["true", "false"]).optional().meta({
    description:
      "Whether to return `files`. Defaults to `false`, which leaves the key out rather than "
      + "answering an empty list: a research can hold over ten thousand files, one of them more "
      + "than 2 MB of answer. Anything but `true` or `false` is refused with 422.",
  }),
})

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
    description:
      "1-based. Twenty rows to a page, always: there is no page-size parameter, and `limit` or "
      + "`size` are ignored. The whole corpus is the bulk stream. A page past the last answers "
      + "an empty `hits`.",
  }),
}).extend(includeFiles.shape)

const INCLUDE_FILES_REFUSED = "`includeFiles` is neither `true` nor `false`."

const humId = z.object({
  humId: z.string().meta({
    description: "A hum label, `hum` and four digits. Case is ignored, and a superseded one resolves too.",
    example: "hum0001",
  }),
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
    description:
      "Each hit is the whole research at its latest published version. A research matches when "
      + "its own text or any of its published datasets does.",
    query: searchQuery,
    response: { mediaType: JSON_MEDIA, schema: researchSearchSchema, description: "Matches." },
    problems: [422, 503],
  },
  {
    path: "api/research.jsonl",
    file: "routes/api-research-bulk.ts",
    operationId: "bulkResearch",
    tag: "research",
    summary: "Every published research",
    description:
      "One research per line, at its latest published version, by hum label. It takes no query: "
      + "to stream part of the set, page through the search instead.",
    query: includeFiles,
    response: {
      mediaType: NDJSON_MEDIA,
      schema: researchSchema,
      description: "One research per line.",
    },
    problems: [422, 503],
    problemNotes: { 422: INCLUDE_FILES_REFUSED },
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
    query: includeFiles,
    response: { mediaType: JSON_MEDIA, schema: researchSchema, description: "The research." },
    problems: [404, 422],
    problemNotes: { 422: INCLUDE_FILES_REFUSED },
  },
  {
    path: "api/research/:humId/:version",
    file: "routes/api-research-version.ts",
    operationId: "getResearchVersion",
    tag: "research",
    summary: "One published version of a research",
    description:
      "A version that was never published, or has been withdrawn, returns 404 like a number that "
      + "was never issued. Every version that can be asked for is listed on the research.",
    params: humId.extend({
      version: z.string().regex(/^v[1-9][0-9]*$/).meta({
        description:
          "The version, written `v3` as in the page's URL. `3`, `v03` and `V3` are not versions and "
          + "answer 404.",
        example: "v1",
      }),
    }),
    query: includeFiles,
    response: { mediaType: JSON_MEDIA, schema: researchSchema, description: "The version." },
    problems: [404, 422],
    problemNotes: { 422: INCLUDE_FILES_REFUSED },
  },
  {
    path: "api/dataset",
    file: "routes/api-dataset-list.ts",
    operationId: "searchDatasets",
    tag: "dataset",
    summary: "Search published datasets",
    description:
      "Each hit is the whole dataset. The query is the one the research listing takes — the "
      + "search rows of a research include the values of its datasets, so a query can be moved "
      + "between the two listings and keeps its meaning.",
    query: searchQuery,
    response: { mediaType: JSON_MEDIA, schema: datasetSearchSchema, description: "Matches." },
    problems: [422, 503],
  },
  {
    path: "api/dataset.jsonl",
    file: "routes/api-dataset-bulk.ts",
    operationId: "bulkDatasets",
    tag: "dataset",
    summary: "Every published dataset",
    description:
      "One dataset per line, by dataset id. It takes no query: to stream part of the set, page "
      + "through the search instead.",
    query: includeFiles,
    response: {
      mediaType: NDJSON_MEDIA,
      schema: datasetSchema,
      description: "One dataset per line.",
    },
    problems: [422, 503],
    problemNotes: { 422: INCLUDE_FILES_REFUSED },
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
      datasetId: z.string().meta({
        description:
          "A dataset id: a JGA dataset (`JGAD000001`), an archive's accession (`DRA000908`, "
          + "`E-GEAD-1107`, `MTBKS1`) or one the portal issued (`NHA000001`). Case is ignored, and a "
          + "superseded one resolves too.",
        example: "JGAD000001",
      }),
    }),
    query: includeFiles,
    response: { mediaType: JSON_MEDIA, schema: datasetSchema, description: "The dataset." },
    problems: [404, 422],
    problemNotes: { 422: INCLUDE_FILES_REFUSED },
  },
  {
    path: "api/fields",
    file: "routes/api-fields.ts",
    operationId: "listSearchFields",
    tag: "search",
    summary: "The fields a query may name, and the values they take",
    description:
      "Everything `?q=` can be written against, and nothing else is: a name not listed here "
      + "answers 422 `unknown-field`. A `term` field lists the values the published set has, so a "
      + "value taken from here always matches something; a `number` field gives the unit its "
      + `values are stored in. The first ones (${BUILT_IN_FIELD_CODES}) are the search row's own; `
      + "`file-type` is the formats read off a dataset's files. "
      + "**Not every key in an answer is a field**: a number the portal does not filter by "
      + "(`coverage-depth` and the like) and every free-text key are reached through free text only.",
    response: {
      mediaType: JSON_MEDIA,
      schema: searchFieldsSchema,
      description: "The fields.",
    },
    problems: [503],
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
    params: z.object({ type: accessionTypeSchema }),
    response: {
      mediaType: NDJSON_MEDIA,
      schema: dbLinksSchema,
      description: "One subject per line.",
    },
    problems: [422],
    problemNotes: { 422: "The type is not one of `GET /api/dblink`." },
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
      type: accessionTypeSchema,
      id: z.string().meta({
        description:
          "The accession, as that side writes it: `JGAS000001` for `jga-study`, `JGAD000001` for "
          + "`jga-dataset`, `hum0001` for `humandbs`. Matched as written, case included — "
          + "`jgas000001` answers the empty list.",
        example: "JGAS000001",
      }),
    }),
    response: { mediaType: JSON_MEDIA, schema: dbLinksSchema, description: "The links." },
    problems: [422],
    problemNotes: { 422: "The type is not one of `GET /api/dblink`." },
  },
]

/** The document describes itself; it is not in the list it is generated from. */
export const OPENAPI_PATH = "api/openapi.json"
export const OPENAPI_FILE = "routes/api-openapi.ts"

/** Where the document is drawn (`./docs.ts`). A page, so it responds with HTML. */
export const DOCS_PATH = "api/docs"
export const DOCS_FILE = "routes/api-docs.ts"
