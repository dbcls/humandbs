import { describe, expect, it } from "vitest"

import { ConfigError, cookiesAreSecure, loadConfig } from "~/config.server"

const VALID = {
  HUMANDBS_DATABASE_URL: "postgres://humandbs_app:secret@db:5432/humandbs",
  HUMANDBS_OWNER_DATABASE_URL: "postgres://humandbs:secret@db:5432/humandbs",
  HUMANDBS_AUTH_ISSUER_URL: "https://idp-staging.ddbj.nig.ac.jp/realms/master",
  HUMANDBS_AUTH_CLIENT_ID: "humandbs-dev",
  HUMANDBS_AUTH_REDIRECT_URI: "http://localhost:8080/auth/callback",
}

const REQUIRED = Object.keys(VALID)

function withValue(name: string, value: string | undefined) {
  return { ...VALID, [name]: value }
}

describe("loadConfig", () => {
  it("returns every configured value unchanged", () => {
    expect(loadConfig(VALID)).toEqual({
      databaseUrl: VALID.HUMANDBS_DATABASE_URL,
      ownerDatabaseUrl: VALID.HUMANDBS_OWNER_DATABASE_URL,
      auth: {
        issuerUrl: VALID.HUMANDBS_AUTH_ISSUER_URL,
        clientId: VALID.HUMANDBS_AUTH_CLIENT_ID,
        redirectUri: VALID.HUMANDBS_AUTH_REDIRECT_URI,
      },
    })
  })

  it("accepts the postgresql:// spelling", () => {
    const url = "postgresql://humandbs@db/humandbs"
    expect(loadConfig(withValue("HUMANDBS_DATABASE_URL", url)).databaseUrl).toBe(url)
  })

  it("strips surrounding whitespace so a stray newline in .env does not reach the driver", () => {
    const padded = `  ${VALID.HUMANDBS_DATABASE_URL}\n`
    expect(loadConfig(withValue("HUMANDBS_DATABASE_URL", padded)).databaseUrl)
      .toBe(VALID.HUMANDBS_DATABASE_URL)
  })

  it.each(REQUIRED)("rejects an absent %s", (name) => {
    expect(() => loadConfig(withValue(name, undefined))).toThrow(`${name} is required`)
  })

  it("rejects a database URL whose protocol is not postgres", () => {
    expect(() => loadConfig(withValue("HUMANDBS_DATABASE_URL", "http://db:5432/humandbs")))
      .toThrow("HUMANDBS_DATABASE_URL must use one of: postgres:, postgresql:")
  })

  it("rejects an issuer that is not https, because the tokens are read from it", () => {
    expect(() => loadConfig(withValue("HUMANDBS_AUTH_ISSUER_URL", "http://idp.invalid/realms/x")))
      .toThrow("HUMANDBS_AUTH_ISSUER_URL must use one of: https:")
  })

  it("allows an http redirect URI, which is what local development is served over", () => {
    expect(loadConfig(VALID).auth.redirectUri).toBe("http://localhost:8080/auth/callback")
  })

  it("rejects a value that is not a URL at all", () => {
    expect(() => loadConfig(withValue("HUMANDBS_DATABASE_URL", "db:5432/humandbs")))
      .toThrow(ConfigError)
  })

  it("rejects a client id that is only whitespace", () => {
    expect(() => loadConfig(withValue("HUMANDBS_AUTH_CLIENT_ID", "   ")))
      .toThrow("HUMANDBS_AUTH_CLIENT_ID is required")
  })
})

describe("cookiesAreSecure", () => {
  it("is false when the site is served over http, or no cookie would ever be sent", () => {
    expect(cookiesAreSecure(loadConfig(VALID).auth)).toBe(false)
  })

  it("is true when the redirect URI is https, without a setting of its own to forget", () => {
    const https = withValue("HUMANDBS_AUTH_REDIRECT_URI", "https://humandbs.dbcls.jp/auth/callback")
    expect(cookiesAreSecure(loadConfig(https).auth)).toBe(true)
  })
})
