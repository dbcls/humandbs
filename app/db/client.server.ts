import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { loadConfig } from "~/config.server"

import * as schema from "./schema"

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

export type Database = NodePgDatabase<typeof schema>

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

/**
 * Anything a statement can run on. Rebuilding the search rows happens inside
 * the transaction that published something and also has to be runnable on its
 * own, so it takes this rather than a `Database`.
 */
export type Executor = Database | Transaction

let db: Database | undefined

/**
 * `casing` has to match what `drizzle.config.ts` passes to drizzle-kit, or the
 * queries this builds would address columns the pushed schema does not have.
 */
export function getDb(): Database {
  db ??= drizzle(getPool(), { schema, casing: "snake_case" })
  return db
}
