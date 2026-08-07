import { sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import {
  clearedSessionCookie,
  createSession,
  endSession,
  hashSessionToken,
  readSession,
  sessionCookie,
  tokenFromRequest,
} from "./session.server"

/**
 * The session against the development database. What is checked here is the part
 * that is not visible from the outside: that the cookie value is not in the
 * table, that both deadlines are enforced, and that reading a page is not a
 * write.
 */
const db = getDb()

const PERSON = { sub: "0f3a-1b2c", name: "curator", idToken: "an-id-token" }

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

async function rows() {
  return db.select().from(s.session)
}

function only<T>(list: T[]): T {
  const [first] = list
  if (first === undefined) throw new Error("expected exactly one row")
  return first
}

async function setLastSeen(interval: string): Promise<void> {
  await db.update(s.session).set({ lastSeenAt: sql.raw(`now() - interval '${interval}'`) })
}

/** The `Cookie` header a browser would send back for a given `Set-Cookie`. */
function requestWithCookie(setCookie: string): Request {
  const pair = setCookie.split(";")[0] ?? ""
  return new Request("http://localhost:8080/admin", { headers: { cookie: pair } })
}

describe("セッションの読み書き", () => {
  it("発行した token で読み戻せる", async () => {
    const token = await createSession(db, PERSON)

    const found = await readSession(db, token)
    expect(found?.sub).toBe(PERSON.sub)
    expect(found?.name).toBe(PERSON.name)
  })

  it("別の token では読めない", async () => {
    await createSession(db, PERSON)

    expect(await readSession(db, "not-the-token")).toBeNull()
  })

  it("cookie の値そのものは行に残らない。行を読めてもなりすませない", async () => {
    const token = await createSession(db, PERSON)

    const row = only(await rows())
    expect(row.tokenHash).toBe(hashSessionToken(token))
    expect(JSON.stringify(row)).not.toContain(token)
  })

  it("7 日使われていないセッションは読めない", async () => {
    const token = await createSession(db, PERSON)
    await setLastSeen("7 days 1 minute")

    expect(await readSession(db, token)).toBeNull()
  })

  it("6 日前に使われたセッションはまだ読める", async () => {
    const token = await createSession(db, PERSON)
    await setLastSeen("6 days")

    expect(await readSession(db, token)).not.toBeNull()
  })

  it("直前に使われていても、発行から 30 日を過ぎたセッションは読めない", async () => {
    const token = await createSession(db, PERSON)
    await db.update(s.session).set({ expiresAt: sql`now() - make_interval(mins => 1)` })

    expect(await readSession(db, token)).toBeNull()
  })
})

describe("最終アクセス時刻の更新", () => {
  it("1 時間以内に読み直しても書き込まない", async () => {
    const token = await createSession(db, PERSON)
    const before = only(await rows()).lastSeenAt

    await readSession(db, token)

    expect(only(await rows()).lastSeenAt).toEqual(before)
  })

  it("1 時間より古くなっていたら読み取りのときに書き直す", async () => {
    const token = await createSession(db, PERSON)
    await setLastSeen("2 hours")
    const before = only(await rows()).lastSeenAt

    await readSession(db, token)

    expect(only(await rows()).lastSeenAt.getTime()).toBeGreaterThan(before.getTime())
  })
})

describe("セッションの終わり", () => {
  it("ログアウトは行を消し、logout の hint を 1 度だけ返す", async () => {
    const token = await createSession(db, PERSON)

    expect(await endSession(db, token)).toBe(PERSON.idToken)
    expect(await endSession(db, token)).toBeNull()
    expect(await readSession(db, token)).toBeNull()
  })

  it("知らない token のログアウトは何も消さない", async () => {
    await createSession(db, PERSON)

    expect(await endSession(db, "not-the-token")).toBeNull()
    expect(await rows()).toHaveLength(1)
  })

  it("ログインのときに、期限の切れた行を掃除する", async () => {
    await createSession(db, PERSON)
    await setLastSeen("30 days")

    await createSession(db, { ...PERSON, sub: "another" })

    const remaining = await rows()
    expect(remaining).toHaveLength(1)
    expect(only(remaining).keycloakSub).toBe("another")
  })
})

describe("セッションの cookie", () => {
  it("ブラウザが返す cookie から、その session の token が読める", async () => {
    const token = await createSession(db, PERSON)

    const request = requestWithCookie(sessionCookie(token))
    expect(tokenFromRequest(request)).toBe(token)
    expect(await readSession(db, tokenFromRequest(request) ?? "")).not.toBeNull()
  })

  it("script から読めない cookie として出す", () => {
    expect(sessionCookie("t")).toContain("HttpOnly")
    expect(sessionCookie("t")).toContain("SameSite=Lax")
  })

  it("http で配信している開発環境では Secure を付けない。付けると送られてこない", () => {
    expect(sessionCookie("t")).not.toContain("Secure")
  })

  it("cookie が無い要求からは token が取れない", () => {
    expect(tokenFromRequest(new Request("http://localhost:8080/"))).toBeNull()
  })

  it("空の cookie は token として扱わない", () => {
    expect(tokenFromRequest(requestWithCookie(clearedSessionCookie()))).toBeNull()
  })

  it("ログアウトの cookie はその場で期限切れになる", () => {
    expect(clearedSessionCookie()).toContain("Max-Age=0")
  })
})
