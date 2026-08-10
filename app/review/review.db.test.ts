import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createResearchWithDraft } from "~/admin/drafts.server"
import { grantAdmin } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { createSession, sessionCookie } from "~/auth/session.server"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"

import { RESEARCH, anchorOf } from "./anchors"
import { readThreads } from "./comments.server"
import { startThread } from "./comments.server"
import { readShare } from "./queries.server"
import { reviewAction, reviewPage } from "./review.server"

/**
 * The management side of a review, with its guard on.
 *
 * Managing the link and closing a thread are editing the draft, so both ask for
 * `edit-content`; a signed-in reader without it gets 403 rather than a redirect,
 * because signing in again would not change the answer.
 *
 * The same action serves two callers and answers them differently: the review
 * screen takes a redirect, and an editing screen takes the threads, because it
 * is holding unsaved work and must not navigate.
 */
const db = getDb()

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

  it("shows the link, what has been said, and where each thread has to be dealt with", async () => {
    const created = await createResearchWithDraft(db)
    await startThread(db, {
      draftId: created.draftId,
      anchor: anchorOf(RESEARCH, "summary.aims"),
      author: { sub: null, name: "provider" },
      body: "対象は何名ですか",
    })
    const token = await signIn(CURATOR, true)

    const view = await reviewPage(get(token), "ja", created)
    expect(view.share.open).toBe(false)
    expect(view.share.url).toContain("/preview/")
    expect(view.unresolved).toBe(1)
    expect(view.threads[0]?.href).toContain(`/draft/${created.draftId}`)
    expect(view.threads[0]?.thread.anchor).toEqual({
      kind: "research-field",
      path: "summary.aims",
    })
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

  it("closes a thread in the name of the administrator who closed it", async () => {
    const created = await createResearchWithDraft(db)
    const started = await startThread(db, {
      draftId: created.draftId,
      anchor: anchorOf(RESEARCH, "title"),
      author: { sub: null, name: "provider" },
      body: "…",
    })
    if (started.status !== "posted") throw new Error("the thread was not started")
    const token = await signIn(CURATOR, true)

    await reviewAction(
      postForm(token, { intent: "resolve", threadId: started.threadId }),
      "ja",
      created,
      "redirect",
    )

    const [thread] = await readThreads(db, created.draftId)
    expect(thread?.resolved).toBe(true)
    expect(thread?.resolvedBy).toBe("curator")
  })

  /** What an open editor needs back: the threads, and no navigation. */
  it("answers an editing screen with the threads rather than with a redirect", async () => {
    const created = await createResearchWithDraft(db)
    const token = await signIn(CURATOR, true)

    const outcome = await reviewAction(
      postForm(token, { intent: "comment", subject: "research", path: "title", body: "直します" }),
      "ja",
      created,
      "threads",
    )

    expect(outcome).not.toBeInstanceOf(Response)
    expect(outcome).toMatchObject({ status: "threads" })
    if (outcome instanceof Response || outcome.status !== "threads") throw new Error("no threads")
    expect(outcome.threads[0]?.comments[0]?.authorName).toBe("curator")
    expect(outcome.threads[0]?.comments[0]?.bySignedIn).toBe(true)
  })

  it("refuses an anchor that leads nowhere in the draft", async () => {
    const created = await createResearchWithDraft(db)
    const token = await signIn(CURATOR, true)

    const refusal = await thrown(() => reviewAction(
      postForm(token, { intent: "comment", subject: "research", path: "nowhere", body: "…" }),
      "ja",
      created,
      "threads",
    ))
    expect(refusal.status).toBe(400)
    expect(await readThreads(db, created.draftId)).toEqual([])
  })
})
