import { describe, expect, it } from "vitest"

import { getOwnerDb } from "~/db/client.server"

import { assertTestDatabase, databaseName } from "./test-database"

/** These run against the test database, so they need `docker compose up`. */
const owner = getOwnerDb()

const connected = databaseName(process.env.HUMANDBS_OWNER_DATABASE_URL ?? "")

describe("assertTestDatabase", () => {
  it("passes for the database the tests are actually connected to", async () => {
    await expect(assertTestDatabase(owner, connected)).resolves.toBeUndefined()
  })

  it("refuses a name without the suffix, which is what a development database looks like", async () => {
    await expect(assertTestDatabase(owner, "humandbs")).rejects.toThrow(/rather than "humandbs"/)
  })

  it("refuses another database that ends the same way", async () => {
    await expect(assertTestDatabase(owner, "somewhere_else_test")).rejects.toThrow(/nothing is run/)
  })

  it("names both sides, so a wrong connection can be told apart from a wrong expectation", async () => {
    await expect(assertTestDatabase(owner, "humandbs")).rejects.toThrow(
      new RegExp(`connected to "${connected}"`),
    )
  })
})
