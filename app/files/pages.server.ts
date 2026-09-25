/**
 * What the files screen loads, and what its forms and its uploads do.
 *
 * **The bytes never come through here.** An upload checks which of its names the
 * prefix already holds, requests a signature, puts straight to the store and records
 * nothing afterwards: the bucket a file sits in is the whole of its state, so
 * there is nothing to write down when one arrives.
 *
 * Switching and deleting are ordinary form posts, and both take several files
 * at once — a switch is a copy of the actual bytes and is therefore queued, so
 * the screen never waits for one.
 */

import { redirect } from "react-router"
import { z } from "zod"

import { requireCapability } from "~/auth/actor.server"
import type { Actor } from "~/auth/capabilities"
import { recordEvent, type EventActor } from "~/auth/events.server"
import { mapConcurrently } from "~/concurrency"
import { getDb } from "~/db/client.server"
import { loadConfig, publicOrigin } from "~/config.server"
import { dayFromInput, today } from "~/dates"
import type { Locale } from "~/i18n/locale"
import { isPageSize, PAGE_SIZE, type PageSize } from "~/search/page-size"
import { href } from "~/public/urls"

import { adminFilesPath, adminResearchFilesPath } from "~/admin/urls"
import { humLabelOf } from "~/admin/queries.server"
import { publishedFileSelections } from "~/public/queries.server"

import {
  FILE_SORT,
  FILE_STATES,
  type ListedFile,
  type FileSortKey,
  type FileState,
  commonPrefix,
  isFileSortKey,
  isFileSlug,
  isUploadableName,
  MULTIPART_CONCURRENCY,
  MULTIPART_PART_SIZE,
  MULTIPART_THRESHOLD,
  narrowedFiles,
  pageOfFiles,
  PRIVATE_BUCKET,
  privatePrefix,
  PUBLIC_BUCKET,
  publicPrefix,
  sortedFiles,
  type StoredNode,
} from "./prefix"
import { listingsOf, forgetSwitches, pendingSwitches, switchFiles, type SwitchRequest } from "./jobs.server"
import { adminListing, commonListing } from "./listing.server"
import { wakeFileRunner } from "./runner.server"
import {
  abortMultipart,
  beginMultipart,
  completeMultipart,
  copyObject,
  deleteObject,
  objectExists,
  presignGet,
  presignPut,
  type ObjectRef,
} from "./store.server"

function notFound(): never {
  throw new Response(null, { status: 404, statusText: "Not Found" })
}

function badRequest(): never {
  throw new Response(null, { status: 400, statusText: "Bad Request" })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What a prefix listing reads from its address. */
const LISTING_SETTINGS: readonly string[] = ["sort", "order", "size", "page"]
/** The research's prefix is narrowed by a side of the store as well. */
const RESEARCH_FILES_SETTINGS: readonly string[] = [...LISTING_SETTINGS, "q", "from", "to", "state"]

/** The `common/` prefix is also narrowed, and what narrows it is a setting of the listing too. */
const COMMON_LISTING_SETTINGS: readonly string[] = [...LISTING_SETTINGS, "q", "from", "to"]

/**
 * The listing an operation on its rows responds with: the one it was sent from.
 *
 * **The ordering, the page size and the page come back with it.** The forms on
 * a listing post to the address they are on, so what the reader chose is in
 * the request's own query; dropping it put a reader who had asked for fifty rows
 * back on twenty after every delete. Only the listing's settings are kept —
 * the rest of a query is not the listing's to keep, and which names are its
 * settings is the listing's to decide. A page the operation emptied is the
 * listing's to settle, the way it settles any page past the end.
 */
function backToListing(
  request: Request,
  locale: Locale,
  path: string,
  settings: readonly string[] = LISTING_SETTINGS,
): Response {
  const asked = new URL(request.url).searchParams
  const kept = new URLSearchParams()
  for (const name of settings) {
    const value = asked.get(name)
    if (value !== null) kept.set(name, value)
  }
  const written = kept.toString()
  return redirect(href(locale, path + (written === "" ? "" : `?${written}`)))
}

function identity(value: string | undefined): string {
  if (value === undefined || !UUID.test(value)) notFound()
  return value
}

export interface FilesPageView {
  locale: Locale
  researchId: string
  humLabel: string | null
  /** The site's public origin, which a copied address is written on (`publicOrigin`). */
  origin: string
  /** Null when the store did not respond; the screen reports it and offers nothing. */
  rows: ListedFile[] | null
  /**
   * The published datasets that select each file on the page, by the file's
   * name — what the research's public page shows of the same file. A file no
   * dataset selects is not a key.
   */
  selectedBy: Record<string, string[]>
  /** The words looked for in the name, as typed. Empty when none were. */
  keyword: string
  /** The first and the last day kept, each `null` when that end is open. */
  from: string | null
  to: string | null
  /** The JST day the windows over the range open from (`~/search/date-window`). */
  today: string
  /** Which sides of the store are kept. Empty, or both, is every file. */
  states: FileState[]
  /**
   * How many files are on each side, counted with the side condition off and
   * the others on — the way every listing counts its values.
   */
  counts: Record<FileState, number>
  sort: FileSortKey
  order: "asc" | "desc"
  size: PageSize
  total: number
  page: number
  pageCount: number
  /** 1-based positions of the shown rows within the whole prefix. */
  rangeFrom: number
  rangeTo: number
  /** How many switches have not finished, over the whole prefix rather than the page. */
  /** Above this an upload is split into parts, and each part is this many bytes. */
  multipartThreshold: number
  partSize: number
}

function isFileState(value: string): value is FileState {
  return (FILE_STATES as readonly string[]).includes(value)
}

/** The side a file is on, as the axis names it. */
function stateOf(entry: ListedFile): FileState {
  return entry.isPublic ? "public" : "private"
}

export async function filesPage(
  request: Request,
  locale: Locale,
  researchId: string | undefined,
): Promise<FilesPageView> {
  await requireCapability(request, "manage-files")

  const id = identity(researchId)
  const db = getDb()
  const humLabel = await humLabelOf(db, id)
  const listing = await adminListing(db, id, humLabel)

  const asked = new URL(request.url).searchParams
  // Unreadable is the default rather than a refusal, for the reason the
  // `common/` prefix reads its own address that way.
  const keyword = asked.get("q") ?? ""
  const from = dayFromInput(asked.get("from") ?? "")
  const to = dayFromInput(asked.get("to") ?? "")
  const states = asked.getAll("state").filter(isFileState)
  const sort = isFileSortKey(asked.get("sort")) ? asked.get("sort") as FileSortKey : FILE_SORT
  const order = asked.get("order") === "desc" ? "desc" : "asc"
  const chosen = Number(asked.get("size") ?? "")
  const size = isPageSize(chosen) ? chosen : PAGE_SIZE
  const wanted = Number(asked.get("page") ?? "1")

  // The side is counted with its own condition off, so that a reader who
  // picked one side can still see how many are on the other.
  const bySide = narrowedFiles(listing ?? [], { keyword, from, to })
  const narrowed = states.length === 0
    ? bySide
    : bySide.filter((entry) => states.includes(stateOf(entry)))
  const page = pageOfFiles(sortedFiles(narrowed, sort, order), Number.isInteger(wanted) ? wanted : 1, size)
  const selections = await publishedFileSelections(db, id)

  return {
    locale,
    researchId: id,
    humLabel,
    origin: publicOrigin(loadConfig(process.env).auth),
    rows: listing === null ? null : page.rows,
    selectedBy: Object.fromEntries(page.rows.flatMap((row) => {
      const labels = selections.get(row.name)
      return labels === undefined ? [] : [[row.name, labels]]
    })),
    keyword,
    from,
    to,
    today: today(),
    states,
    counts: {
      public: bySide.filter((entry) => entry.isPublic).length,
      private: bySide.filter((entry) => !entry.isPublic).length,
    },
    sort,
    order,
    size,
    total: page.total,
    page: page.page,
    pageCount: page.pageCount,
    rangeFrom: page.rangeFrom,
    rangeTo: page.rangeTo,
    multipartThreshold: MULTIPART_THRESHOLD,
    partSize: MULTIPART_PART_SIZE,
  }
}

export type FilesActionResult
  = | { status: "no-hum-label" }
    | { status: "nothing-selected" }
    | { status: "malformed-slug" }
    | { status: "slug-taken" }
    /** A research file cannot have this name: the prefix is flat, and a name is one file. */
    | { status: "malformed-name" }
    | { status: "name-taken" }
    /** The file's switch has not finished, so which side it is renamed on is not settled. */
    | { status: "switching" }
    /**
     * A file sent for deleting has a switch that has not finished. The runner
     * would otherwise finish its copy after the delete and leave the file
     * public; nothing is deleted, including the other files sent with it.
     */
    | { status: "delete-switching" }

/**
 * What is done to a file of the prefix from its row: switched, deleted, renamed.
 * The first two name the file the way a selection would, so the post is the
 * same shape whether one row sent it or the publish confirmation sent a list.
 */
export async function filesAction(
  request: Request,
  locale: Locale,
  researchId: string | undefined,
): Promise<Response | FilesActionResult> {
  const actor = await requireCapability(request, "manage-files")

  const id = identity(researchId)
  const db = getDb()
  const humLabel = await humLabelOf(db, id)

  const form = await request.formData()
  const intent = form.get("intent")
  const back = backToListing(request, locale, adminResearchFilesPath(id), RESEARCH_FILES_SETTINGS)
  if (intent === "rename") return renameResearchFile(db, id, form, actorOf(actor), back)

  const names = form.getAll("name").flatMap((value) => typeof value === "string" ? [value] : [])
  if (names.length === 0) return { status: "nothing-selected" }
  // Every name becomes a key, so one that is not a single file of the prefix
  // would address the prefix itself or somewhere outside it. The rows only send
  // names the prefix listed.
  if (!names.every(isUploadableName)) badRequest()

  if (intent === "publish" || intent === "unpublish") {
    // Nowhere to put a public copy. Refused here rather than left to fail in
    // the queue, where nobody would be looking.
    if (intent === "publish" && humLabel === null) return { status: "no-hum-label" }
    const requests: SwitchRequest[] = names.map((fileName) => ({
      researchId: id,
      fileName,
      action: intent,
    }))
    await switchFiles(db, requests, actorOf(actor))
    wakeFileRunner()
    return back
  }

  if (intent !== "delete") badRequest()
  const deleted = await deleteFiles(id, names, actorOf(actor))
  return deleted ? back : { status: "delete-switching" }
}

function actorOf(actor: { sub: string, name: string }): EventActor {
  return { sub: actor.sub, name: actor.name }
}

/**
 * Giving a file of the prefix a different name, on whichever sides it is on.
 *
 * **A copy and a delete on each side**, the copy first (`renameCommonFile`).
 * A name that is one file already, on either side, is refused rather than
 * written over; and a file whose switch is still queued is left alone, since
 * the side it will be on is not settled and the runner would find nothing
 * under the name it was given.
 *
 * **Only the public side is written down.** Readers can fetch what is there,
 * and for them one address starts responding and another stops — the same two
 * things deleting and publishing write. Moving the private copy changes
 * nothing anybody can fetch.
 */
async function renameResearchFile(
  db: ReturnType<typeof getDb>,
  researchId: string,
  form: FormData,
  actor: EventActor,
  back: Response,
): Promise<Response | FilesActionResult> {
  const from = form.get("from")
  const to = form.get("to")
  if (typeof from !== "string" || typeof to !== "string") badRequest()
  const name = to.trim()
  if (!isUploadableName(from)) badRequest()
  if (!isUploadableName(name)) return { status: "malformed-name" }
  if (name === from) return back

  const pending = await pendingSwitches(db, researchId)
  if (pending.some((row) => row.fileName === from)) return { status: "switching" }

  const listings = await listingsOf(db, researchId)
  const labels = [...(listings.primary === null ? [] : [listings.primary]), ...listings.others]
  interface Side { bucket: ObjectRef["bucket"], prefix: string, shown: boolean }
  const sides: Side[] = [
    { bucket: PRIVATE_BUCKET, prefix: privatePrefix(researchId), shown: false },
    ...labels.map((label): Side => ({ bucket: PUBLIC_BUCKET, prefix: publicPrefix(label), shown: true })),
  ]
  for (const side of sides) {
    if (await objectExists({ bucket: side.bucket, key: side.prefix + name })) {
      return { status: "name-taken" }
    }
  }

  const shown: { from: ObjectRef, to: ObjectRef }[] = []
  for (const side of sides) {
    const source: ObjectRef = { bucket: side.bucket, key: side.prefix + from }
    if (!(await objectExists(source))) continue
    const target: ObjectRef = { bucket: side.bucket, key: side.prefix + name }
    await copyObject(source, target)
    await deleteObject(source)
    if (side.shown) shown.push({ from: source, to: target })
  }

  if (shown.length > 0) {
    await db.transaction(async (tx) => {
      for (const moved of shown) {
        await recordEvent(tx, {
          actor,
          action: "publish-file",
          subjectType: "file",
          subjectId: name,
          detail: { research: researchId, key: moved.to.key, renamedFrom: from },
        })
        await recordEvent(tx, {
          actor,
          action: "delete-file",
          subjectType: "file",
          subjectId: from,
          detail: { research: researchId, key: moved.from.key, renamedTo: name },
        })
      }
    })
  }
  return back
}

/**
 * Take the file away, wherever it is. Every prefix the research has ever held is
 * cleared, because a copy left in a retired one would still answer at its old
 * address.
 *
 * **A file whose switch has not finished is not deleted**, the way it is not
 * renamed. The runner copies before it deletes, so a copy it is making lands
 * after this delete and the file would stay public with the trail indicating it
 * was deleted. The switch's row is held while this is decided, so the runner
 * cannot take it up in between; a switch that gave up moves nothing and is
 * forgotten with the file. False means nothing was deleted.
 */
async function deleteFiles(
  researchId: string,
  names: readonly string[],
  actor: EventActor,
): Promise<boolean> {
  const db = getDb()
  const free = await db.transaction(async (tx) => {
    const switches = await pendingSwitches(tx, researchId, { names, lock: true })
    if (switches.some((row) => !row.failed)) return false
    await forgetSwitches(tx, researchId, names)
    return true
  })
  if (!free) return false

  const listings = await listingsOf(db, researchId)
  const labels = [...(listings.primary === null ? [] : [listings.primary]), ...listings.others]

  for (const name of names) {
    const refs: ObjectRef[] = [
      { bucket: PRIVATE_BUCKET, key: privatePrefix(researchId) + name },
      ...labels.map((label): ObjectRef => ({
        bucket: PUBLIC_BUCKET,
        key: publicPrefix(label) + name,
      })),
    ]
    for (const ref of refs) await deleteObject(ref)
  }

  await db.transaction(async (tx) => {
    for (const name of names) {
      await recordEvent(tx, {
        actor,
        action: "delete-file",
        subjectType: "file",
        subjectId: name,
        detail: { research: researchId },
      })
    }
  })
  return true
}

/**
 * What an upload requests.
 *
 * The name, the size and the content type are all settled before a URL exists,
 * because all three go into the signature: that is the only limit that can be
 * placed on a transfer the application does not see.
 *
 * **The first question names the files and nothing else.** A name is the key,
 * so sending one the prefix already holds replaces what is there; the screen checks
 * which of its names would, before it requests any signature, and puts the
 * question to the reader.
 */
const uploadRequest = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("check"),
    names: z.array(z.string()).min(1).max(10_000),
  }),
  z.object({
    kind: z.literal("single"),
    name: z.string(),
    size: z.number().int().nonnegative(),
    contentType: z.string().min(1),
  }),
  z.object({
    kind: z.literal("begin"),
    name: z.string(),
    size: z.number().int().positive(),
    contentType: z.string().min(1),
    partCount: z.number().int().positive().max(10_000),
  }),
  z.object({
    kind: z.literal("complete"),
    name: z.string(),
    uploadId: z.string().min(1),
    parts: z.array(z.object({
      partNumber: z.number().int().positive(),
      etag: z.string().min(1),
    })).min(1),
  }),
  z.object({
    kind: z.literal("abort"),
    name: z.string(),
    uploadId: z.string().min(1),
  }),
])

type UploadPayload = z.infer<typeof uploadRequest>
type SigningPayload = Exclude<UploadPayload, { kind: "check" }>

export type UploadAnswer
  = | { kind: "check", existing: string[] }
    | { kind: "single", url: string }
    | { kind: "begin", uploadId: string, urls: string[] }
    | { kind: "done" }

/** What an upload asked for, or a 400 for a body no signature can be made from. */
async function uploadBody(request: Request): Promise<UploadPayload> {
  const payload = uploadRequest.safeParse(await request.json())
  if (!payload.success) badRequest()
  const names = payload.data.kind === "check" ? payload.data.names : [payload.data.name]
  if (!names.every(isUploadableName)) badRequest()
  return payload.data
}

/**
 * Which of the names are already in the prefix, in the order they were asked in.
 *
 * **A name is looked for everywhere the prefix lists it from.** A research's prefix
 * is two buckets shown as one list, and a name on the public side is one the
 * reader sees in that list as much as one on the private side. The same HEAD a
 * slug change refuses a taken name with, a few at a time.
 */
async function alreadyThere(
  names: readonly string[],
  placesOf: (name: string) => ObjectRef[],
): Promise<UploadAnswer> {
  const found = await mapConcurrently(names, MULTIPART_CONCURRENCY, async (name) => {
    for (const ref of placesOf(name)) {
      if (await objectExists(ref)) return true
    }
    return false
  })
  return { kind: "check", existing: names.filter((_, index) => found[index] === true) }
}

/**
 * The four steps an upload can request, against an object already decided on.
 *
 * **Both prefixes sign the same way** and differ only in where the object lands
 * and in whether its arrival is written down, so what a signature covers — the
 * type, the size, the part count — is settled here rather than once per prefix.
 * `arrived` runs at the two moments the portal last takes part in an upload.
 */
async function signUpload(
  body: SigningPayload,
  ref: ObjectRef,
  arrived?: () => Promise<void>,
): Promise<UploadAnswer> {
  if (body.kind === "single") {
    if (body.size > MULTIPART_THRESHOLD) badRequest()
    const url = await presignPut(ref, { contentType: body.contentType, size: body.size })
    await arrived?.()
    return { kind: "single", url }
  }
  if (body.kind === "begin") {
    const begun = await beginMultipart(ref, {
      contentType: body.contentType,
      partCount: body.partCount,
    })
    return { kind: "begin", uploadId: begun.uploadId, urls: begun.urls }
  }
  if (body.kind === "complete") {
    await completeMultipart(ref, body.uploadId, body.parts)
    await arrived?.()
    return { kind: "done" }
  }
  await abortMultipart(ref, body.uploadId)
  return { kind: "done" }
}

/**
 * Hand out the signatures for one upload. **Everything lands in the private
 * bucket** — a file received from a data provider must not be fetchable by
 * anyone the moment it arrives, so making it public is a later, deliberate act.
 */
export async function fileUploadAction(
  request: Request,
  researchId: string | undefined,
): Promise<UploadAnswer> {
  await requireCapability(request, "manage-files")
  const id = identity(researchId)
  const body = await uploadBody(request)
  const privateAt = (name: string): ObjectRef => ({ bucket: PRIVATE_BUCKET, key: privatePrefix(id) + name })
  if (body.kind === "check") {
    // The list the reader sees is both sides of the store (`adminListing`), so a
    // name is looked for on both — the public side only once there is a label
    // to have put anything under.
    const label = await humLabelOf(getDb(), id)
    return alreadyThere(body.names, (name) => label === null
      ? [privateAt(name)]
      : [privateAt(name), { bucket: PUBLIC_BUCKET, key: publicPrefix(label) + name }])
  }
  return signUpload(body, privateAt(body.name))
}

/**
 * A private file of the research, handed to the browser as a redirect to a
 * signed address of the store.
 *
 * **The guard is the files screen's own** (`manage-files`): the download is one
 * more thing done to a row of that screen, and whoever may publish or delete
 * the file may read it. Readers and data providers following a share link hold
 * no capability, and the share preview has no route here.
 *
 * **The name is checked the way every other operation on a row checks it**, and
 * then looked for in the private side of this research's prefix — a name that is
 * not there is 404 rather than an address that would be refused later, and a
 * public file is fetched from its public address instead.
 *
 * **Nothing is written to the trail.** Reading a file changes nothing anybody
 * can fetch, and the trail records what does.
 */
export async function fileDownload(
  request: Request,
  researchId: string | undefined,
): Promise<Response> {
  await requireCapability(request, "manage-files")
  const id = identity(researchId)
  const name = new URL(request.url).searchParams.get("name")
  if (name === null || !isUploadableName(name)) badRequest()

  const ref: ObjectRef = { bucket: PRIVATE_BUCKET, key: privatePrefix(id) + name }
  if (!(await objectExists(ref))) notFound()

  // The address is good for anyone who holds it until it expires, so neither
  // the browser nor anything between keeps the redirect.
  return redirect(await presignGet(ref, name), { headers: { "Cache-Control": "no-store" } })
}

export interface CommonFilesView {
  locale: Locale
  /** The site's public origin, which a copied address is written on (`publicOrigin`). */
  origin: string
  /** Null when the store did not respond; the screen reports it and offers nothing. */
  rows: StoredNode[] | null
  /** The words looked for in the slug, as typed. Empty when none were. */
  keyword: string
  /** The first and the last day kept, each `null` when that end is open. */
  from: string | null
  to: string | null
  /** The JST day the windows over the range open from (`~/search/date-window`). */
  today: string
  sort: FileSortKey
  order: "asc" | "desc"
  size: PageSize
  total: number
  page: number
  pageCount: number
  /** 1-based positions of the shown rows within the whole prefix. */
  rangeFrom: number
  rangeTo: number
  multipartThreshold: number
  partSize: number
}

/**
 * The article assets. One prefix, one bucket, no switching: what is here is public,
 * so the only operations are putting a file in and taking one out.
 */
export async function commonFilesPage(
  request: Request,
  locale: Locale,
): Promise<CommonFilesView> {
  await requireCapability(request, "manage-site-content")

  const listing = await commonListing()
  const asked = new URL(request.url).searchParams
  /*
    **Anything unreadable is the default rather than a refusal.** These are
    typed into the address by hand as often as they are pressed, and a listing
    that responds with 400 to a mistyped ordering loses the reader the page they were
    on. A day that is not one is an end left open, for the same reason.
  */
  const keyword = asked.get("q") ?? ""
  const from = dayFromInput(asked.get("from") ?? "")
  const to = dayFromInput(asked.get("to") ?? "")
  const sort = isFileSortKey(asked.get("sort")) ? asked.get("sort") as FileSortKey : FILE_SORT
  const order = asked.get("order") === "desc" ? "desc" : "asc"
  const chosen = Number(asked.get("size") ?? "")
  const size = isPageSize(chosen) ? chosen : PAGE_SIZE
  const wanted = Number(asked.get("page") ?? "1")
  const narrowed = narrowedFiles(listing ?? [], { keyword, from, to })
  const page = pageOfFiles(sortedFiles(narrowed, sort, order), Number.isInteger(wanted) ? wanted : 1, size)

  return {
    locale,
    origin: publicOrigin(loadConfig(process.env).auth),
    rows: listing === null ? null : page.rows,
    keyword,
    from,
    to,
    today: today(),
    sort,
    order,
    size,
    total: page.total,
    page: page.page,
    pageCount: page.pageCount,
    rangeFrom: page.rangeFrom,
    rangeTo: page.rangeTo,
    multipartThreshold: MULTIPART_THRESHOLD,
    partSize: MULTIPART_PART_SIZE,
  }
}

export async function commonFilesAction(
  request: Request,
  locale: Locale,
): Promise<Response | FilesActionResult> {
  const actor = await requireCapability(request, "manage-site-content")

  const form = await request.formData()
  const intent = form.get("intent")
  if (intent === "rename") return renameCommonFile(request, form, actor, locale)
  if (intent !== "delete") badRequest()

  const names = form.getAll("name").flatMap((value) => typeof value === "string" ? [value] : [])
  if (names.length === 0) return { status: "nothing-selected" }
  // A slug is a key under the prefix; one that is not a file's would address the
  // prefix itself or somewhere outside it.
  if (!names.every(isFileSlug)) badRequest()

  for (const name of names) {
    await deleteObject({ bucket: PUBLIC_BUCKET, key: commonPrefix() + name })
  }
  await getDb().transaction(async (tx) => {
    for (const name of names) {
      await recordEvent(tx, {
        actor: actorOf(actor),
        action: "delete-file",
        subjectType: "file",
        subjectId: commonPrefix() + name,
      })
    }
  })

  return backToListing(request, locale, adminFilesPath(), COMMON_LISTING_SETTINGS)
}

/**
 * Giving a file a different slug, which is giving it a different address.
 *
 * **It is a copy and a delete**, because that is what a key is: an object does
 * not move within a bucket. The copy goes first, so a failure between the two
 * leaves the file reachable at both slugs rather than at neither.
 *
 * **A slug already taken is refused rather than overwritten.** An upload of the
 * same name overwrites on purpose — it is the same file arriving again — but a
 * rename onto an occupied slug destroys something the reader did not name.
 *
 * **The address the file used to respond at stops responding**, which is the same
 * break deleting one makes, so it is written down the same way.
 */
async function renameCommonFile(
  request: Request,
  form: FormData,
  actor: Actor,
  locale: Locale,
): Promise<Response | FilesActionResult> {
  const from = form.get("from")
  const to = form.get("to")
  if (typeof from !== "string" || typeof to !== "string") badRequest()
  const slug = to.trim()
  if (!isFileSlug(from)) badRequest()
  if (!isFileSlug(slug)) return { status: "malformed-slug" }
  if (slug === from) return backToListing(request, locale, adminFilesPath(), COMMON_LISTING_SETTINGS)

  const at = (name: string): ObjectRef => ({ bucket: PUBLIC_BUCKET, key: commonPrefix() + name })
  if (await objectExists(at(slug))) return { status: "slug-taken" }

  await copyObject(at(from), at(slug))
  await deleteObject(at(from))
  // **The move is written as the two things it does to a reader**: one address
  // starts responding and the other stops. What the trail records is what can be
  // fetched, and those are exactly the two events there are names for.
  await getDb().transaction(async (tx) => {
    await recordEvent(tx, {
      actor: actorOf(actor),
      action: "publish-file",
      subjectType: "file",
      subjectId: at(slug).key,
    })
    await recordEvent(tx, {
      actor: actorOf(actor),
      action: "delete-file",
      subjectType: "file",
      subjectId: at(from).key,
    })
  })

  return backToListing(request, locale, adminFilesPath(), COMMON_LISTING_SETTINGS)
}

/**
 * The signatures for one upload into the article assets.
 *
 * **This prefix is public**, so unlike a research's prefix the arrival changes what
 * readers can fetch — and it is written down. The record is made where the
 * portal last takes part: when a single PUT is signed, and when a multipart
 * upload is completed. Nothing later reports back, so a signature that was
 * never used leaves a record of an intent rather than of an object.
 */
export async function commonUploadAction(request: Request): Promise<UploadAnswer> {
  const actor = await requireCapability(request, "manage-site-content")
  const body = await uploadBody(request)
  const at = (name: string): ObjectRef => ({ bucket: PUBLIC_BUCKET, key: commonPrefix() + name })
  // Asking changes nothing readers can fetch, so nothing is written down.
  if (body.kind === "check") return alreadyThere(body.names, (name) => [at(name)])
  const ref = at(body.name)

  return signUpload(body, ref, async () => {
    await recordEvent(getDb(), {
      actor: actorOf(actor),
      action: "publish-file",
      subjectType: "file",
      subjectId: ref.key,
    })
  })
}
