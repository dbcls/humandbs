/**
 * Configuration is read from the environment once, at the point of first use.
 *
 * Values never appear in error messages: the connection URLs carry passwords,
 * and a startup failure is the most likely thing to end up in a log or a
 * response body.
 */

export interface AuthConfig {
  issuerUrl: string
  clientId: string
  redirectUri: string
}

/**
 * How the application reaches the file store.
 *
 * These are root credentials, and every signature a browser is handed is made
 * with them. The store cannot see who is asking — the application decides that
 * from `admin_user` and then signs on their behalf (docs/data-model.md の
 * 「ファイル」).
 *
 * The endpoint is the address inside the compose network, and **not** the
 * address a download is served from: that is the front proxy, which adds the
 * headers the store itself cannot be trusted to.
 */
export interface StoreConfig {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
}

/**
 * How the application reaches the JGA application system.
 *
 * **Read-only, and optional.** The database belongs to another project, so the
 * portal never alters it and the connection forces that at the session level
 * rather than trusting the queries. It is optional because the database is not
 * reachable outside production: an environment without it is a normal
 * environment, and the sources that read it are skipped rather than treated as
 * broken (docs/data-model.md の「外部キャッシュ」).
 *
 * The schema name is configured because it differs between the deployments of
 * the upstream system.
 */
export interface ApplicationDbConfig {
  url: string
  schema: string
}

/**
 * Where the application assistant answers.
 *
 * **Optional, and an origin rather than a URL with a path.** The service runs
 * beside the portal inside the compose network and is not published, so an
 * environment without it is a normal environment and the screen says so rather
 * than failing. The path is the service's own; the portal only knows the
 * address it lives at (docs/assistant.md).
 */
export interface AppConfig {
  /** What the application connects as. It cannot alter or erase the event log. */
  databaseUrl: string
  /**
   * What owns the schema. `drizzle-kit push`, the grant script and the reset in
   * the database tests use it; nothing that serves a request does.
   */
  ownerDatabaseUrl: string
  auth: AuthConfig
  store: StoreConfig
  applicationDb: ApplicationDbConfig | null
  assistantOrigin: string | null
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConfigError"
  }
}

type Env = Record<string, string | undefined>

const POSTGRES_PROTOCOLS = ["postgres:", "postgresql:"]

export function loadConfig(env: Env): AppConfig {
  return {
    databaseUrl: readUrl(env, "HUMANDBS_DATABASE_URL", POSTGRES_PROTOCOLS),
    ownerDatabaseUrl: readUrl(env, "HUMANDBS_OWNER_DATABASE_URL", POSTGRES_PROTOCOLS),
    auth: {
      issuerUrl: readUrl(env, "HUMANDBS_AUTH_ISSUER_URL", ["https:"]),
      clientId: readRequired(env, "HUMANDBS_AUTH_CLIENT_ID"),
      redirectUri: readUrl(env, "HUMANDBS_AUTH_REDIRECT_URI", ["http:", "https:"]),
    },
    store: {
      endpoint: readUrl(env, "HUMANDBS_S3_ENDPOINT", ["http:", "https:"]),
      accessKeyId: readRequired(env, "HUMANDBS_S3_ACCESS_KEY"),
      secretAccessKey: readRequired(env, "HUMANDBS_S3_SECRET_KEY"),
    },
    applicationDb: readApplicationDb(env),
    assistantOrigin: readAssistantOrigin(env),
  }
}

function readAssistantOrigin(env: Env): string | null {
  const value = env.HUMANDBS_ASSISTANT_ORIGIN?.trim()
  if (value === undefined || value === "") return null

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new ConfigError("HUMANDBS_ASSISTANT_ORIGIN must be a URL")
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConfigError("HUMANDBS_ASSISTANT_ORIGIN must use one of: http:, https:")
  }
  // Only the origin is kept: a path here would be silently prefixed onto every
  // address the service defines, so the two would disagree about where an
  // endpoint is without either of them being wrong on its own.
  if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
    throw new ConfigError("HUMANDBS_ASSISTANT_ORIGIN must be an origin, with no path")
  }
  return parsed.origin
}

const DEFAULT_APPLICATION_DB_SCHEMA = "jgasys"

function readApplicationDb(env: Env): ApplicationDbConfig | null {
  const url = env.HUMANDBS_JGA_DATABASE_URL?.trim()
  if (url === undefined || url === "") return null

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ConfigError("HUMANDBS_JGA_DATABASE_URL must be a URL")
  }
  if (!POSTGRES_PROTOCOLS.includes(parsed.protocol)) {
    throw new ConfigError(`HUMANDBS_JGA_DATABASE_URL must use one of: ${POSTGRES_PROTOCOLS.join(", ")}`)
  }

  const configured = env.HUMANDBS_JGA_DB_SCHEMA?.trim()
  const schema = configured === undefined || configured === ""
    ? DEFAULT_APPLICATION_DB_SCHEMA
    : configured
  // The name goes into the queries as an identifier, which no parameter can
  // carry, so the shape is checked once here rather than trusted at each use.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new ConfigError("HUMANDBS_JGA_DB_SCHEMA must be a plain identifier")
  }
  return { url, schema }
}

/**
 * Whether the cookies this application sets carry `Secure`.
 *
 * Derived from the registered redirect URI rather than from a setting of its
 * own. That URI is the one address Keycloak will return a browser to, so it
 * cannot disagree with the scheme the site is really served over — and a
 * separate flag could be left off in production, where the cookie is the whole
 * of a session.
 */
export function cookiesAreSecure(auth: AuthConfig): boolean {
  return new URL(auth.redirectUri).protocol === "https:"
}

/**
 * The address a browser reaches this site at.
 *
 * Taken from the registered redirect URI for the same reason the cookie flag
 * is: that URI is the one address Keycloak will return a browser to, so it
 * cannot disagree with where the site is really served.
 *
 * **A presigned upload URL has to carry this origin**, not the store's own. The
 * store is only reachable inside the network, and its port is deliberately not
 * published — a browser has to go through the front proxy, and the signature
 * covers the host it was made for.
 */
export function publicOrigin(auth: AuthConfig): string {
  return new URL(auth.redirectUri).origin
}

function readUrl(env: Env, name: string, protocols: string[]): string {
  const value = readRequired(env, name)

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConfigError(`${name} must be a URL`)
  }

  if (!protocols.includes(url.protocol)) {
    throw new ConfigError(`${name} must use one of: ${protocols.join(", ")}`)
  }

  return value
}

function readRequired(env: Env, name: string): string {
  const value = env[name]?.trim()
  if (value === undefined || value === "") {
    throw new ConfigError(`${name} is required`)
  }
  return value
}
