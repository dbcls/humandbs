import { eq, sql } from "drizzle-orm"
import fc from "fast-check"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { grantAdmin, isAdmin, listAdmins } from "./admins.server"
import { BOOTSTRAP_ACTOR } from "./events.server"
import { acceptInvitation, cancelInvitation, createInvitation, openInvitations } from "./invitations.server"

const db = getDb()
const INVITER = { sub: "inviter", name: "Inviter" }
const NEWCOMER = { sub: "newcomer", name: "Newcomer" }

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
  await grantAdmin(db, BOOTSTRAP_ACTOR, INVITER)
})

afterAll(async () => {
  await closePools()
})

describe("招待リンク", () => {
  it("リンクの値そのものは保存しない", async () => {
    const token = await createInvitation(db, INVITER)

    const rows = await db.select().from(s.adminInvitation)
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain(token)
  })

  it("開いた人を Keycloak の名前で管理者にし、招待した人を操作者として記録に残す", async () => {
    const token = await createInvitation(db, INVITER)

    expect(await acceptInvitation(db, token, NEWCOMER)).toBe("granted")

    const admin = (await listAdmins(db)).find((one) => one.sub === NEWCOMER.sub)
    expect(admin?.name).toBe(NEWCOMER.name)
    expect(admin?.lastSeen).not.toBeNull()
    const [grant] = await db.select().from(s.event).where(eq(s.event.subjectId, NEWCOMER.sub))
    expect(grant).toMatchObject({ action: "grant-admin", actorSub: INVITER.sub, actorName: INVITER.name })
    expect(grant?.detail).toMatchObject({ displayName: NEWCOMER.name })
    expect(await openInvitations(db)).toEqual([])
  })

  it("1 回だけ使える。同じ人が開き直しても管理者のままで、記録は増えない", async () => {
    const token = await createInvitation(db, INVITER)
    await acceptInvitation(db, token, NEWCOMER)

    expect(await acceptInvitation(db, token, NEWCOMER)).toBe("granted")
    expect(await acceptInvitation(db, token, { sub: "someone-else", name: "Else" })).toBe("used")

    expect(await isAdmin(db, "someone-else")).toBe(false)
    expect(await db.select().from(s.event).where(eq(s.event.subjectId, NEWCOMER.sub))).toHaveLength(1)
  })

  it("すでに管理者の人が開いても使わずに残す", async () => {
    const token = await createInvitation(db, INVITER)

    expect(await acceptInvitation(db, token, INVITER)).toBe("already")

    expect(await openInvitations(db)).toHaveLength(1)
    expect(await acceptInvitation(db, token, NEWCOMER)).toBe("granted")
  })

  it("期限を過ぎたものは使えず、一覧にも出ない", async () => {
    const token = await createInvitation(db, INVITER)
    await getOwnerDb().execute(sql`UPDATE admin_invitation SET expires_at = now() - interval '1 minute'`)

    expect(await acceptInvitation(db, token, NEWCOMER)).toBe("expired")
    expect(await isAdmin(db, NEWCOMER.sub)).toBe(false)
    expect(await openInvitations(db)).toEqual([])
  })

  it("作った招待は 7 日で切れる", async () => {
    await createInvitation(db, INVITER)

    const [open] = await openInvitations(db)
    const days = ((open?.expiresAt.getTime() ?? 0) - (open?.createdAt.getTime() ?? 0)) / 86_400_000
    expect(days).toBeCloseTo(7, 3)
  })

  it("作っていないリンクは使えない", async () => {
    await createInvitation(db, INVITER)
    await fc.assert(fc.asyncProperty(fc.string(), async (token) => {
      expect(await acceptInvitation(db, token, NEWCOMER)).toBe("unknown")
    }), { numRuns: 25 })
    expect(await isAdmin(db, NEWCOMER.sub)).toBe(false)
  })

  it("削除すると使えない。使ったあとと、無い ID は削除できない", async () => {
    const token = await createInvitation(db, INVITER)
    const [open] = await openInvitations(db)

    expect(await cancelInvitation(db, open?.id ?? "")).toBe(true)
    expect(await acceptInvitation(db, token, NEWCOMER)).toBe("unknown")

    const second = await createInvitation(db, INVITER)
    const [again] = await openInvitations(db)
    await acceptInvitation(db, second, NEWCOMER)
    expect(await cancelInvitation(db, again?.id ?? "")).toBe(false)
    expect(await cancelInvitation(db, "not-an-id")).toBe(false)
  })

  it("同じリンクを 2 人が同時に開いても、管理者になるのは 1 人だけ", async () => {
    const token = await createInvitation(db, INVITER)

    const outcomes = await Promise.all([
      acceptInvitation(db, token, { sub: "a", name: "A" }),
      acceptInvitation(db, token, { sub: "b", name: "B" }),
    ])

    expect([...outcomes].sort()).toEqual(["granted", "used"])
    expect((await listAdmins(db)).map((one) => one.sub).filter((sub) => sub === "a" || sub === "b")).toHaveLength(1)
  })
})
