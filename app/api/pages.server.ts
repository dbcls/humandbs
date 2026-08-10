/**
 * What each endpoint of the JSON API answers.
 *
 * Every one of them ends at `apiResearch` or `apiDataset` (`./view.ts`), so a
 * single object, a search hit and a line of the bulk stream are the same thing
 * however they were reached.
 *
 * **A label that resolves through a secondary pin is answered, not redirected.**
 * The public pages redirect so that a page has one address; a machine following
 * a citation gains nothing from a second round trip, and the answer names the
 * primary label anyway, so the caller learns which one is current from the body.
 *
 * **A box that the store did not list is an empty box here.** The public page
 * drops its download section when the store is silent, but an answer whose
 * shape depended on whether an unrelated system replied would be worse than one
 * that says the listing is empty — and the listing is not what the API promises
 * to be complete (docs/public-api.md).
 */

import { loadConfig, publicOrigin } from "~/config.server"
import {
  publicDatasetContent,
  publicResearch,
  type CauUsage,
  type StoredFile,
} from "~/content/public"
import { getDb } from "~/db/client.server"
import { everyPublicBox, publicBoxesOf } from "~/files/listing.server"
import {
  loadCatalog,
  publishedDatasetLabels,
  publishedVersions,
  resolveDatasetLabel,
  resolveHumLabel,
} from "~/public/queries.server"
import { loadFacetDefinitions } from "~/search/catalog.server"
import { hasFreeText, parseQuery, serializeQuery } from "~/search/dsl"
import { queryFields } from "~/search/fields"
import { searchDocs, type SearchTarget, type SortKey } from "~/search/query.server"

import {
  ACCESSION_TYPES,
  isAccessionType,
  linksBySubject,
  linksOfSubject,
  type AccessionType,
} from "./dblink"
import { jsonResponse, ndjsonResponse, problemResponse } from "./http"
import { apiDocument } from "./openapi"
import {
  invalidParameter,
  invalidQuery,
  invalidSort,
  notFound,
  unknownAccessionType,
} from "./problem"
import {
  cauByHumLabel,
  datasetBundles,
  datasetLabels,
  publishedEdges,
  researchBundles,
  type DatasetBundle,
  type ResearchBundle,
} from "./queries.server"
import type { ApiDataset, ApiResearch } from "./schema"
import { apiDataset, apiResearch, type ApiContext } from "./view"

/** Nothing the API answers with keeps an unsettled value. */
const PUBLISHED = { keepUnsettled: false }

const SORT_KEYS: readonly SortKey[] = ["relevance", "dateModified", "datePublished", "id"]

function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value)
}

async function contextOf(): Promise<ApiContext> {
  return {
    origin: publicOrigin(loadConfig(process.env).auth),
    catalog: await loadCatalog(getDb()),
  }
}

// --- research -------------------------------------------------------------

/** Every dataset identity a research's content names, listed or merely cited. */
function citedDatasetIds(content: ResearchBundle["content"]): string[] {
  return [...new Set([
    ...content.datasetIds,
    ...content.relatedPublications.flatMap((publication) => publication.datasetIds),
  ])]
}

function researchObject(
  bundle: ResearchBundle,
  input: {
    context: ApiContext
    labels: ReadonlyMap<string, string>
    cau: ReadonlyMap<string, CauUsage[]>
    files: readonly StoredFile[]
  },
): ApiResearch {
  const projected = publicResearch(
    bundle.content,
    { cau: input.cau.get(bundle.humLabel) ?? [], files: input.files },
    PUBLISHED,
  )
  return apiResearch({
    humLabel: bundle.humLabel,
    versionNumber: bundle.versionNumber,
    releaseDate: bundle.releaseDate,
    versions: bundle.versions,
    content: projected.content,
    datasetLabelById: input.labels,
    cau: projected.cau,
    files: projected.files,
  }, input.context)
}

export async function researchEntry(
  request: Request,
  humId: string,
  wanted: number | "latest",
): Promise<Response> {
  const db = getDb()
  const resolved = await resolveHumLabel(db, humId)
  if (resolved === null) return problemResponse(notFound(request, "research"))

  const versions = await publishedVersions(db, resolved.id)
  const latest = versions.reduce<typeof versions[number] | null>(
    (best, one) => best === null || one.number > best.number ? one : best,
    null,
  )
  if (latest === null) return problemResponse(notFound(request, "research"))
  const version = wanted === "latest" ? latest : versions.find((one) => one.number === wanted)
  if (version === undefined) return problemResponse(notFound(request, "research-version"))

  const [context, cau, boxes, labels] = await Promise.all([
    contextOf(),
    cauByHumLabel(db, [resolved.primaryLabel]),
    publicBoxesOf([resolved.primaryLabel]),
    publishedDatasetLabels(db, citedDatasetIds(version.content)),
  ])

  const bundle: ResearchBundle = {
    researchId: resolved.id,
    humLabel: resolved.primaryLabel,
    versionNumber: version.number,
    releaseDate: version.releaseDate,
    versions: versions.map((one) => ({ number: one.number, releaseDate: one.releaseDate })),
    content: version.content,
  }
  return jsonResponse(researchObject(bundle, {
    context,
    labels,
    cau,
    files: boxes.get(resolved.primaryLabel) ?? [],
  }))
}

/**
 * A version is addressed the way the page addresses it, `v3`, so that the API
 * and the page name the same thing the same way. Anything else is not a version
 * that exists, which is the same answer as a version that does not.
 */
export async function researchVersionEntry(
  request: Request,
  humId: string,
  version: string,
): Promise<Response> {
  const [, digits] = /^v(\d+)$/.exec(version) ?? []
  if (digits === undefined) return problemResponse(notFound(request, "research-version"))
  return researchEntry(request, humId, Number(digits))
}

async function researchObjects(
  bundles: readonly ResearchBundle[],
  context: ApiContext,
  boxes: ReadonlyMap<string, StoredFile[]>,
): Promise<ApiResearch[]> {
  if (bundles.length === 0) return []
  const db = getDb()
  const [labels, cau] = await Promise.all([
    datasetLabels(db, bundles.map((bundle) => bundle.researchId)),
    cauByHumLabel(db, bundles.map((bundle) => bundle.humLabel)),
  ])
  return bundles.map((bundle) => researchObject(bundle, {
    context,
    labels,
    cau,
    files: boxes.get(bundle.humLabel) ?? [],
  }))
}

// --- dataset --------------------------------------------------------------

function datasetObject(
  bundle: DatasetBundle,
  listing: readonly StoredFile[],
  context: ApiContext,
): ApiDataset {
  return apiDataset({
    label: bundle.label,
    humLabel: bundle.humLabel,
    datePublished: bundle.datePublished,
    dateModified: bundle.dateModified,
    content: publicDatasetContent(
      bundle.content,
      { keys: context.catalog.keyById, files: listing },
      PUBLISHED,
    ),
    files: listing,
  }, context)
}

export async function datasetEntry(request: Request, datasetId: string): Promise<Response> {
  const db = getDb()
  const resolved = await resolveDatasetLabel(db, datasetId)
  if (resolved === null) return problemResponse(notFound(request, "dataset"))

  const [bundle] = await datasetBundles(db, [resolved.id])
  if (bundle === undefined) return problemResponse(notFound(request, "dataset"))

  const [context, boxes] = await Promise.all([contextOf(), publicBoxesOf([bundle.humLabel])])
  return jsonResponse(datasetObject(bundle, boxes.get(bundle.humLabel) ?? [], context))
}

function datasetObjects(
  bundles: readonly DatasetBundle[],
  context: ApiContext,
  boxes: ReadonlyMap<string, StoredFile[]>,
): ApiDataset[] {
  return bundles.map((bundle) =>
    datasetObject(bundle, boxes.get(bundle.humLabel) ?? [], context))
}

// --- search ---------------------------------------------------------------

export async function apiSearch(request: Request, target: SearchTarget): Promise<Response> {
  const db = getDb()
  const url = new URL(request.url)

  const definitions = await loadFacetDefinitions(db)
  const fields = queryFields(definitions.map((one) => one.field))
  const parsed = parseQuery(url.searchParams.get("q") ?? "", fields)
  if (!parsed.ok) return problemResponse(invalidQuery(request, parsed.error))
  const ast = parsed.ast

  // Only a full-text match carries a score, so a query made of field conditions
  // alone has nothing to rank by. Asking for that ordering is reported rather
  // than quietly answered in a different one.
  const ranked = hasFreeText(ast)
  const offered = ranked ? SORT_KEYS : SORT_KEYS.filter((key) => key !== "relevance")
  const asked = url.searchParams.get("sort")
  let sort: SortKey
  if (asked === null) {
    sort = ranked ? "relevance" : target === "research" ? "dateModified" : "id"
  } else if (isSortKey(asked) && offered.includes(asked)) {
    sort = asked
  } else {
    return problemResponse(invalidSort(request, asked, offered))
  }

  const page = Number(url.searchParams.get("page") ?? "1")
  if (!Number.isInteger(page) || page < 1) {
    return problemResponse(invalidParameter(request, "page", "page must be a positive integer."))
  }

  const result = await searchDocs(db, { target, ast, fields, sort, page })
  const context = await contextOf()
  const order = result.hits.map((hit) =>
    target === "research" ? hit.humLabel : hit.datasetLabel ?? "")
  const boxes = await publicBoxesOf(result.hits.map((hit) => hit.humLabel))
  const ids = result.hits.map((hit) => hit.targetId)
  const hits: (ApiResearch | ApiDataset)[] = target === "research"
    ? await researchObjects(await researchBundles(db, ids), context, boxes)
    : datasetObjects(await datasetBundles(db, ids), context, boxes)

  return jsonResponse({
    total: result.total,
    page: result.page,
    pageCount: result.pageCount,
    query: serializeQuery(ast),
    hits: inOrder(hits, order),
  })
}

/** The batched read answers in its own order; the ranking is what was asked for. */
function inOrder<T extends { id: string }>(objects: readonly T[], order: readonly string[]): T[] {
  const byId = new Map(objects.map((object) => [object.id, object]))
  return order.flatMap((id) => {
    const object = byId.get(id)
    return object === undefined ? [] : [object]
  })
}

// --- bulk -----------------------------------------------------------------

export async function apiBulk(target: SearchTarget): Promise<Response> {
  const db = getDb()
  const [context, boxes] = await Promise.all([contextOf(), everyPublicBox()])
  const objects: (ApiResearch | ApiDataset)[] = target === "research"
    ? await researchObjects(await researchBundles(db, null), context, boxes)
    : datasetObjects(await datasetBundles(db, null), context, boxes)

  return ndjsonResponse([...objects].sort((a, b) => a.id.localeCompare(b.id)))
}

// --- dblink ---------------------------------------------------------------

export function dblinkTypes(): Response {
  return jsonResponse({ types: [...ACCESSION_TYPES] })
}

export async function dblinkListing(request: Request, type: string): Promise<Response> {
  const subject = accessionTypeOr(request, type)
  if (typeof subject !== "string") return subject

  const [edges, context] = await Promise.all([publishedEdges(getDb()), contextOf()])
  return ndjsonResponse(linksBySubject(edges, subject, context.origin))
}

export async function dblinkEntry(
  request: Request,
  type: string,
  identifier: string,
): Promise<Response> {
  const subject = accessionTypeOr(request, type)
  if (typeof subject !== "string") return subject

  const [edges, context] = await Promise.all([publishedEdges(getDb()), contextOf()])
  return jsonResponse(linksOfSubject(edges, subject, identifier, context.origin))
}

function accessionTypeOr(request: Request, type: string): AccessionType | Response {
  return isAccessionType(type)
    ? type
    : problemResponse(unknownAccessionType(request, ACCESSION_TYPES))
}

// --- the document ---------------------------------------------------------

export function openapi(): Response {
  return jsonResponse(apiDocument(publicOrigin(loadConfig(process.env).auth)))
}
