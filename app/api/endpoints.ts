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

import { SORT_KEYS } from "../search/sort"

import {
  datasetSchema,
  datasetSearchSchema,
  dbLinkTypesSchema,
  dbLinksSchema,
  researchSchema,
  researchSearchSchema,
} from "./schema"

/** What the document calls a group of operations. */
export type ApiTag = "research" | "dataset" | "dblink" | "meta"

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

const searchQuery = z.object({
  q: z.string().optional().meta({
    description: "The query language, the same one the site's own addresses carry.",
  }),
  sort: z.enum(SORT_KEYS).optional().meta({
    description: "`relevance` needs a full-text term; without one it is not offered.",
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
    params: z.object({
      datasetId: z.string().meta({ description: "A dataset id. A superseded one resolves too." }),
    }),
    response: { mediaType: JSON_MEDIA, schema: datasetSchema, description: "The dataset." },
    problems: [404],
  },
  {
    path: "api/dblink",
    file: "routes/api-dblink-types.ts",
    operationId: "listDbLinkTypes",
    tag: "dblink",
    summary: "The accession types the correspondence covers",
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
