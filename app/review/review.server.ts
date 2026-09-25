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
import { adminDraftReviewPath } from "~/admin/urls"
import { requireCapability } from "~/auth/actor.server"
import { loadConfig, publicOrigin } from "~/config.server"
import { getDb } from "~/db/client.server"
import type { Locale } from "~/i18n/locale"
import { href } from "~/public/urls"

import { isAnchorPath, type AnchorSubject } from "./anchors"
import { checkComment, unresolvedCount, type CommentProblem, type CommentView } from "./comments"
import {
  deleteComment,
  postAboutDraft,
  postComment,
  readAcknowledgements,
  readComments,
  setCommentResolved,
  type AcknowledgementView,
} from "./comments.server"
import { readShare } from "./queries.server"
import { isShareExpired, isShareOpen, shareExpiryDay, shareExpiryOf } from "./share"
import { draftSteps, type DraftStepsView } from "~/admin/steps.server"
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
  /**
   * The address to hand out, whole — the site's public origin and the path, in
   * the language the screen is being read in. **Whole because it is handed out**:
   * pasted into a mail, a path alone opens nothing.
   */
  url: string
  enabled: boolean
  open: boolean
  expired: boolean
  /** `yyyy-mm-dd`, which is what the date input takes. */
  expiresOn: string | null
}

export interface ReviewPageView {
  locale: Locale
  researchId: string
  draftId: string
  humLabel: string | null
  /** The administrator reading it, which is what their replies are signed with. */
  signedInName: string
  share: ShareView
  /**
   * What is still waiting for an answer, as the open-comments panel of the
   * editing screens lists it. The memo is not among them: it is a note, not a
   * question. What has been resolved is read in the panel of its own place.
   */
  comments: CommentView[]
  /** What each of the research's datasets is called, to name the place a comment is about. */
  datasetLabels: Record<string, string | null>
  unresolved: number
  acknowledgements: AcknowledgementView[]
  /** The number of the version the draft updates, which identifies the last step. */
  updating: number | null
  /** The draft's facts (datasets, sharing, publish check), as the research's screen and the header of the editor read them; the share and the threads are this screen's own. */
  steps: DraftStepsView
}

export async function reviewPage(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<ReviewPageView> {
  const { db, actor, researchId, draftId, draft } = await draftOf(request, params)

  const [share, comments, acknowledgements, humLabel, datasets] = await Promise.all([
    readShare(db, draftId),
    readComments(db, draftId),
    readAcknowledgements(db, draftId),
    humLabelOf(db, researchId),
    researchDatasets(db, researchId),
  ])
  if (share === null) notFound()

  const shareNow = shareView(share, locale, publicOrigin(loadConfig(process.env).auth))
  const unresolved = unresolvedCount(comments)
  const steps = await draftSteps(db, researchId, draftId, draft.content, { shared: shareNow.open, unresolved })

  return {
    locale,
    researchId,
    draftId,
    humLabel,
    signedInName: actor.name,
    share: shareNow,
    unresolved,
    comments: comments.filter((one) => one.anchor.kind !== "memo" && !one.resolved),
    datasetLabels: Object.fromEntries(datasets.map((row) => [row.id, row.label])),
    acknowledgements,
    updating: draft.updating?.number ?? null,
    steps,
  }
}

function shareView(
  share: { token: string, enabled: boolean, expiresAt: Date | null },
  locale: Locale,
  origin: string,
): ShareView {
  const now = new Date()
  const policy = { enabled: share.enabled, expiresAt: share.expiresAt }
  return {
    url: new URL(href(locale, previewPath(share.token)), origin).href,
    enabled: share.enabled,
    open: isShareOpen(policy, now),
    expired: isShareExpired(policy, now),
    expiresOn: share.expiresAt === null ? null : shareExpiryDay(share.expiresAt),
  }
}

export type ReviewActionResult
  = | { status: "invalid", problem: CommentProblem }
    | { status: "comments", comments: CommentView[] }

/**
 * Everything the review screen and the editing screens do to a review: change
 * how the draft is shared, and add or close a comment.
 *
 * `answer` decides what a caller gets back. The review screen and the preview
 * are pages and take a redirect, so a browser without JavaScript lands back
 * where it was; the editing screens take the comments, because they are
 * holding unsaved work and must not navigate.
 */
export async function reviewAction(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
  answer: "redirect" | "comments",
): Promise<Response | ReviewActionResult> {
  const { db, actor, researchId, draftId, draft } = await draftOf(request, params)

  const form = await request.formData()
  const intent = form.get("intent")
  const back = (): Response =>
    redirect(href(locale, adminDraftReviewPath(researchId, draftId)))
  const done = async (): Promise<Response | ReviewActionResult> =>
    answer === "redirect" ? back() : { status: "comments", comments: await readComments(db, draftId) }

  // Saving the expiry keeps sharing unchanged; the switch beside it turns
  // sharing on or off and saves the expiry typed with it.
  if (intent === "share" || intent === "share-on" || intent === "share-off") {
    const enabled = intent === "share" ? form.get("enabled") === "on" : intent === "share-on"
    const on = readString(form, "expiresOn")
    const expiresAt = on === "" ? null : shareExpiryOf(on)
    if (on !== "" && expiresAt === null) badRequest()
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
    const commentId = readString(form, "commentId")
    if (commentId === "") badRequest()
    const outcome = await setCommentResolved(db, {
      draftId,
      commentId,
      resolved: intent === "resolve",
      actorSub: actor.sub,
    })
    if (outcome.status === "gone") notFound()
    return done()
  }

  if (intent === "delete") {
    const commentId = readString(form, "commentId")
    if (commentId === "") badRequest()
    const outcome = await deleteComment(db, { draftId, commentId })
    if (outcome.status === "gone") notFound()
    return done()
  }

  if (intent !== "comment") badRequest()

  const body = readString(form, "body")
  const problem = checkComment({ name: actor.name, body })
  if (problem !== null) return { status: "invalid", problem }
  const author = { sub: actor.sub, name: actor.name }

  const subject = readSubject(form)
  if (subject === null) badRequest()

  // The draft as a whole and the memo name no place, so there is no path to
  // check either against.
  if (subject === "draft" || subject === "memo") {
    const outcome = await postAboutDraft(db, { draftId, kind: subject, author, body })
    if (outcome.status === "gone") notFound()
    return done()
  }

  const path = form.get("path")
  if (!isAnchorPath(path)) badRequest()

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

function readSubject(form: FormData): AnchorSubject | "draft" | "memo" | null {
  const subject = form.get("subject")
  if (subject === "draft" || subject === "memo") return subject
  if (subject === "research") return { kind: "research" }
  if (subject !== "dataset") return null
  const datasetId = readString(form, "datasetId")
  return datasetId === "" ? null : { kind: "dataset", datasetId }
}

function readString(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === "string" ? value : ""
}
