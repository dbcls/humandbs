import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { ConfigError, loadConfig } from "~/config.server"

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
  it("rejects a HUMANDBS_DATABASE_URL that holds only whitespace", () => {
    fc.assert(fc.property(whitespace, (value) => {
      expect(() => loadConfig({ HUMANDBS_DATABASE_URL: value })).toThrow("HUMANDBS_DATABASE_URL is required")
    }))
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
