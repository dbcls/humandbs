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

export interface AppConfig {
  /** What the application connects as. It cannot alter or erase the event log. */
  databaseUrl: string
  /**
   * What owns the schema. `drizzle-kit push`, the grant script and the reset in
   * the database tests use it; nothing that serves a request does.
   */
  ownerDatabaseUrl: string
  auth: AuthConfig
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
  }
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
