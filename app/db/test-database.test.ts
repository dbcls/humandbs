import { describe, expect, it } from "vitest"

import { databaseName, testDatabaseUrl } from "./test-database"

describe("databaseName", () => {
  it("refuses a URL that names no database", () => {
    expect(() => databaseName("postgres://user:pass@db:5432/")).toThrow(/names no database/)
  })

  it("decodes a percent-encoded name", () => {
    expect(databaseName("postgres://user:pass@db:5432/hum%20andbs")).toBe("hum andbs")
  })
})

describe("testDatabaseUrl", () => {
  it("adds the suffix to the name and leaves the rest of the connection alone", () => {
    const url = new URL(testDatabaseUrl("postgres://user:pass@db:5432/humandbs"))
    expect(url.pathname).toBe("/humandbs_test")
    expect(url.username).toBe("user")
    expect(url.password).toBe("pass")
    expect(url.host).toBe("db:5432")
  })

  it("does nothing to a URL that already names the test database", () => {
    const once = testDatabaseUrl("postgres://user:pass@db:5432/humandbs")
    expect(testDatabaseUrl(once)).toBe(once)
  })

  it("keeps the query, which carries connection options", () => {
    const url = testDatabaseUrl("postgres://user:pass@db:5432/humandbs?sslmode=disable")
    expect(new URL(url).search).toBe("?sslmode=disable")
  })

  it("refuses a URL that names no database", () => {
    expect(() => testDatabaseUrl("postgres://user:pass@db:5432/")).toThrow(/names no database/)
  })
})
