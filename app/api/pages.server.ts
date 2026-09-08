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
  PUBLISHED,
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
import { findVersion, latestOf } from "~/public/versions"
import { loadFacetDefinitions, publishedFacetValues } from "~/search/catalog.server"
import { parseQuery, serializeQuery } from "~/search/dsl"
import { BUILT_IN_FIELDS, queryFields } from "~/search/fields"
import {
  defaultOrder,
  isSortKey,
  isSortOrder,
  searchDocs,
  DEFAULT_SORT,
  SORT_KEYS,
  SORT_ORDERS,
  type SearchTarget,
  type SortKey,
  type SortOrder,
} from "~/search/query.server"

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
  invalidOrder,
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
import type { ApiDataset, ApiResearch, ApiSearchField, ApiTerm } from "./schema"
import { apiDataset, apiResearch, labelOf, type ApiContext } from "./view"

function originOf(): string {
  return publicOrigin(loadConfig(process.env).auth)
}

/**
 * What turning a stored object into an answer needs. **The catalog is read only
 * where an answer holds content** — the relation endpoints DDBJ Search polls
 * answer out of the labels alone, and reading a table they never look at would
 * be a cost paid on every one of those calls.
 */
async function contextOf(): Promise<ApiContext> {
  return { origin: originOf(), catalog: await loadCatalog(getDb()) }
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
  const latest = latestOf(versions)
  if (latest === null) return problemResponse(notFound(request, "research"))
  const version = wanted === "latest" ? latest : findVersion(versions, wanted)
  if (version === null) return problemResponse(notFound(request, "research-version"))

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

  // An ordering nobody can be given is reported rather than quietly answered in
  // a different one: a client that asked for something has to hear that it was
  // not what it got.
  const asked = url.searchParams.get("sort")
  let sort: SortKey
  if (asked === null) {
    sort = DEFAULT_SORT
  } else if (isSortKey(asked)) {
    sort = asked
  } else {
    return problemResponse(invalidSort(request, asked, SORT_KEYS))
  }

  // **The direction is asked for apart from the key** (`app/search/sort.ts`), so
  // a caller that wants the other end of a listing says so instead of counting
  // its way to the last page. A direction that is neither is refused for the
  // same reason an ordering that cannot be given is.
  const wanted = url.searchParams.get("order")
  let order: SortOrder
  if (wanted === null) {
    order = defaultOrder(sort)
  } else if (isSortOrder(wanted)) {
    order = wanted
  } else {
    return problemResponse(invalidOrder(request, wanted, SORT_ORDERS))
  }

  const page = Number(url.searchParams.get("page") ?? "1")
  if (!Number.isInteger(page) || page < 1) {
    return problemResponse(invalidParameter(request, "page", "page must be a positive integer."))
  }

  const result = await searchDocs(db, { target, ast, fields, sort, order, page })
  const context = await contextOf()
  const ranking = result.hits.map((hit) =>
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
    hits: inOrder(hits, ranking),
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

// --- fields ---------------------------------------------------------------

/**
 * What a query may be written against.
 *
 * **The catalog is the list.** A key typed as a vocabulary, a number or a
 * disease is a field and no other key is (`app/search/catalog.server.ts`), so
 * this answer and the refinement panel are one set read twice — what the screen
 * can filter by is what `?q=` can name.
 *
 * **The values are the ones the published set holds**, not the ones the
 * vocabulary defines, so a value taken from here always matches something. The
 * keys whose values are prose are not fields: the search row keeps their text
 * but not which key it came from, so their words are reachable as free text and
 * not as `key:word` (`docs/data-model.md` の「検索用の行」).
 *
 * **A field an object does not show is still a field to ask by.** Thirteen keys
 * are drawn in the refinement panel and left off the page (`show_on_public_page`),
 * and the public projection is one function, so what the page leaves off the API
 * leaves off too. `inAnswers` is how a caller learns that before it goes looking
 * for a value that will not be there.
 */
export async function searchFields(): Promise<Response> {
  const db = getDb()
  const [definitions, values] = await Promise.all([
    loadFacetDefinitions(db),
    publishedFacetValues(db),
  ])
  const fields = queryFields(definitions.map((one) => one.field))

  const held = new Map<string, ApiTerm[]>()
  for (const value of values) {
    held.set(value.keyId, [...held.get(value.keyId) ?? [], {
      code: value.code,
      label: labelOf(value),
    }])
  }

  /** A name the query language does not know is left out: it could not be used. */
  function described(code: string, rest: Omit<ApiSearchField, "code" | "type">): ApiSearchField[] {
    const type = fields.typeOf(code)
    return type === undefined ? [] : [{ code, type, ...rest }]
  }

  return jsonResponse({
    fields: [
      // The four the search row is made of are the ones an answer opens with.
      ...[...BUILT_IN_FIELDS.keys()].flatMap((code) => described(code, { inAnswers: true })),
      ...definitions.flatMap((one) => described(one.field.code, {
        label: labelOf({ labelJa: one.labelJa, labelEn: one.labelEn }),
        ...one.canonicalUnit === null ? {} : { unit: one.canonicalUnit },
        ...one.field.kind === "number" ? {} : { values: held.get(one.field.keyId) ?? [] },
        inAnswers: one.showOnPublicPage,
      })),
    ],
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

  const edges = await publishedEdges(getDb())
  return ndjsonResponse(linksBySubject(edges, subject, originOf()))
}

export async function dblinkEntry(
  request: Request,
  type: string,
  identifier: string,
): Promise<Response> {
  const subject = accessionTypeOr(request, type)
  if (typeof subject !== "string") return subject

  const edges = await publishedEdges(getDb())
  return jsonResponse(linksOfSubject(edges, subject, identifier, originOf()))
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
