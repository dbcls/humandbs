/**
 * What the box screen loads, and what its forms and its uploads do.
 *
 * **The bytes never come through here.** An upload asks for a signature, puts
 * straight to the store and says nothing afterwards: the bucket a file sits in
 * is the whole of its state, so there is nothing to write down when one arrives
 * (docs/data-model.md の「ファイル」).
 *
 * Switching and deleting are ordinary form posts, and both take several files
 * at once — a switch is a copy of the actual bytes and is therefore queued, so
 * the screen never waits for one.
 */

import { redirect } from "react-router"
import { z } from "zod"

import { requireCapability } from "~/auth/actor.server"
import { recordEvent, type EventActor } from "~/auth/events.server"
import { getDb } from "~/db/client.server"
import type { Locale } from "~/i18n/locale"
import { href } from "~/public/urls"

import { adminResearchFilesPath } from "~/admin/urls"
import { humLabelOf } from "~/admin/queries.server"

import {
  isUploadableName,
  MULTIPART_PART_SIZE,
  MULTIPART_THRESHOLD,
  pageOfBox,
  privatePrefix,
  PRIVATE_BUCKET,
  publicPrefix,
  PUBLIC_BUCKET,
  type BoxEntry,
} from "./box"
import { boxesOf, forgetSwitches, switchFiles, type SwitchRequest } from "./jobs.server"
import { adminBox } from "./listing.server"
import { wakeFileRunner } from "./runner.server"
import {
  abortMultipart,
  beginMultipart,
  completeMultipart,
  deleteObject,
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
  total: number
  page: number
  pageCount: number
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

  const wanted = Number(new URL(request.url).searchParams.get("page") ?? "1")
  const page = pageOfBox(box ?? [], Number.isInteger(wanted) ? wanted : 1)

  return {
    locale,
    researchId: id,
    humLabel,
    rows: box === null ? null : page.rows,
    total: page.total,
    page: page.page,
    pageCount: page.pageCount,
    switching: (box ?? []).filter((entry) => entry.pending !== null).length,
    totalBytes: (box ?? []).reduce((sum, entry) => sum + entry.size, 0),
    multipartThreshold: MULTIPART_THRESHOLD,
    partSize: MULTIPART_PART_SIZE,
  }
}

export type FilesActionResult
  = | { status: "no-box" }
    | { status: "nothing-selected" }

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

  const back = redirect(href(locale, adminResearchFilesPath(id)))

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

export type UploadAnswer
  = | { kind: "single", url: string }
    | { kind: "begin", uploadId: string, urls: string[] }
    | { kind: "done" }

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

  const payload = uploadRequest.safeParse(await request.json())
  if (!payload.success) badRequest()
  const body = payload.data
  if (!isUploadableName(body.name)) badRequest()

  const ref: ObjectRef = {
    bucket: PRIVATE_BUCKET,
    key: privatePrefix(id) + body.name,
  }

  if (body.kind === "single") {
    if (body.size > MULTIPART_THRESHOLD) badRequest()
    return {
      kind: "single",
      url: await presignPut(ref, { contentType: body.contentType, size: body.size }),
    }
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
    return { kind: "done" }
  }
  await abortMultipart(ref, body.uploadId)
  return { kind: "done" }
}
