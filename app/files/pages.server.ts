/**
 * What the box screen loads, and what its forms and its uploads do.
 *
 * **The bytes never come through here.** An upload asks for a signature, puts
 * straight to the store and says nothing afterwards: the bucket a file sits in
 * is the whole of its state, so there is nothing to write down when one arrives
 * (docs/files.md).
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
import { getDb } from "~/db/client.server"
import type { Locale } from "~/i18n/locale"
import { isPageSize, PAGE_SIZE, type PageSize } from "~/search/page-size"
import { href } from "~/public/urls"

import { adminContentFilesPath, adminResearchFilesPath } from "~/admin/urls"
import { humLabelOf } from "~/admin/queries.server"

import {
  commonPrefix,
  isFileSlug,
  isUploadableName,
  MULTIPART_PART_SIZE,
  MULTIPART_THRESHOLD,
  BOX_SORT,
  type BoxSortKey,
  isBoxSortKey,
  pageOfBox,
  privatePrefix,
  PRIVATE_BUCKET,
  publicPrefix,
  PUBLIC_BUCKET,
  sortedBox,
  type BoxEntry,
  type StoredNode,
} from "./box"
import { boxesOf, forgetSwitches, switchFiles, type SwitchRequest } from "./jobs.server"
import { adminBox, commonBox } from "./listing.server"
import { wakeFileRunner } from "./runner.server"
import {
  abortMultipart,
  beginMultipart,
  completeMultipart,
  copyObject,
  deleteObject,
  objectExists,
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

/** What a box listing reads from its address. */
const LISTING_SETTINGS = ["sort", "order", "size", "page"] as const

/**
 * The listing an operation on its rows answers with: the one it was sent from.
 *
 * **The ordering, the page size and the page come back with it.** The forms on
 * a listing post to the address they stand on, so what the reader chose is in
 * the request's own query; dropping it put a reader who had asked for fifty rows
 * back on twenty after every delete. Only the listing's settings are carried —
 * the rest of a query is not the listing's to keep. A page the operation emptied
 * is the listing's to settle, the way it settles any page past the end.
 */
function backToListing(request: Request, locale: Locale, path: string): Response {
  const asked = new URL(request.url).searchParams
  const kept = new URLSearchParams()
  for (const name of LISTING_SETTINGS) {
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
  /** Null when the store did not answer; the screen says so and offers nothing. */
  rows: BoxEntry[] | null
  sort: BoxSortKey
  order: "asc" | "desc"
  size: PageSize
  total: number
  page: number
  pageCount: number
  /** 1-based positions of the shown rows within the whole box. */
  rangeFrom: number
  rangeTo: number
  /** How many switches have not finished, over the whole box rather than the page. */
  switching: number
  totalBytes: number
  /** Above this an upload is cut into parts, and each part is this many bytes. */
  multipartThreshold: number
  partSize: number
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
  const box = await adminBox(db, id, humLabel)

  const asked = new URL(request.url).searchParams
  // Unreadable is the default rather than a refusal, for the reason the
  // `common/` box reads its own address that way.
  const sort = isBoxSortKey(asked.get("sort")) ? asked.get("sort") as BoxSortKey : BOX_SORT
  const order = asked.get("order") === "desc" ? "desc" : "asc"
  const chosen = Number(asked.get("size") ?? "")
  const size = isPageSize(chosen) ? chosen : PAGE_SIZE
  const wanted = Number(asked.get("page") ?? "1")
  const page = pageOfBox(sortedBox(box ?? [], sort, order), Number.isInteger(wanted) ? wanted : 1, size)

  return {
    locale,
    researchId: id,
    humLabel,
    rows: box === null ? null : page.rows,
    sort,
    order,
    size,
    total: page.total,
    page: page.page,
    pageCount: page.pageCount,
    rangeFrom: page.rangeFrom,
    rangeTo: page.rangeTo,
    switching: (box ?? []).filter((entry) => entry.pending !== null).length,
    totalBytes: (box ?? []).reduce((sum, entry) => sum + entry.size, 0),
    multipartThreshold: MULTIPART_THRESHOLD,
    partSize: MULTIPART_PART_SIZE,
  }
}

export type FilesActionResult
  = | { status: "no-box" }
    | { status: "nothing-selected" }
    | { status: "malformed-slug" }
    | { status: "slug-taken" }

/**
 * Switching a selection of files, and deleting one. Both name the files by the
 * checkboxes that were ticked, so both are the same shape of post.
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
  const names = form.getAll("name").flatMap((value) => typeof value === "string" ? [value] : [])
  if (names.length === 0) return { status: "nothing-selected" }

  const back = backToListing(request, locale, adminResearchFilesPath(id))

  if (intent === "publish" || intent === "unpublish") {
    // Nowhere to put a public copy. Refused here rather than left to fail in
    // the queue, where nobody would be looking.
    if (intent === "publish" && humLabel === null) return { status: "no-box" }
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
  await deleteFiles(id, names, actorOf(actor))
  return back
}

function actorOf(actor: { sub: string, name: string }): EventActor {
  return { sub: actor.sub, name: actor.name }
}

/**
 * Take the file away, wherever it is. Every box the research has ever held is
 * cleared, because a copy left in a retired one would still answer at its old
 * address.
 */
async function deleteFiles(
  researchId: string,
  names: readonly string[],
  actor: EventActor,
): Promise<void> {
  const db = getDb()
  const boxes = await boxesOf(db, researchId)
  const labels = [...(boxes.primary === null ? [] : [boxes.primary]), ...boxes.others]

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
    await forgetSwitches(tx, researchId, names)
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
}

/**
 * What an upload asks for.
 *
 * The name, the size and the content type are all settled before a URL exists,
 * because all three go into the signature: that is the only limit that can be
 * placed on a transfer the application does not see.
 */
const uploadRequest = z.discriminatedUnion("kind", [
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

export type UploadAnswer
  = | { kind: "single", url: string }
    | { kind: "begin", uploadId: string, urls: string[] }
    | { kind: "done" }

/** What an upload asked for, or a 400 for a body no signature can be made from. */
async function uploadBody(request: Request): Promise<UploadPayload> {
  const payload = uploadRequest.safeParse(await request.json())
  if (!payload.success) badRequest()
  if (!isUploadableName(payload.data.name)) badRequest()
  return payload.data
}

/**
 * The four steps an upload can ask for, against an object already decided on.
 *
 * **Both boxes sign the same way** and differ only in where the object lands
 * and in whether its arrival is written down, so what a signature covers — the
 * type, the size, the part count — is settled here rather than once per box.
 * `arrived` runs at the two moments the portal last takes part in an upload.
 */
async function signUpload(
  body: UploadPayload,
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
  return signUpload(body, { bucket: PRIVATE_BUCKET, key: privatePrefix(id) + body.name })
}

export interface CommonFilesView {
  locale: Locale
  /** Null when the store did not answer; the screen says so and offers nothing. */
  rows: StoredNode[] | null
  sort: BoxSortKey
  order: "asc" | "desc"
  size: PageSize
  total: number
  page: number
  pageCount: number
  /** 1-based positions of the shown rows within the whole box. */
  rangeFrom: number
  rangeTo: number
  multipartThreshold: number
  partSize: number
}

/**
 * The article assets. One box, one bucket, no switching: what is here is public,
 * so the only operations are putting a file in and taking one out.
 */
export async function commonFilesPage(
  request: Request,
  locale: Locale,
): Promise<CommonFilesView> {
  await requireCapability(request, "manage-site-content")

  const box = await commonBox()
  const asked = new URL(request.url).searchParams
  /*
    **Anything unreadable is the default rather than a refusal.** These three
    are typed into the address by hand as often as they are pressed, and a
    listing that answers 400 to a mistyped ordering loses the reader the page
    they were on.
  */
  const sort = isBoxSortKey(asked.get("sort")) ? asked.get("sort") as BoxSortKey : BOX_SORT
  const order = asked.get("order") === "desc" ? "desc" : "asc"
  const chosen = Number(asked.get("size") ?? "")
  const size = isPageSize(chosen) ? chosen : PAGE_SIZE
  const wanted = Number(asked.get("page") ?? "1")
  const page = pageOfBox(sortedBox(box ?? [], sort, order), Number.isInteger(wanted) ? wanted : 1, size)

  return {
    locale,
    rows: box === null ? null : page.rows,
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

  return backToListing(request, locale, adminContentFilesPath())
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
 * **The address the file used to answer at stops answering**, which is the same
 * break deleting one makes, so it is written down the same way
 * (docs/publishing.md の「証跡」).
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
  if (slug === from) return backToListing(request, locale, adminContentFilesPath())

  const at = (name: string): ObjectRef => ({ bucket: PUBLIC_BUCKET, key: commonPrefix() + name })
  if (await objectExists(at(slug))) return { status: "slug-taken" }

  await copyObject(at(from), at(slug))
  await deleteObject(at(from))
  // **The move is written as the two things it does to a reader**: one address
  // starts answering and the other stops. What the trail records is what can be
  // fetched (docs/publishing.md の「証跡」), and those are exactly the two events
  // there are names for.
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

  return backToListing(request, locale, adminContentFilesPath())
}

/**
 * The signatures for one upload into the article assets.
 *
 * **This box is public**, so unlike a research's box the arrival changes what
 * readers can fetch — and it is written down. The record is made where the
 * portal last takes part: when a single PUT is signed, and when a multipart
 * upload is completed. Nothing later reports back, so a signature that was
 * never used leaves a record of an intent rather than of an object
 * (docs/publishing.md の「証跡」).
 */
export async function commonUploadAction(request: Request): Promise<UploadAnswer> {
  const actor = await requireCapability(request, "manage-site-content")
  const body = await uploadBody(request)
  const ref: ObjectRef = { bucket: PUBLIC_BUCKET, key: commonPrefix() + body.name }

  return signUpload(body, ref, async () => {
    await recordEvent(getDb(), {
      actor: actorOf(actor),
      action: "publish-file",
      subjectType: "file",
      subjectId: ref.key,
    })
  })
}
