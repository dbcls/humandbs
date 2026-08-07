import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { grantAdmin, isAdmin, listAdmins, refreshAdminName, revokeAdmin } from "./admins.server"
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

describe("表示名", () => {
  it("改名に追随する。誰が admin かは動かない", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, SUBJECT)

    await refreshAdminName(db, SUBJECT.sub, "renamed")

    expect((await listAdmins(db))[0]?.name).toBe("renamed")
    expect(await isAdmin(db, SUBJECT.sub)).toBe(true)
  })

  it("admin でない人の名前を更新しても、admin を作らない", async () => {
    await refreshAdminName(db, "not-an-admin", "somebody")

    expect(await listAdmins(db)).toHaveLength(0)
  })
})
