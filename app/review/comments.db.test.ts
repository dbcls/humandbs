import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  createResearchWithDraft,
  discardDraft,
  saveDraftContent,
} from "~/admin/drafts.server"
import { emptyResearchContent, filled } from "~/content/empty"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { RESEARCH, anchorOf } from "./anchors"
import {
  acknowledgeDraft,
  readAcknowledgements,
  readThreads,
  replyToThread,
  setThreadResolved,
  startThread,
} from "./comments.server"

/**
 * Comments against the development database.
 *
 * The two things worth holding down are that a thread belongs to one draft and
 * cannot be reached through another, and that **nothing resolves a thread
 * except somebody deciding to** — editing the value a comment is about is the
 * operation being reviewed, and closing the thread for them would remove the
 * chance to check it.
 */
const db = getDb()

const PROVIDER = { sub: null, name: "provider" }
const CURATOR_SUB = "0f3a-1b2c"

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

async function draft(): Promise<{ draftId: string, researchId: string }> {
  return createResearchWithDraft(db)
}

async function startedOn(draftId: string, path: string, body = "これは何ですか"): Promise<string> {
  const outcome = await startThread(db, {
    draftId,
    anchor: anchorOf(RESEARCH, path),
    author: PROVIDER,
    body,
  })
  if (outcome.status !== "posted") throw new Error("the thread was not started")
  return outcome.threadId
}

describe("a thread", () => {
  it("is created with the first comment on it, in the order they were written", async () => {
    const { draftId } = await draft()
    const threadId = await startedOn(draftId, "summary.aims", "対象は何名ですか")
    await replyToThread(db, {
      draftId,
      threadId,
      author: { sub: CURATOR_SUB, name: "curator" },
      body: "確認します",
    })

    const [thread] = await readThreads(db, draftId)
    expect(thread?.anchor).toEqual({ kind: "research-field", path: "summary.aims" })
    expect(thread?.resolved).toBe(false)
    expect(thread?.comments.map((row) => [row.authorName, row.body, row.bySignedIn])).toEqual([
      ["provider", "対象は何名ですか", false],
      ["curator", "確認します", true],
    ])
  })

  it("cannot be answered or closed through another draft's address", async () => {
    const mine = await draft()
    const other = await draft()
    const threadId = await startedOn(mine.draftId, "title")

    expect(await replyToThread(db, {
      draftId: other.draftId,
      threadId,
      author: PROVIDER,
      body: "…",
    })).toEqual({ status: "gone" })
    expect(await setThreadResolved(db, {
      draftId: other.draftId,
      threadId,
      resolved: true,
      actorSub: CURATOR_SUB,
    })).toEqual({ status: "gone" })

    const [thread] = await readThreads(db, mine.draftId)
    expect(thread?.comments).toHaveLength(1)
    expect(thread?.resolved).toBe(false)
  })

  it("names the administrator who closed it, and forgets them when it is reopened", async () => {
    const { draftId } = await draft()
    const threadId = await startedOn(draftId, "title")
    await db.insert(s.adminUser).values({ keycloakSub: CURATOR_SUB, displayName: "curator" })

    await setThreadResolved(db, { draftId, threadId, resolved: true, actorSub: CURATOR_SUB })
    expect((await readThreads(db, draftId))[0]?.resolvedBy).toBe("curator")

    await setThreadResolved(db, { draftId, threadId, resolved: false, actorSub: CURATOR_SUB })
    const [reopened] = await readThreads(db, draftId)
    expect(reopened?.resolved).toBe(false)
    expect(reopened?.resolvedBy).toBe(null)
  })

  it("is not resolved by editing the value it is about", async () => {
    const { draftId } = await draft()
    await startedOn(draftId, "title")

    await saveDraftContent(db, { draftId, revision: 1 }, {
      note: "",
      content: { ...emptyResearchContent(), title: { ja: filled("答え"), en: filled("") } },
    })

    expect((await readThreads(db, draftId))[0]?.resolved).toBe(false)
  })

  /** A draft is not history; nothing that hung off it outlives it. */
  it("goes when the draft it belongs to is thrown away", async () => {
    const { draftId } = await draft()
    await startedOn(draftId, "title")

    await discardDraft(db, { draftId, revision: 1 }, { sub: CURATOR_SUB, name: "curator" })

    expect(await db.select().from(s.commentThread)).toHaveLength(0)
    expect(await db.select().from(s.comment)).toHaveLength(0)
  })
})

describe("saying that you have looked at a draft", () => {
  it("keeps one note per signed-in reader, however often they say it", async () => {
    const { draftId } = await draft()
    const reader = { sub: CURATOR_SUB, name: "curator" }

    await acknowledgeDraft(db, { draftId, actor: reader })
    await acknowledgeDraft(db, { draftId, actor: { ...reader, name: "curator (renamed)" } })

    const rows = await readAcknowledgements(db, draftId)
    expect(rows.map((row) => [row.name, row.bySignedIn])).toEqual([["curator (renamed)", true]])
  })

  /** There is nothing to recognise an anonymous reader by, so nothing is merged. */
  it("keeps every note from readers who did not sign in", async () => {
    const { draftId } = await draft()

    await acknowledgeDraft(db, { draftId, actor: PROVIDER })
    await acknowledgeDraft(db, { draftId, actor: { sub: null, name: "another" } })

    const rows = await readAcknowledgements(db, draftId)
    expect(rows.map((row) => row.name)).toEqual(["provider", "another"])
    expect(rows.every((row) => !row.bySignedIn)).toBe(true)
  })

  it("goes with the draft, like everything else hung off it", async () => {
    const { draftId } = await draft()
    await acknowledgeDraft(db, { draftId, actor: PROVIDER })

    await discardDraft(db, { draftId, revision: 1 }, { sub: CURATOR_SUB, name: "curator" })

    expect(await db.select().from(s.reviewAcknowledgement)).toHaveLength(0)
  })
})

describe("reading a draft's threads", () => {
  it("reads only that draft's, so two drafts of one research stay apart", async () => {
    const mine = await draft()
    const other = await draft()
    await startedOn(mine.draftId, "title", "こちら")
    await startedOn(other.draftId, "title", "あちら")

    const rows = await readThreads(db, mine.draftId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.comments[0]?.body).toBe("こちら")
    expect(await db.select().from(s.commentThread).where(eq(s.commentThread.draftId, other.draftId)))
      .toHaveLength(1)
  })
})
