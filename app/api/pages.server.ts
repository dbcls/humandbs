/**
 * What each endpoint of the JSON API responds with.
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
 * **A prefix that the store did not list is an empty prefix here.** The public page
 * drops its download section when the store is silent, but an answer whose
 * shape depended on whether an unrelated system replied would be worse than one
 * that reports the listing is empty — and the listing is not what the API promises
 * to be complete.
 */

import { loadConfig, publicOrigin } from "~/config.server"
import { valueOr } from "~/content/empty"
import {
  publicDatasetContent,
  publicResearch,
  PUBLISHED,
  type CauUsage,
  type StoredFile,
} from "~/content/public"
import { getDb } from "~/db/client.server"
import { everyPublicListing, publicListingsOf } from "~/files/listing.server"
import type { FileLabel } from "~/files/labels"
import { fileLabelsByHumLabel } from "~/files/labels.server"
import { researchPageFilesByResearch, researchPageFilesOf } from "~/files/research-page.server"
import { datasetFileSummary, formatLabel } from "~/files/summary"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { parsePageNumber } from "~/paging"
import {
  loadCatalog,
  publishedDatasetLabels,
  publishedVersions,
  resolveDatasetLabel,
  resolveHumLabel,
} from "~/public/queries.server"
import { parseVersionSegment } from "~/public/urls"
import { findVersion, latestOf } from "~/public/versions"
import { loadFacetDefinitions, publishedFacetValues, publishedFormats } from "~/search/catalog.server"
import { parseQuery, serializeQuery } from "~/search/dsl"
import { BUILT_IN_FIELDS, FILE_TYPE_FIELD, queryFields } from "~/search/fields"
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
import type { ApiDataset, ApiResearch, ApiSearchField, ApiTerm, ApiText } from "./schema"
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
    ...content.relatedPublications.flatMap((publication) => valueOr(publication.datasetIds, [])),
  ])]
}

function researchObject(
  bundle: ResearchBundle,
  input: {
    context: ApiContext
    labels: ReadonlyMap<string, string>
    cau: ReadonlyMap<string, CauUsage[]>
    /** Null when the caller did not ask for the files. */
    files: readonly StoredFile[] | null
    fileLabels: ReadonlyMap<string, FileLabel>
  },
): ApiResearch {
  const projected = publicResearch(
    bundle.content,
    { cau: input.cau.get(bundle.humLabel) ?? [], files: input.files ?? [] },
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
    files: input.files === null ? null : projected.files,
    fileLabels: input.fileLabels,
  }, input.context)
}

/**
 * Whether the answer carries the file listings.
 *
 * **Off unless asked for.** A research's prefix can hold over ten thousand
 * files, so a caller after the content alone would otherwise wait for the store
 * to be listed and then receive megabytes of it. Anything but `true` or `false`
 * is refused rather than read as off, so that a caller who wrote `yes` hears
 * that it was not understood.
 */
function includeFilesOf(request: Request): boolean | Response {
  const asked = new URL(request.url).searchParams.get("includeFiles")
  if (asked === null || asked === "false") return false
  if (asked === "true") return true
  return problemResponse(invalidParameter(request, "includeFiles", "includeFiles must be true or false."))
}

export async function researchEntry(
  request: Request,
  humId: string,
  wanted: number | "latest",
): Promise<Response> {
  const include = includeFilesOf(request)
  if (typeof include !== "boolean") return include
  const db = getDb()
  const resolved = await resolveHumLabel(db, humId)
  if (resolved === null) return problemResponse(notFound(request, "research"))

  const versions = await publishedVersions(db, resolved.id)
  const latest = latestOf(versions)
  if (latest === null) return problemResponse(notFound(request, "research"))
  const version = wanted === "latest" ? latest : findVersion(versions, wanted)
  if (version === null) return problemResponse(notFound(request, "research-version"))

  const [context, cau, listings, labels, fileLabels, onPage] = await Promise.all([
    contextOf(),
    cauByHumLabel(db, [resolved.primaryLabel]),
    include ? publicListingsOf([resolved.primaryLabel]) : null,
    publishedDatasetLabels(db, citedDatasetIds(version.content)),
    include ? fileLabelsByHumLabel(db, [resolved.primaryLabel]) : null,
    include ? researchPageFilesOf(db, resolved.id) : null,
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
    files: listings === null ? null : onResearchPage(listings.get(resolved.primaryLabel), onPage),
    fileLabels: fileLabels?.get(resolved.primaryLabel) ?? new Map(),
  }))
}

/**
 * A research's files as its page lists them: those set to be listed there
 * (`researchPageFile`), out of the whole prefix a dataset's selection is read
 * against.
 */
function onResearchPage(listing: readonly StoredFile[] | undefined, listed: ReadonlySet<string> | null | undefined): StoredFile[] {
  return (listing ?? []).filter((file) => listed?.has(file.name) === true)
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
  const number = parseVersionSegment(version)
  if (number === null) return problemResponse(notFound(request, "research-version"))
  return researchEntry(request, humId, number)
}

async function researchObjects(
  bundles: readonly ResearchBundle[],
  context: ApiContext,
  listings: ReadonlyMap<string, StoredFile[]> | null,
  fileLabels: FileLabelsByHum | null,
): Promise<ApiResearch[]> {
  if (bundles.length === 0) return []
  const db = getDb()
  const [labels, cau, onPage] = await Promise.all([
    datasetLabels(db, bundles.map((bundle) => bundle.researchId)),
    cauByHumLabel(db, bundles.map((bundle) => bundle.humLabel)),
    listings === null ? null : researchPageFilesByResearch(db, bundles.map((bundle) => bundle.researchId)),
  ])
  return bundles.map((bundle) => researchObject(bundle, {
    context,
    labels,
    cau,
    files: listings === null ? null : onResearchPage(listings.get(bundle.humLabel), onPage?.get(bundle.researchId)),
    fileLabels: fileLabels?.get(bundle.humLabel) ?? new Map(),
  }))
}

// --- dataset --------------------------------------------------------------

/** The labels of the files of each research, by its primary hum label and then the file's name. */
type FileLabelsByHum = ReadonlyMap<string, ReadonlyMap<string, FileLabel>>

function datasetObject(
  bundle: DatasetBundle,
  /** Null when the caller did not ask for the files. */
  listing: readonly StoredFile[] | null,
  fileLabels: FileLabelsByHum | null,
  context: ApiContext,
): ApiDataset {
  return apiDataset({
    label: bundle.label,
    humLabel: bundle.humLabel,
    datePublished: bundle.datePublished,
    dateModified: bundle.dateModified,
    content: publicDatasetContent(
      bundle.content,
      { files: listing ?? [] },
      PUBLISHED,
    ),
    files: listing,
    fileLabels: fileLabels?.get(bundle.humLabel) ?? new Map(),
    // The selection as published, not as projected: without the listing the
    // projection has no files to keep, and the formats are read off the names.
    fileSummary: datasetFileSummary({
      label: bundle.label,
      selection: bundle.content.fileSelection,
      listing,
      archive: bundle.archiveFiles,
    }),
  }, context)
}

export async function datasetEntry(request: Request, datasetId: string): Promise<Response> {
  const include = includeFilesOf(request)
  if (typeof include !== "boolean") return include
  const db = getDb()
  const resolved = await resolveDatasetLabel(db, datasetId)
  if (resolved === null) return problemResponse(notFound(request, "dataset"))

  const [bundle] = await datasetBundles(db, [resolved.id])
  if (bundle === undefined) return problemResponse(notFound(request, "dataset"))

  const [context, listings, fileLabels] = await Promise.all([
    contextOf(),
    include ? publicListingsOf([bundle.humLabel]) : null,
    include ? fileLabelsByHumLabel(db, [bundle.humLabel]) : null,
  ])
  const listing = listings === null ? null : listings.get(bundle.humLabel) ?? []
  return jsonResponse(datasetObject(bundle, listing, fileLabels, context))
}

function datasetObjects(
  bundles: readonly DatasetBundle[],
  context: ApiContext,
  listings: ReadonlyMap<string, StoredFile[]> | null,
  fileLabels: FileLabelsByHum | null,
): ApiDataset[] {
  return bundles.map((bundle) =>
    datasetObject(bundle, listings === null ? null : listings.get(bundle.humLabel) ?? [], fileLabels, context))
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
  // a caller that wants the other end of a listing asks for it instead of counting
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

  const page = parsePageNumber(url.searchParams.get("page"))
  if (page === null) {
    return problemResponse(invalidParameter(request, "page", "page must be a positive integer."))
  }
  const include = includeFilesOf(request)
  if (typeof include !== "boolean") return include

  const result = await searchDocs(db, { target, ast, fields, sort, order, page })
  const context = await contextOf()
  const ranking = result.hits.map((hit) =>
    target === "research" ? hit.humLabel : hit.datasetLabel ?? "")
  const humLabels = result.hits.map((hit) => hit.humLabel)
  const [listings, fileLabels] = include
    ? await Promise.all([publicListingsOf(humLabels), fileLabelsByHumLabel(db, humLabels)])
    : [null, null]
  const ids = result.hits.map((hit) => hit.targetId)
  const hits: (ApiResearch | ApiDataset)[] = target === "research"
    ? await researchObjects(await researchBundles(db, ids), context, listings, fileLabels)
    : datasetObjects(await datasetBundles(db, ids), context, listings, fileLabels)

  return jsonResponse({
    total: result.total,
    page: result.page,
    // The listing pages count an empty result as one page to draw; a client
    // counting pages to fetch has none.
    pageCount: result.total === 0 ? 0 : result.pageCount,
    query: serializeQuery(ast),
    hits: inOrder(hits, ranking),
  })
}

/** The batched read returns rows in its own order; the ranking is what was asked for. */
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
 * not as `key:word`.
 *
 */
export async function searchFields(): Promise<Response> {
  const db = getDb()
  const [definitions, values, formats] = await Promise.all([
    loadFacetDefinitions(db),
    publishedFacetValues(db),
    publishedFormats(db),
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
      // The fields the search row is made of are the ones an answer opens with,
      // by the names the search screen gives them.
      ...[...BUILT_IN_FIELDS.keys()].flatMap((code) => described(code, {
        label: builtInLabel(code),
        // A format is called by its own name in either language, and the
        // vocabulary writes it in English alone (`files/formats.ts`).
        ...code === FILE_TYPE_FIELD
          ? { values: formats.map((format) => ({ code: format, label: labelOf({ labelJa: null, labelEn: formatLabel(format) }) })) }
          : {},
      })),
      ...definitions.flatMap((one) => described(one.field.code, {
        label: labelOf({ labelJa: one.labelJa, labelEn: one.labelEn }),
        ...one.canonicalUnit === null ? {} : { unit: one.canonicalUnit },
        ...one.field.kind === "number" ? {} : { values: held.get(one.field.keyId) ?? [] },
      })),
    ],
  })
}

function builtInLabel(code: string): ApiText {
  const nameIn = (locale: Locale) => (messagesFor(locale).search.fields as Record<string, string | undefined>)[code] ?? ""
  return labelOf({ labelJa: nameIn("ja"), labelEn: nameIn("en") })
}

// --- bulk -----------------------------------------------------------------

export async function apiBulk(request: Request, target: SearchTarget): Promise<Response> {
  const include = includeFilesOf(request)
  if (typeof include !== "boolean") return include
  const db = getDb()
  const [context, listings, fileLabels] = await Promise.all([
    contextOf(),
    include ? everyPublicListing() : null,
    include ? fileLabelsByHumLabel(db, null) : null,
  ])
  const objects: (ApiResearch | ApiDataset)[] = target === "research"
    ? await researchObjects(await researchBundles(db, null), context, listings, fileLabels)
    : datasetObjects(await datasetBundles(db, null), context, listings, fileLabels)

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
