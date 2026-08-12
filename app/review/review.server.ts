/**
 * The management side of a review: the link, what has been said, and what is
 * still open.
 *
 * It is one screen per draft rather than one per research, because that is the
 * unit everything here belongs to — a share link points at a draft, a comment
 * is about the text of a draft, and two drafts of one research say different
 * things. Merging them into a research-wide list would lose which of them a
 * remark was about.
 *
 * Comments are also read and answered beside the fields they are about, in the
 * editing screens. That path posts to the same actions through a resource
 * route, because an editor holding unsaved work must not navigate.
 */

import { redirect } from "react-router"

import { reissueShareToken, setDraftSharing } from "~/admin/drafts.server"
import { humLabelOf, readDraft, researchDatasets } from "~/admin/queries.server"
import {
  adminDraftDatasetPath,
  adminDraftPath,
  adminDraftReviewPath,
} from "~/admin/urls"
import { requireCapability } from "~/auth/actor.server"
import { getDb } from "~/db/client.server"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import { isAnchorPath, subjectOf, type AnchorSubject } from "./anchors"
import { byAttention, checkComment, type CommentProblem, type ThreadView } from "./comments"
import {
  readAcknowledgements,
  readThreads,
  replyToThread,
  setThreadResolved,
  postComment,
  type AcknowledgementView,
} from "./comments.server"
import { readShare } from "./queries.server"
import { isShareExpired, isShareOpen } from "./share"
import { previewPath } from "./urls"

function notFound(): never {
  throw new Response(null, { status: 404, statusText: "Not Found" })
}

function badRequest(): never {
  throw new Response(null, { status: 400, statusText: "Bad Request" })
}

/**
 * The draft this screen is for, refused when it is reached under the wrong
 * research. Reading and writing both need `edit-content`: the link and the
 * comments are the draft's, and managing them is editing it.
 */
async function draftOf(
  request: Request,
  params: { researchId: string | undefined, draftId: string | undefined },
) {
  const actor = await requireCapability(request, "edit-content")
  const researchId = params.researchId ?? ""
  const draftId = params.draftId ?? ""
  const db = getDb()
  const draft = await readDraft(db, draftId)
  if (draft?.researchId !== researchId) notFound()
  return { db, actor, researchId, draftId, draft }
}

export interface ShareView {
  /** The address to hand out, in the language the screen is being read in. */
  url: string
  enabled: boolean
  open: boolean
  expired: boolean
  /** `yyyy-mm-dd`, which is what the date input takes. */
  expiresOn: string | null
}

export interface ReviewThreadView {
  thread: ThreadView
  /** What it is about, named as the screen names things. */
  subject: string
  /** Where to go to deal with it. */
  href: string
}

export interface ReviewPageView {
  locale: Locale
  researchId: string
  draftId: string
  humLabel: string | null
  /** The administrator reading it, which is what their replies are signed with. */
  signedInName: string
  share: ShareView
  threads: ReviewThreadView[]
  unresolved: number
  acknowledgements: AcknowledgementView[]
}

export async function reviewPage(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<ReviewPageView> {
  const { db, actor, researchId, draftId } = await draftOf(request, params)

  const [share, threads, acknowledgements, humLabel, datasets] = await Promise.all([
    readShare(db, draftId),
    readThreads(db, draftId),
    readAcknowledgements(db, draftId),
    humLabelOf(db, researchId),
    researchDatasets(db, researchId),
  ])
  if (share === null) notFound()

  const t = messagesFor(locale)
  const labelOf = new Map(datasets.map((row) => [row.id, row.label]))

  return {
    locale,
    researchId,
    draftId,
    humLabel,
    signedInName: actor.name,
    share: shareView(share, locale),
    unresolved: threads.filter((thread) => !thread.resolved).length,
    threads: byAttention(threads).map((thread) => {
      const subject = subjectOf(thread.anchor)
      return {
        thread,
        subject: subject.kind === "research"
          ? t.admin.review.research
          : labelOf.get(subject.datasetId) ?? t.preview.unnamedDataset,
        href: subject.kind === "research"
          ? href(locale, adminDraftPath(researchId, draftId))
          : href(locale, adminDraftDatasetPath(researchId, draftId, subject.datasetId)),
      }
    }),
    acknowledgements,
  }
}

function shareView(
  share: { token: string, enabled: boolean, expiresAt: Date | null },
  locale: Locale,
): ShareView {
  const now = new Date()
  const policy = { enabled: share.enabled, expiresAt: share.expiresAt }
  return {
    url: href(locale, previewPath(share.token)),
    enabled: share.enabled,
    open: isShareOpen(policy, now),
    expired: isShareExpired(policy, now),
    expiresOn: share.expiresAt === null ? null : share.expiresAt.toISOString().slice(0, 10),
  }
}

export type ReviewActionResult
  = | { status: "invalid", problem: CommentProblem }
    | { status: "threads", threads: ThreadView[] }

/**
 * Everything the review screen and the editing screens do to a review: change
 * how the draft is shared, and add to or close a thread.
 *
 * `answer` decides what a caller gets back. The review screen and the preview
 * are pages and take a redirect, so a browser without JavaScript lands back
 * where it was; the editing screens take the threads, because they are holding
 * unsaved work and must not navigate.
 */
export async function reviewAction(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
  answer: "redirect" | "threads",
): Promise<Response | ReviewActionResult> {
  const { db, actor, researchId, draftId, draft } = await draftOf(request, params)

  const form = await request.formData()
  const intent = form.get("intent")
  const back = (): Response =>
    redirect(href(locale, adminDraftReviewPath(researchId, draftId)))
  const done = async (): Promise<Response | ReviewActionResult> =>
    answer === "redirect" ? back() : { status: "threads", threads: await readThreads(db, draftId) }

  if (intent === "share") {
    const enabled = form.get("enabled") === "on"
    const on = readString(form, "expiresOn")
    const expiresAt = on === "" ? null : new Date(`${on}T23:59:59Z`)
    if (expiresAt !== null && Number.isNaN(expiresAt.getTime())) badRequest()
    const outcome = await setDraftSharing(db, draftId, { enabled, expiresAt })
    if (outcome.status === "gone") notFound()
    return back()
  }

  if (intent === "reissue") {
    const outcome = await reissueShareToken(db, draftId)
    if (outcome.status === "gone") notFound()
    return back()
  }

  if (intent === "resolve" || intent === "reopen") {
    const threadId = readString(form, "threadId")
    if (threadId === "") badRequest()
    const outcome = await setThreadResolved(db, {
      draftId,
      threadId,
      resolved: intent === "resolve",
      actorSub: actor.sub,
    })
    if (outcome.status === "gone") notFound()
    return done()
  }

  const body = readString(form, "body")
  const problem = checkComment({ name: actor.name, body })
  if (problem !== null) return { status: "invalid", problem }
  const author = { sub: actor.sub, name: actor.name }

  if (intent === "reply") {
    const threadId = readString(form, "threadId")
    if (threadId === "") badRequest()
    const outcome = await replyToThread(db, { draftId, threadId, author, body: body.trim() })
    if (outcome.status === "gone") notFound()
    return done()
  }

  if (intent !== "comment") badRequest()

  const path = form.get("path")
  if (!isAnchorPath(path)) badRequest()
  const subject = readSubject(form)
  if (subject === null) badRequest()

  const outcome = await postComment(db, {
    about: {
      draftId,
      content: draft.content,
      // An administrator may comment on a dataset of this research whether or
      // not the version lists it: the editing screens show all of them.
      datasetIds: (await researchDatasets(db, researchId)).map((row) => row.id),
    },
    subject,
    path,
    author,
    body,
  })
  if (outcome.status === "no-such-place") badRequest()
  if (outcome.status === "gone") notFound()
  return done()
}

function readSubject(form: FormData): AnchorSubject | null {
  const subject = form.get("subject")
  if (subject === "research") return { kind: "research" }
  if (subject !== "dataset") return null
  const datasetId = readString(form, "datasetId")
  return datasetId === "" ? null : { kind: "dataset", datasetId }
}

function readString(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === "string" ? value : ""
}
