import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { apiSearch } from "~/api/pages.server"
import { closePools, getDb, getOwnerDb, getPool, getSearchPool, SEARCH_POOL } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"

import { RETRY_AFTER_SECONDS } from "./busy.server"

/**
 * These run against the test database, so they need `docker compose up`.
 */
const search = () => apiSearch(new Request("https://humandbs.dbcls.jp/api/research?q=cancer"), "research")

beforeAll(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await emptyDatabase(getOwnerDb())
  await closePools()
})

describe("the connections the public search runs on", () => {
  it("are a pool of their own, with the limits the search is refused by", async () => {
    const pool = getSearchPool()
    expect(pool).not.toBe(getPool())
    expect(pool.options.max).toBe(SEARCH_POOL.connections)
    expect(pool.options.connectionTimeoutMillis).toBe(SEARCH_POOL.waitMs)

    const client = await pool.connect()
    try {
      const { rows } = await client.query<{ statement_timeout: string }>("SHOW statement_timeout")
      expect(rows[0]?.statement_timeout).toBe(`${SEARCH_POOL.statementMs / 1000}s`)
    } finally {
      client.release()
    }
  })

  it("compile no statement and keep a connection once opened, as the other request connections do", async () => {
    for (const pool of [getSearchPool(), getPool()]) {
      expect(pool.options.idleTimeoutMillis).toBe(0)
      const client = await pool.connect()
      try {
        const { rows } = await client.query<{ jit: string }>("SHOW jit")
        expect(rows[0]?.jit).toBe("off")
      } finally {
        client.release()
      }
    }
  })

  it("refuse a search once every one of them is taken, leave the other connections free, and serve again once one is", async () => {
    const held = await Promise.all(Array.from({ length: SEARCH_POOL.connections }, () => getSearchPool().connect()))
    try {
      const refused = await search()
      expect(refused.status).toBe(503)
      expect(refused.headers.get("Retry-After")).toBe(String(RETRY_AFTER_SECONDS))
      expect(refused.headers.get("Content-Type")).toContain("application/problem+json")
      expect(await refused.json()).toMatchObject({ status: 503, type: "https://humandbs.dbcls.jp/problems/service-unavailable" })

      await expect(getDb().execute(sql`SELECT 1`)).resolves.toBeDefined()
    } finally {
      for (const client of held) client.release()
    }

    expect((await search()).status).toBe(200)
  }, SEARCH_POOL.waitMs + 20_000)
})
