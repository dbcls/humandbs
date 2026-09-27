import fc from "fast-check"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { grantAdmin, isAdmin, listAdmins, recordAdminSeen, revokeAdmin, revokeAdminOnScreen } from "./admins.server"
import { BOOTSTRAP_ACTOR } from "./events.server"

const db = getDb()

const SUBJECT = { sub: "0f3a-1b2c", name: "curator" }

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

async function events() {
  return db.select().from(s.event)
}

describe("admin の付け外し", () => {
  it("付けると同時に証跡に残る", async () => {
    expect(await grantAdmin(db, BOOTSTRAP_ACTOR, SUBJECT)).toBe(true)

    expect(await isAdmin(db, SUBJECT.sub)).toBe(true)
    const [event] = await events()
    expect(event?.action).toBe("grant-admin")
    expect(event?.subjectType).toBe("admin")
    expect(event?.subjectId).toBe(SUBJECT.sub)
    expect(event?.actorSub).toBe(BOOTSTRAP_ACTOR.sub)
  })

  it("すでに admin の人に付け直しても、証跡は増えない", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, SUBJECT)

    expect(await grantAdmin(db, BOOTSTRAP_ACTOR, { ...SUBJECT, name: "another name" })).toBe(false)

    expect(await events()).toHaveLength(1)
    expect((await listAdmins(db))[0]?.name).toBe(SUBJECT.name)
  })

  it("外すと同時に証跡に残る", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, SUBJECT)

    expect(await revokeAdmin(db, BOOTSTRAP_ACTOR, SUBJECT.sub)).toBe(true)

    expect(await isAdmin(db, SUBJECT.sub)).toBe(false)
    expect(await events()).toHaveLength(2)
    expect((await events())[1]?.action).toBe("revoke-admin")
  })

  it("admin でない人を外しても、証跡は増えない", async () => {
    expect(await revokeAdmin(db, BOOTSTRAP_ACTOR, "nobody")).toBe(false)

    expect(await events()).toHaveLength(0)
  })

  it("外した後にもう一度付けられる。証跡には両方の操作が並ぶ", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, SUBJECT)
    await revokeAdmin(db, BOOTSTRAP_ACTOR, SUBJECT.sub)

    expect(await grantAdmin(db, BOOTSTRAP_ACTOR, SUBJECT)).toBe(true)

    expect((await events()).map((event) => event.action))
      .toEqual(["grant-admin", "revoke-admin", "grant-admin"])
  })

  it("一度も付けていない sub は admin ではない", async () => {
    expect(await isAdmin(db, "never-granted")).toBe(false)
  })

  it("並べる順は付けた順", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, SUBJECT)
    await grantAdmin(db, BOOTSTRAP_ACTOR, { sub: "second", name: "second" })

    expect((await listAdmins(db)).map((admin) => admin.sub)).toEqual([SUBJECT.sub, "second"])
  })
})

describe("ログイン", () => {
  it("名前を改名に追随させ、最後に使った日時を残す。誰が admin かは動かない", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, SUBJECT)
    expect((await listAdmins(db))[0]?.lastSeen).toBeNull()

    const before = new Date(Date.now() - 1000)
    await recordAdminSeen(db, SUBJECT.sub, "renamed")

    const [admin] = await listAdmins(db)
    expect(admin?.name).toBe("renamed")
    expect(admin?.lastSeen?.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(await isAdmin(db, SUBJECT.sub)).toBe(true)
  })

  it("admin でない人がログインしても、admin を作らない", async () => {
    await recordAdminSeen(db, "not-an-admin", "somebody")

    expect(await listAdmins(db)).toHaveLength(0)
  })

  it("ログインは証跡に残さない", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, SUBJECT)
    await recordAdminSeen(db, SUBJECT.sub, SUBJECT.name)

    expect((await events()).map((event) => event.action)).toEqual(["grant-admin"])
  })
})

describe("管理画面からの削除", () => {
  const ME = { sub: "me", name: "me" }

  it("ほかの admin を外し、外した人を操作者として証跡に残す", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, ME)
    await grantAdmin(db, BOOTSTRAP_ACTOR, SUBJECT)

    expect(await revokeAdminOnScreen(db, ME, SUBJECT.sub)).toBe("revoked")

    expect(await isAdmin(db, SUBJECT.sub)).toBe(false)
    const last = (await events()).at(-1)
    expect(last).toMatchObject({ action: "revoke-admin", subjectId: SUBJECT.sub, actorSub: ME.sub })
  })

  it("自分自身は外せない。何も変えず、証跡も増やさない", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, ME)
    await grantAdmin(db, BOOTSTRAP_ACTOR, SUBJECT)

    expect(await revokeAdminOnScreen(db, ME, ME.sub)).toBe("self")

    expect(await isAdmin(db, ME.sub)).toBe(true)
    expect(await events()).toHaveLength(2)
  })

  it("最後の 1 人は外せない", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, SUBJECT)

    // The one pressing is not in the list any more (taken away from the command
    // line meanwhile), so only the count stands between them and an empty list.
    expect(await revokeAdminOnScreen(db, ME, SUBJECT.sub)).toBe("last")

    expect(await isAdmin(db, SUBJECT.sub)).toBe(true)
  })

  it("admin でない sub は、外したことにせず証跡も増やさない", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, ME)

    expect(await revokeAdminOnScreen(db, ME, "nobody")).toBe("absent")

    expect(await events()).toHaveLength(1)
  })

  it("どんな順で外しても、押した本人と少なくとも 1 人は残る", async () => {
    const subs = ["a", "b", "c", "d"]
    await fc.assert(fc.asyncProperty(
      fc.constantFrom(...subs),
      fc.array(fc.constantFrom(...subs, "nobody"), { maxLength: 8 }),
      async (actor, targets) => {
        await emptyDatabase(getOwnerDb())
        for (const sub of subs) await grantAdmin(db, BOOTSTRAP_ACTOR, { sub, name: sub })

        for (const target of targets) await revokeAdminOnScreen(db, { sub: actor, name: actor }, target)

        const left = (await listAdmins(db)).map((admin) => admin.sub)
        expect(left).toContain(actor)
        expect(left.length).toBeGreaterThanOrEqual(1)
      },
    ), { numRuns: 25 })
  })
})
