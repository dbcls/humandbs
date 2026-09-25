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

import { RESEARCH } from "./anchors"
import {
  acknowledgeDraft,
  deleteComment,
  postAboutDraft,
  postComment,
  readAcknowledgements,
  readComments,
  setCommentResolved,
} from "./comments.server"

/**
 * Comments against the development database.
 *
 * The things worth holding down are that a comment belongs to one draft and
 * cannot be reached through another, that **nothing resolves a comment except
 * somebody deciding to** — editing the value a comment is about is the
 * operation being reviewed, and closing it for them would remove the chance
 * to check it — and that a line of the memo is never a question.
 */
const db = getDb()

const PROVIDER = { sub: null, name: "provider" }
const CURATOR_SUB = "0f3a-1b2c"
const CURATOR = { sub: CURATOR_SUB, name: "curator" }

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

async function draft(): Promise<{ draftId: string, researchId: string }> {
  return createResearchWithDraft(db)
}

async function saidAt(
  draftId: string,
  path: string,
  body = "これは何ですか",
  author: { sub: string | null, name: string } = PROVIDER,
): Promise<string> {
  const outcome = await postComment(db, {
    about: { draftId, content: emptyResearchContent(), datasetIds: [] },
    subject: RESEARCH,
    path,
    author,
    body,
  })
  if (outcome.status !== "posted") throw new Error("the comment was not posted")
  return outcome.commentId
}

describe("a comment", () => {
  it("is shown at its place in the order it was said, with the next one under it rather than inside it", async () => {
    const { draftId } = await draft()
    await saidAt(draftId, "summary.aims", "対象は何名ですか")
    await saidAt(draftId, "summary.aims", "確認します", CURATOR)

    const rows = await readComments(db, draftId)
    expect(rows.map((row) => row.anchor)).toEqual([
      { kind: "research-field", path: "summary.aims" },
      { kind: "research-field", path: "summary.aims" },
    ])
    expect(rows.map((row) => [row.authorName, row.body, row.bySignedIn, row.resolved])).toEqual([
      ["provider", "対象は何名ですか", false, false],
      ["curator", "確認します", true, false],
    ])
  })

  it("is refused at a place the draft does not have, and writes nothing", async () => {
    const { draftId } = await draft()

    const outcome = await postComment(db, {
      about: { draftId, content: emptyResearchContent(), datasetIds: [] },
      subject: RESEARCH,
      path: "nowhere.at.all",
      author: PROVIDER,
      body: "…",
    })

    expect(outcome).toEqual({ status: "no-such-place" })
    expect(await readComments(db, draftId)).toEqual([])
  })

  it("is said about the draft as a whole, or into the memo, with no place to check", async () => {
    const { draftId } = await draft()
    expect((await postAboutDraft(db, { draftId, kind: "draft", author: PROVIDER, body: " 全体について " })).status)
      .toBe("posted")
    expect((await postAboutDraft(db, { draftId, kind: "memo", author: CURATOR, body: "提供者に電話した" })).status)
      .toBe("posted")

    const rows = await readComments(db, draftId)
    expect(rows.map((row) => [row.anchor, row.body])).toEqual([
      [{ kind: "draft" }, "全体について"],
      [{ kind: "memo" }, "提供者に電話した"],
    ])
  })

  it("is not said about a draft that is not there", async () => {
    const { draftId } = await draft()
    await discardDraft(db, { draftId, revision: 1 }, CURATOR)

    expect(await postAboutDraft(db, { draftId, kind: "draft", author: PROVIDER, body: "…" }))
      .toEqual({ status: "gone" })
  })

  it("cannot be closed through another draft's address", async () => {
    const mine = await draft()
    const other = await draft()
    const commentId = await saidAt(mine.draftId, "title")

    expect(await setCommentResolved(db, {
      draftId: other.draftId,
      commentId,
      resolved: true,
      actorSub: CURATOR_SUB,
    })).toEqual({ status: "gone" })

    expect((await readComments(db, mine.draftId))[0]?.resolved).toBe(false)
  })

  it("names the administrator who closed it, and forgets them when it is reopened", async () => {
    const { draftId } = await draft()
    const commentId = await saidAt(draftId, "title")
    await db.insert(s.adminUser).values({ keycloakSub: CURATOR_SUB, displayName: "curator" })

    await setCommentResolved(db, { draftId, commentId, resolved: true, actorSub: CURATOR_SUB })
    expect((await readComments(db, draftId))[0]?.resolvedBy).toBe("curator")

    await setCommentResolved(db, { draftId, commentId, resolved: false, actorSub: CURATOR_SUB })
    const [reopened] = await readComments(db, draftId)
    expect(reopened?.resolved).toBe(false)
    expect(reopened?.resolvedBy).toBe(null)
  })

  it("is resolved on its own, leaving the others at the same place open", async () => {
    const { draftId } = await draft()
    const first = await saidAt(draftId, "title", "一つ目")
    await saidAt(draftId, "title", "二つ目")

    await setCommentResolved(db, { draftId, commentId: first, resolved: true, actorSub: CURATOR_SUB })

    expect((await readComments(db, draftId)).map((row) => [row.body, row.resolved]))
      .toEqual([["一つ目", true], ["二つ目", false]])
  })

  /** A note is not a question: there is nothing about it to close. */
  it("is never resolved when it is a line of the memo", async () => {
    const { draftId } = await draft()
    const outcome = await postAboutDraft(db, { draftId, kind: "memo", author: CURATOR, body: "覚え書き" })
    if (outcome.status !== "posted") throw new Error("the line was not written")

    expect(await setCommentResolved(db, {
      draftId,
      commentId: outcome.commentId,
      resolved: true,
      actorSub: CURATOR_SUB,
    })).toEqual({ status: "gone" })
    expect((await readComments(db, draftId))[0]?.resolved).toBe(false)
  })

  it("is not resolved by editing the value it is about", async () => {
    const { draftId } = await draft()
    await saidAt(draftId, "title")

    await saveDraftContent(db, { draftId, revision: 1 }, {
      content: { ...emptyResearchContent(), title: { ja: filled("答え"), en: filled("") } },
    })

    expect((await readComments(db, draftId))[0]?.resolved).toBe(false)
  })

  /** A draft is not history; nothing that hung off it outlives it. */
  it("goes when the draft it belongs to is thrown away", async () => {
    const { draftId } = await draft()
    await saidAt(draftId, "title")

    await discardDraft(db, { draftId, revision: 1 }, CURATOR)

    expect(await db.select().from(s.comment)).toHaveLength(0)
  })
})

describe("deleting a comment", () => {
  it("takes it away and leaves the others at the same place", async () => {
    const { draftId } = await draft()
    const first = await saidAt(draftId, "title", "一つ目")
    await saidAt(draftId, "title", "二つ目")

    expect(await deleteComment(db, { draftId, commentId: first })).toEqual({ status: "deleted" })
    expect((await readComments(db, draftId)).map((row) => row.body)).toEqual(["二つ目"])
  })

  it("cannot be done through another draft's address", async () => {
    const mine = await draft()
    const other = await draft()
    const commentId = await saidAt(mine.draftId, "title")

    expect(await deleteComment(db, { draftId: other.draftId, commentId })).toEqual({ status: "gone" })
    expect(await readComments(db, mine.draftId)).toHaveLength(1)
  })

  it("has nothing left to take the second time", async () => {
    const { draftId } = await draft()
    const commentId = await saidAt(draftId, "title")
    await deleteComment(db, { draftId, commentId })

    expect(await deleteComment(db, { draftId, commentId })).toEqual({ status: "gone" })
  })

  it("takes a line of the memo, which resolving never touches", async () => {
    const { draftId } = await draft()
    const outcome = await postAboutDraft(db, { draftId, kind: "memo", author: CURATOR, body: "覚え書き" })
    if (outcome.status !== "posted") throw new Error("the line was not written")

    expect(await deleteComment(db, { draftId, commentId: outcome.commentId })).toEqual({ status: "deleted" })
    expect(await readComments(db, draftId)).toHaveLength(0)
  })
})

describe("the indicators a reader leaves on a draft", () => {
  /**
   * A reader presses again on each round of the review, so every press is kept
   * and the screen reads one row per person and button, with how many times.
   */
  it("gathers a signed-in reader's presses of one indicator into one row, counted, under the latest name", async () => {
    const { draftId } = await draft()

    await acknowledgeDraft(db, { draftId, kind: "commented", actor: CURATOR })
    await acknowledgeDraft(db, { draftId, kind: "commented", actor: { ...CURATOR, name: "curator (renamed)" } })
    await acknowledgeDraft(db, { draftId, kind: "approved", actor: CURATOR })

    expect(await db.select().from(s.reviewAcknowledgement)).toHaveLength(3)
    const rows = await readAcknowledgements(db, draftId)
    expect(rows.map((row) => [row.kind, row.name, row.bySignedIn, row.count])).toEqual([
      ["approved", "curator", true, 1],
      ["commented", "curator (renamed)", true, 2],
    ])
  })

  /** One who did not sign in is known by the name they typed, and by nothing else. */
  it("gathers presses under the same typed name, and keeps different names apart", async () => {
    const { draftId } = await draft()

    await acknowledgeDraft(db, { draftId, kind: "approved", actor: PROVIDER })
    await acknowledgeDraft(db, { draftId, kind: "approved", actor: { sub: null, name: "another" } })
    await acknowledgeDraft(db, { draftId, kind: "approved", actor: PROVIDER })

    const rows = await readAcknowledgements(db, draftId)
    expect(rows.map((row) => [row.name, row.count])).toEqual([["provider", 2], ["another", 1]])
    expect(rows.every((row) => !row.bySignedIn)).toBe(true)
  })

  /** Typing a signed-in reader's name does not make an anonymous press theirs. */
  it("keeps a signed-in reader apart from an anonymous one who typed the same name", async () => {
    const { draftId } = await draft()

    await acknowledgeDraft(db, { draftId, kind: "commented", actor: CURATOR })
    await acknowledgeDraft(db, { draftId, kind: "commented", actor: { sub: null, name: CURATOR.name } })

    const rows = await readAcknowledgements(db, draftId)
    expect(rows.map((row) => [row.name, row.bySignedIn, row.count])).toEqual([
      [CURATOR.name, false, 1],
      [CURATOR.name, true, 1],
    ])
  })

  /** The two indicators answer different questions, so one reader has a row under each. */
  it("keeps the two indicators apart for the same reader — a first round's and a second's", async () => {
    const { draftId } = await draft()

    await acknowledgeDraft(db, { draftId, kind: "commented", actor: PROVIDER })
    await acknowledgeDraft(db, { draftId, kind: "approved", actor: PROVIDER })

    const rows = await readAcknowledgements(db, draftId)
    expect(rows.map((row) => [row.kind, row.count])).toEqual([["approved", 1], ["commented", 1]])
  })

  it("goes with the draft, like everything else hung off it", async () => {
    const { draftId } = await draft()
    await acknowledgeDraft(db, { draftId, kind: "commented", actor: PROVIDER })

    await discardDraft(db, { draftId, revision: 1 }, CURATOR)

    expect(await db.select().from(s.reviewAcknowledgement)).toHaveLength(0)
  })
})

describe("reading a draft's comments", () => {
  it("reads only that draft's, so two drafts of one research stay apart", async () => {
    const mine = await draft()
    const other = await draft()
    await saidAt(mine.draftId, "title", "こちら")
    await saidAt(other.draftId, "title", "あちら")

    const rows = await readComments(db, mine.draftId)
    expect(rows.map((row) => row.body)).toEqual(["こちら"])
    expect(await db.select().from(s.comment).where(eq(s.comment.draftId, other.draftId))).toHaveLength(1)
  })
})
