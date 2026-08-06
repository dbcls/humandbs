import { describe, expect, it } from "vitest"

import { ConfigError, loadConfig } from "~/config.server"

const VALID_URL = "postgres://humandbs:secret@db:5432/humandbs"

describe("loadConfig", () => {
  it("returns a postgres:// URL unchanged", () => {
    expect(loadConfig({ HUMANDBS_DATABASE_URL: VALID_URL })).toEqual({ databaseUrl: VALID_URL })
  })

  it("accepts the postgresql:// spelling", () => {
    const url = "postgresql://humandbs@db/humandbs"
    expect(loadConfig({ HUMANDBS_DATABASE_URL: url }).databaseUrl).toBe(url)
  })

  it("strips surrounding whitespace so a stray newline in .env does not reach the driver", () => {
    expect(loadConfig({ HUMANDBS_DATABASE_URL: `  ${VALID_URL}\n` }).databaseUrl).toBe(VALID_URL)
  })

  it("rejects an absent HUMANDBS_DATABASE_URL", () => {
    expect(() => loadConfig({})).toThrow(ConfigError)
  })

  it("rejects a URL whose protocol is not postgres", () => {
    expect(() => loadConfig({ HUMANDBS_DATABASE_URL: "http://db:5432/humandbs" }))
      .toThrow("HUMANDBS_DATABASE_URL must use one of: postgres:, postgresql:")
  })

  it("rejects a value that is not a URL at all", () => {
    expect(() => loadConfig({ HUMANDBS_DATABASE_URL: "db:5432/humandbs" }))
      .toThrow(ConfigError)
  })
})
