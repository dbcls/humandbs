import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { ConfigError, loadConfig } from "~/config.server"

const VALID_URL = "postgres://humandbs:secret@db:5432/humandbs"

/** Every message `loadConfig` is allowed to produce for HUMANDBS_DATABASE_URL. */
const ALLOWED_MESSAGES = [
  "HUMANDBS_DATABASE_URL is required",
  "HUMANDBS_DATABASE_URL must be a URL",
  "HUMANDBS_DATABASE_URL must use one of: postgres:, postgresql:",
]

const whitespace = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r", "\f", "\v"), { minLength: 1, maxLength: 12 })
  .map((chars) => chars.join(""))

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

  it("rejects a HUMANDBS_DATABASE_URL that holds only whitespace", () => {
    fc.assert(fc.property(whitespace, (value) => {
      expect(() => loadConfig({ HUMANDBS_DATABASE_URL: value })).toThrow("HUMANDBS_DATABASE_URL is required")
    }))
  })

  it("rejects a URL whose protocol is not postgres", () => {
    expect(() => loadConfig({ HUMANDBS_DATABASE_URL: "http://db:5432/humandbs" }))
      .toThrow("HUMANDBS_DATABASE_URL must use one of: postgres:, postgresql:")
  })

  it("rejects a value that is not a URL at all", () => {
    expect(() => loadConfig({ HUMANDBS_DATABASE_URL: "db:5432/humandbs" }))
      .toThrow(ConfigError)
  })

  it("never lets the configured value into the error message", () => {
    fc.assert(fc.property(fc.string(), (value) => {
      try {
        loadConfig({ HUMANDBS_DATABASE_URL: value })
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError)
        expect(ALLOWED_MESSAGES).toContain((error as ConfigError).message)
      }
    }))
  })
})
