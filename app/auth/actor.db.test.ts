import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"

import { readActor, requireActor, requireCapability } from "./actor.server"
import { grantAdmin, revokeAdmin } from "./admins.server"
import { CAPABILITIES } from "./capabilities"
import { BOOTSTRAP_ACTOR } from "./events.server"
import { createSession, sessionCookie } from "./session.server"

/**
 * Deriving who is asking, against the development database.
 *
 * The one that matters is "access removed between requests": authorisation is
 * read on every request precisely so that it can change without waiting for a
 * cookie to expire.
 */
const db = getDb()

const PERSON = { sub: "0f3a-1b2c", name: "curator", idToken: "an-id-token" }

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

function requestFor(token: string | null, path = "/admin"): Request {
  const headers = new Headers()
  if (token !== null) {
    headers.set("cookie", sessionCookie(token).split(";")[0] ?? "")
  }
  return new Request(`http://localhost:8080${path}`, { headers })
}

async function thrownBy(work: () => Promise<unknown>): Promise<Response> {
  const result = await work().then(() => null, (error: unknown) => error)
  if (!(result instanceof Response)) {
    throw new Error("expected a Response to be thrown")
  }
  return result
}

describe("要求ごとの主体の導出", () => {
  it("cookie が無ければ主体は無い", async () => {
    expect(await readActor(requestFor(null))).toBeNull()
  })

  it("何も指していない cookie では主体は無い", async () => {
    expect(await readActor(requestFor("not-a-session"))).toBeNull()
  })

  it("ログイン済みで admin でない主体は capability を 1 つも持たない", async () => {
    const token = await createSession(db, PERSON)

    const actor = await readActor(requestFor(token))
    expect(actor?.sub).toBe(PERSON.sub)
    expect(actor?.name).toBe(PERSON.name)
    expect(actor?.isAdmin).toBe(false)
    expect(actor?.capabilities.size).toBe(0)
  })

  it("admin は全 capability を持つ", async () => {
    const token = await createSession(db, PERSON)
    await grantAdmin(db, BOOTSTRAP_ACTOR, PERSON)

    const actor = await readActor(requestFor(token))
    expect(actor?.isAdmin).toBe(true)
    expect(actor?.capabilities.size).toBe(CAPABILITIES.length)
  })

  it("主体は自分のセッションを名指しできる。presence がこれを主キーにする", async () => {
    const token = await createSession(db, PERSON)

    const actor = await readActor(requestFor(token))
    expect(actor?.sessionId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("admin を外すと、同じ cookie の次の要求で効く", async () => {
    const token = await createSession(db, PERSON)
    await grantAdmin(db, BOOTSTRAP_ACTOR, PERSON)
    expect((await readActor(requestFor(token)))?.isAdmin).toBe(true)

    await revokeAdmin(db, BOOTSTRAP_ACTOR, PERSON.sub)

    const after = await readActor(requestFor(token))
    expect(after?.isAdmin).toBe(false)
    expect(after?.capabilities.size).toBe(0)
  })
})

describe("認可の 3 つの答え", () => {
  it("未ログインはログインへ送り、いま見ていたアドレスを戻り先に持たせる", async () => {
    const response = await thrownBy(() => requireActor(requestFor(null, "/admin?tab=drafts")))

    expect(response.status).toBe(302)
    expect(response.headers.get("location"))
      .toBe("/auth/login?redirect=%2Fadmin%3Ftab%3Ddrafts")
  })

  it("ログイン済みで権限が無ければ 403。ログインし直しても答えは変わらない", async () => {
    const token = await createSession(db, PERSON)

    const response = await thrownBy(() => requireCapability(requestFor(token), "publish"))

    expect(response.status).toBe(403)
  })

  it("未ログインが権限を要る経路に来たら、403 ではなくログインへ送る", async () => {
    const response = await thrownBy(() => requireCapability(requestFor(null), "publish"))

    expect(response.status).toBe(302)
  })

  it("admin にはどの capability でも主体を返す", async () => {
    const token = await createSession(db, PERSON)
    await grantAdmin(db, BOOTSTRAP_ACTOR, PERSON)

    for (const capability of CAPABILITIES) {
      const actor = await requireCapability(requestFor(token), capability)
      expect(actor.sub).toBe(PERSON.sub)
    }
  })
})
