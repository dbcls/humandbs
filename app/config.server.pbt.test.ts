import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { ConfigError, loadConfig } from "~/config.server"

const VALID = {
  HUMANDBS_DATABASE_URL: "postgres://humandbs_app:secret@db:5432/humandbs",
  HUMANDBS_OWNER_DATABASE_URL: "postgres://humandbs:secret@db:5432/humandbs",
  HUMANDBS_AUTH_ISSUER_URL: "https://idp-staging.ddbj.nig.ac.jp/realms/master",
  HUMANDBS_AUTH_CLIENT_ID: "humandbs-dev",
  HUMANDBS_AUTH_REDIRECT_URI: "http://localhost:8080/auth/callback",
}

const NAMES = Object.keys(VALID)

/** Every message `loadConfig` is allowed to produce for a given variable. */
function allowedMessages(name: string): string[] {
  return [
    `${name} is required`,
    `${name} must be a URL`,
    `${name} must use one of: postgres:, postgresql:`,
    `${name} must use one of: https:`,
    `${name} must use one of: http:, https:`,
  ]
}

const whitespace = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r", "\f", "\v"), { minLength: 1, maxLength: 12 })
  .map((chars) => chars.join(""))

describe("loadConfig", () => {
  it.each(NAMES)("rejects a %s that holds only whitespace", (name) => {
    fc.assert(fc.property(whitespace, (value) => {
      expect(() => loadConfig({ ...VALID, [name]: value })).toThrow(`${name} is required`)
    }))
  })

  it.each(NAMES)("never lets the value of %s into the error message", (name) => {
    fc.assert(fc.property(fc.string(), (value) => {
      try {
        loadConfig({ ...VALID, [name]: value })
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError)
        expect(allowedMessages(name)).toContain((error as ConfigError).message)
      }
    }))
  })
})
