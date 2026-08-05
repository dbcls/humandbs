import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { loadConfig } from "~/config.server"

/**
 * The dev server re-evaluates modules on every change, so a module-scoped pool
 * would leak one pool per reload. The pool lives on `globalThis`; the Drizzle
 * wrapper around it is cheap and may be rebuilt.
 */
const globalForDb = globalThis as typeof globalThis & { humandbsPool?: Pool }

export function getPool(): Pool {
  globalForDb.humandbsPool ??= new Pool({
    connectionString: loadConfig(process.env).databaseUrl,
  })
  return globalForDb.humandbsPool
}

let db: ReturnType<typeof drizzle> | undefined

export function getDb(): ReturnType<typeof drizzle> {
  db ??= drizzle(getPool())
  return db
}
