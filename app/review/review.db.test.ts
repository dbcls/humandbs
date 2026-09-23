import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createResearchWithDraft } from "~/admin/drafts.server"
import { grantAdmin } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { createSession, sessionCookie } from "~/auth/session.server"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { RESEARCH, anchorOf } from "./anchors"
import { postAboutDraft, readComments } from "./comments.server"
import { readShare } from "./queries.server"
import { reviewAction, reviewPage } from "./review.server"

/**
 * The management side of a review, with its guard on.
 *
 * Managing the link and closing a comment are editing the draft, so both ask
 * for `edit-content`; a signed-in reader without it gets 403 rather than a
 * redirect, because signing in again would not change the answer.
 *
 * The same action serves two callers and answers them differently: the review
 * screen takes a redirect, and an editing screen takes the comments, because
 * it is holding unsaved work and must not navigate.
 */
const db = getDb()

/** Something a provider said at a place, put there directly: what the screen finds, not how it got there. */
async function saidAt(draftId: string, path: string, body: string): Promise<string> {
  const [row] = await db
    .insert(s.comment)
    .values({ draftId, anchor: anchorOf(RESEARCH, path), authorName: "provider", body })
    .returning({ id: s.comment.id })
  if (row === undefined) throw new Error("the comment was not written")
  return row.id
}

const CURATOR = { sub: "0f3a-1b2c", name: "curator", idToken: "an-id-token" }
const READER = { sub: "9c8b-7a6d", name: "somebody", idToken: "another-id-token" }

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

async function signIn(person: typeof CURATOR, admin: boolean): Promise<string> {
  const token = await createSession(db, person)
  if (admin) await grantAdmin(db, BOOTSTRAP_ACTOR, person)
  return token
}

function cookieOf(token: string): string {
  return sessionCookie(token).split(";")[0] ?? ""
}

function get(token: string): Request {
  return new Request("http://localhost:8080/admin", {
    headers: new Headers({ cookie: cookieOf(token) }),
  })
}

function postForm(token: string, fields: Record<string, string>): Request {
  return new Request("http://localhost:8080/admin", {
    method: "POST",
    headers: new Headers({
      "content-type": "application/x-www-form-urlencoded",
      "cookie": cookieOf(token),
    }),
    body: new URLSearchParams(fields).toString(),
  })
}

async function thrown(work: () => Promise<unknown>): Promise<Response> {
  const result = await work().then(() => null, (error: unknown) => error)
  if (!(result instanceof Response)) throw new Error("expected a Response to be thrown")
  return result
}

describe("the review screen", () => {
  it("is refused to somebody signed in without the capability to edit", async () => {
    const created = await createResearchWithDraft(db)
    const token = await signIn(READER, false)

    const refusal = await thrown(() => reviewPage(get(token), "ja", {
      researchId: created.researchId,
      draftId: created.draftId,
    }))
    expect(refusal.status).toBe(403)
  })

  it("is refused when the draft is reached under another research", async () => {
    const mine = await createResearchWithDraft(db)
    const other = await createResearchWithDraft(db)
    const token = await signIn(CURATOR, true)

    const refusal = await thrown(() => reviewPage(get(token), "ja", {
      researchId: other.researchId,
      draftId: mine.draftId,
    }))
    expect(refusal.status).toBe(404)
  })

  it("shows the link, what has been said, and where each comment has to be dealt with", async () => {
    const created = await createResearchWithDraft(db)
    await saidAt(created.draftId, "summary.aims", "対象は何名ですか")
    const token = await signIn(CURATOR, true)

    const view = await reviewPage(get(token), "ja", created)
    expect(view.share.open).toBe(false)
    expect(view.share.url).toContain("/preview/")
    expect(view.unresolved).toBe(1)
    expect(view.comments[0]?.href).toContain(`/draft/${created.draftId}`)
    expect(view.comments[0]?.comment.anchor).toEqual({
      kind: "research-field",
      path: "summary.aims",
    })
  })

  /** The memo is the editing screen's note, not a question the list is for. */
  it("lists what was said about the whole, and leaves the memo out", async () => {
    const created = await createResearchWithDraft(db)
    await postAboutDraft(db, { draftId: created.draftId, kind: "draft", author: { sub: null, name: "provider" }, body: "全体" })
    await postAboutDraft(db, { draftId: created.draftId, kind: "memo", author: { sub: CURATOR.sub, name: CURATOR.name }, body: "覚え書き" })
    const token = await signIn(CURATOR, true)

    const view = await reviewPage(get(token), "ja", created)
    expect(view.comments.map((row) => [row.comment.body, row.path])).toEqual([["全体", null]])
    expect(view.unresolved).toBe(1)
  })
})

describe("what the review screen does", () => {
  it("turns sharing on with a date, and off again without losing the address", async () => {
    const created = await createResearchWithDraft(db)
    const token = await signIn(CURATOR, true)
    const before = await readShare(db, created.draftId)

    await reviewAction(
      postForm(token, { intent: "share", enabled: "on", expiresOn: "2026-12-31" }),
      "ja",
      created,
      "redirect",
    )
    const shared = await readShare(db, created.draftId)
    expect(shared?.enabled).toBe(true)
    expect(shared?.expiresAt?.toISOString().slice(0, 10)).toBe("2026-12-31")

    await reviewAction(postForm(token, { intent: "share" }), "ja", created, "redirect")
    const closed = await readShare(db, created.draftId)
    expect(closed?.enabled).toBe(false)
    expect(closed?.expiresAt).toBe(null)
    expect(closed?.token).toBe(before?.token)
  })

  it("mints a different address when the token is reissued", async () => {
    const created = await createResearchWithDraft(db)
    const token = await signIn(CURATOR, true)
    const before = await readShare(db, created.draftId)

    await reviewAction(postForm(token, { intent: "reissue" }), "ja", created, "redirect")

    expect((await readShare(db, created.draftId))?.token).not.toBe(before?.token)
  })

  it("closes a comment in the name of the administrator who closed it", async () => {
    const created = await createResearchWithDraft(db)
    const commentId = await saidAt(created.draftId, "title", "…")
    const token = await signIn(CURATOR, true)

    await reviewAction(
      postForm(token, { intent: "resolve", commentId }),
      "ja",
      created,
      "redirect",
    )

    const [one] = await readComments(db, created.draftId)
    expect(one?.resolved).toBe(true)
    expect(one?.resolvedBy).toBe("curator")
  })

  /** What an open editor needs back: the comments, and no navigation. */
  it("answers an editing screen with the comments rather than with a redirect", async () => {
    const created = await createResearchWithDraft(db)
    const token = await signIn(CURATOR, true)

    const outcome = await reviewAction(
      postForm(token, { intent: "comment", subject: "research", path: "title", body: "直します" }),
      "ja",
      created,
      "comments",
    )

    expect(outcome).not.toBeInstanceOf(Response)
    expect(outcome).toMatchObject({ status: "comments" })
    if (outcome instanceof Response || outcome.status !== "comments") throw new Error("no comments")
    expect(outcome.comments[0]?.authorName).toBe("curator")
    expect(outcome.comments[0]?.bySignedIn).toBe(true)
  })

  it("writes a line of the memo from the editing screen, which no share link can", async () => {
    const created = await createResearchWithDraft(db)
    const token = await signIn(CURATOR, true)

    const outcome = await reviewAction(
      postForm(token, { intent: "comment", subject: "memo", body: "提供者に電話した" }),
      "ja",
      created,
      "comments",
    )

    if (outcome instanceof Response || outcome.status !== "comments") throw new Error("no comments")
    expect(outcome.comments.map((one) => [one.anchor, one.body])).toEqual([[{ kind: "memo" }, "提供者に電話した"]])
  })

  it("refuses an anchor that leads nowhere in the draft", async () => {
    const created = await createResearchWithDraft(db)
    const token = await signIn(CURATOR, true)

    const refusal = await thrown(() => reviewAction(
      postForm(token, { intent: "comment", subject: "research", path: "nowhere", body: "…" }),
      "ja",
      created,
      "comments",
    ))
    expect(refusal.status).toBe(400)
    expect(await readComments(db, created.draftId)).toEqual([])
  })
})
