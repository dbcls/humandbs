import { afterAll, describe, expect, it } from "vitest"

import { closePools } from "~/db/client.server"

import { openApplicationDb } from "./application-db.server"

afterAll(async () => {
  await closePools()
})

/**
 * The pool is pointed at the test database, whose role may write: what is
 * being held down is that the pool itself refuses to, whatever the role it is
 * given could do.
 */
describe("the application database's pool", () => {
  it("reads, and refuses every write even under a role that could write", async () => {
    const pool = openApplicationDb({ url: process.env.HUMANDBS_DATABASE_URL ?? "", schema: "public" })
    try {
      expect((await pool.query("SELECT 1 AS one")).rows).toEqual([{ one: 1 }])
      await expect(pool.query("CREATE TABLE written (id integer)")).rejects.toThrow(/read-only transaction/)
      await expect(pool.query("DELETE FROM session")).rejects.toThrow(/read-only transaction/)
    } finally {
      await pool.end()
    }
  })
})
