import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createResearchWithDraft, reissueShareToken, setDraftSharing } from "~/admin/drafts.server"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { sharedDraftByToken } from "./access.server"

/**
 * The gate every unauthenticated read of a draft goes through.
 *
 * All of it is the negative side. A link that is private, one whose date has
 * gone by and one built on a token that has since been replaced must all answer
 * the same way a link that never existed does — anything else confirms the
 * draft to somebody holding an address they should no longer be able to use.
 */
const db = getDb()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

async function tokenOf(draftId: string): Promise<string> {
  const [row] = await db
    .select({ token: s.researchDraft.shareToken })
    .from(s.researchDraft)
    .where(eq(s.researchDraft.id, draftId))
  if (row === undefined) throw new Error("no draft")
  return row.token
}

async function shared(): Promise<{ draftId: string, researchId: string, token: string }> {
  const created = await createResearchWithDraft(db)
  await setDraftSharing(db, created.draftId, { enabled: true, expiresAt: null })
  return { ...created, token: await tokenOf(created.draftId) }
}

describe("a share token", () => {
  it("opens the draft it belongs to while sharing is on", async () => {
    const { draftId, researchId, token } = await shared()

    const opened = await sharedDraftByToken(db, token)
    expect(opened?.draftId).toBe(draftId)
    expect(opened?.researchId).toBe(researchId)
  })

  it("opens nothing while the draft is private", async () => {
    const { draftId, token } = await shared()
    await setDraftSharing(db, draftId, { enabled: false, expiresAt: null })

    expect(await sharedDraftByToken(db, token)).toBe(null)
  })

  it("opens the same link again once sharing is turned back on", async () => {
    const { draftId, token } = await shared()
    await setDraftSharing(db, draftId, { enabled: false, expiresAt: null })
    await setDraftSharing(db, draftId, { enabled: true, expiresAt: null })

    expect(await tokenOf(draftId)).toBe(token)
    expect((await sharedDraftByToken(db, token))?.draftId).toBe(draftId)
  })

  it("opens nothing once the expiry has gone by", async () => {
    const { draftId, token } = await shared()
    await setDraftSharing(db, draftId, {
      enabled: true,
      expiresAt: new Date(Date.now() - 1000),
    })

    expect(await sharedDraftByToken(db, token)).toBe(null)
  })

  /** The one operation that retires an address that has got out. */
  it("opens nothing after it has been reissued, and the new one opens instead", async () => {
    const { draftId, token } = await shared()
    await reissueShareToken(db, draftId)
    const replacement = await tokenOf(draftId)

    expect(replacement).not.toBe(token)
    expect(await sharedDraftByToken(db, token)).toBe(null)
    expect((await sharedDraftByToken(db, replacement))?.draftId).toBe(draftId)
  })

  it("opens nothing when it names no draft at all", async () => {
    await shared()

    expect(await sharedDraftByToken(db, "not-a-token")).toBe(null)
    expect(await sharedDraftByToken(db, "")).toBe(null)
  })
})

describe("sharing", () => {
  /**
   * The share settings are not content: two administrators disagreeing costs
   * the setting one of them made a moment ago and nothing else, so they carry
   * no revision — and flipping the switch must not make an open editor's next
   * save fail over fields nobody touched.
   */
  it("leaves the draft's revision alone, so an open editor can still save", async () => {
    const { draftId } = await shared()
    const before = await db
      .select({ revision: s.researchDraft.revision })
      .from(s.researchDraft)
      .where(eq(s.researchDraft.id, draftId))

    await setDraftSharing(db, draftId, { enabled: false, expiresAt: new Date("2030-01-01") })
    await reissueShareToken(db, draftId)

    const after = await db
      .select({ revision: s.researchDraft.revision })
      .from(s.researchDraft)
      .where(eq(s.researchDraft.id, draftId))
    expect(after).toEqual(before)
  })

  it("says nothing happened when the draft is not there", async () => {
    const gone = "00000000-0000-0000-0000-000000000009"
    expect(await setDraftSharing(db, gone, { enabled: true, expiresAt: null }))
      .toEqual({ status: "gone" })
    expect(await reissueShareToken(db, gone)).toEqual({ status: "gone" })
  })
})
