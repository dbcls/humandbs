import { describe, expect, it } from "vitest"

import { ConfigError, cookiesAreSecure, loadConfig } from "~/config.server"

const VALID = {
  HUMANDBS_DATABASE_URL: "postgres://humandbs_app:secret@db:5432/humandbs",
  HUMANDBS_OWNER_DATABASE_URL: "postgres://humandbs:secret@db:5432/humandbs",
  HUMANDBS_AUTH_ISSUER_URL: "https://idp-staging.ddbj.nig.ac.jp/realms/master",
  HUMANDBS_AUTH_CLIENT_ID: "humandbs-dev",
  HUMANDBS_AUTH_REDIRECT_URI: "http://localhost:8080/auth/callback",
  HUMANDBS_S3_ENDPOINT: "http://s3:8333",
  HUMANDBS_S3_ACCESS_KEY: "humandbs-dev",
  HUMANDBS_S3_SECRET_KEY: "humandbs-dev-secret",
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
      store: {
        endpoint: VALID.HUMANDBS_S3_ENDPOINT,
        accessKeyId: VALID.HUMANDBS_S3_ACCESS_KEY,
        secretAccessKey: VALID.HUMANDBS_S3_SECRET_KEY,
      },
      applicationDb: null,
    })
  })
})

/**
 * The one connection that is allowed to be absent. Outside production the JGA
 * application system is not reachable at all, so an environment without it has
 * to start — the sources that read it are skipped instead
 * (docs/data-model.md の「外部キャッシュ」).
 */
describe("loadConfig と申請管理システムの接続", () => {
  const withDb = (extra: Record<string, string | undefined>) => ({ ...VALID, ...extra })

  it("is absent when nothing is configured, rather than a failure to start", () => {
    expect(loadConfig(VALID).applicationDb).toBeNull()
  })

  it("is absent when the variable is present but empty, which is how .env.example ships", () => {
    expect(loadConfig(withDb({ HUMANDBS_JGA_DATABASE_URL: "  " })).applicationDb).toBeNull()
  })

  it("defaults the schema, because only one deployment names it differently", () => {
    const url = "postgres://reader:secret@jga:5432/jgadb"
    expect(loadConfig(withDb({ HUMANDBS_JGA_DATABASE_URL: url })).applicationDb)
      .toEqual({ url, schema: "jgasys" })
  })

  it("takes the configured schema, which differs between that system's deployments", () => {
    const url = "postgres://reader:secret@jga:5432/jgadb"
    const config = loadConfig(withDb({
      HUMANDBS_JGA_DATABASE_URL: url,
      HUMANDBS_JGA_DB_SCHEMA: "ts_jgasys",
    }))
    expect(config.applicationDb?.schema).toBe("ts_jgasys")
  })

  it("rejects a schema that is not a plain identifier, because it goes into the queries as one", () => {
    expect(() => loadConfig(withDb({
      HUMANDBS_JGA_DATABASE_URL: "postgres://reader:secret@jga:5432/jgadb",
      HUMANDBS_JGA_DB_SCHEMA: "jgasys; DROP TABLE accession",
    }))).toThrow("HUMANDBS_JGA_DB_SCHEMA must be a plain identifier")
  })

  it("rejects a connection that is not postgres, so a typo fails at start rather than at refresh", () => {
    expect(() => loadConfig(withDb({ HUMANDBS_JGA_DATABASE_URL: "http://jga:5432/jgadb" })))
      .toThrow("HUMANDBS_JGA_DATABASE_URL must use one of: postgres:, postgresql:")
  })

  it("rejects a value that is not a URL at all", () => {
    expect(() => loadConfig(withDb({ HUMANDBS_JGA_DATABASE_URL: "jga:5432/jgadb" })))
      .toThrow(ConfigError)
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
