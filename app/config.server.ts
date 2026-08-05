/**
 * Configuration is read from the environment once, at the point of first use.
 *
 * Values never appear in error messages: `HUMANDBS_DATABASE_URL` carries a password, and
 * a startup failure is the most likely thing to end up in a log or a response
 * body.
 */

export interface AppConfig {
  databaseUrl: string
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
  }
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
