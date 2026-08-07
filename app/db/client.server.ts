import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { loadConfig } from "~/config.server"

import * as schema from "./schema"

/**
 * The dev server re-evaluates modules on every change, so a module-scoped pool
 * would leak one pool per reload. The pools live on `globalThis`; the Drizzle
 * wrapper around them is cheap and may be rebuilt.
 */
const globalForDb = globalThis as typeof globalThis & {
  humandbsPool?: Pool
  humandbsOwnerPool?: Pool
}

export function getPool(): Pool {
  globalForDb.humandbsPool ??= new Pool({
    connectionString: loadConfig(process.env).databaseUrl,
  })
  return globalForDb.humandbsPool
}

/**
 * The connection that owns the schema.
 *
 * It exists because the role the application connects as deliberately cannot
 * alter the event log or empty a table: pushing the schema, applying the grants
 * and emptying the database between tests all need the owner. **Nothing that
 * serves a request may use it.**
 */
export function getOwnerPool(): Pool {
  globalForDb.humandbsOwnerPool ??= new Pool({
    connectionString: loadConfig(process.env).ownerDatabaseUrl,
  })
  return globalForDb.humandbsOwnerPool
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
let ownerDb: Database | undefined

/**
 * `casing` has to match what `drizzle.config.ts` passes to drizzle-kit, or the
 * queries this builds would address columns the pushed schema does not have.
 */
export function getDb(): Database {
  db ??= drizzle(getPool(), { schema, casing: "snake_case" })
  return db
}

export function getOwnerDb(): Database {
  ownerDb ??= drizzle(getOwnerPool(), { schema, casing: "snake_case" })
  return ownerDb
}

/** Releases whichever pools were opened. Scripts and tests end this way. */
export async function closePools(): Promise<void> {
  await Promise.all([
    globalForDb.humandbsPool?.end(),
    globalForDb.humandbsOwnerPool?.end(),
  ])
  globalForDb.humandbsPool = undefined
  globalForDb.humandbsOwnerPool = undefined
  db = undefined
  ownerDb = undefined
}
