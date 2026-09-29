import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { loadConfig, loadOwnerDatabaseUrl } from "~/config.server"

import * as schema from "./schema"

/**
 * The dev server re-evaluates modules on every change, so a module-scoped pool
 * would leak one pool per reload. The pools live on `globalThis`; the Drizzle
 * wrapper around them is cheap and may be rebuilt.
 */
const globalForDb = globalThis as typeof globalThis & {
  humandbsPool?: Pool
  humandbsSearchPool?: Pool
  humandbsOwnerPool?: Pool
}

export function getPool(): Pool {
  globalForDb.humandbsPool ??= new Pool({
    connectionString: loadConfig(process.env).databaseUrl,
  })
  return globalForDb.humandbsPool
}

/**
 * The limits of the connections the public search runs on (`getSearchDb`):
 * how many there are, how long a search waits for one to come free, and how
 * long one statement may run. A search past either time is refused with a 503
 * (`search/busy.server.ts`).
 *
 * One listing page sends its statements at once, a handful of them, so a few
 * connections serve a person at a time with room to spare, and a crawler asking
 * for search after search is held to the same few.
 */
export const SEARCH_POOL = { connections: 4, waitMs: 5_000, statementMs: 10_000 } as const

/**
 * The connections the public search runs on: the listings, the exports and the
 * API's search, bulk and fields. **Apart from `getPool`'s**, so searches that
 * arrive faster than they are answered use up these and not the ones every
 * other page, the management screens and `/healthz` run on.
 */
export function getSearchPool(): Pool {
  globalForDb.humandbsSearchPool ??= new Pool({
    connectionString: loadConfig(process.env).databaseUrl,
    max: SEARCH_POOL.connections,
    connectionTimeoutMillis: SEARCH_POOL.waitMs,
    statement_timeout: SEARCH_POOL.statementMs,
  })
  return globalForDb.humandbsSearchPool
}

/**
 * The connection that owns the schema.
 *
 * It exists because the role the application connects as deliberately cannot
 * alter the event log or empty a table: pushing the schema, applying the grants
 * and emptying the database between tests all need the owner. **Nothing that
 * serves a request may use it.**
 */
function getOwnerPool(): Pool {
  globalForDb.humandbsOwnerPool ??= new Pool({
    connectionString: loadOwnerDatabaseUrl(process.env),
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
let searchDb: Database | undefined
let ownerDb: Database | undefined

/**
 * `casing` has to match what `drizzle.config.ts` passes to drizzle-kit, or the
 * queries this builds would address columns the pushed schema does not have.
 */
export function getDb(): Database {
  db ??= drizzle(getPool(), { schema, casing: "snake_case" })
  return db
}

export function getSearchDb(): Database {
  searchDb ??= drizzle(getSearchPool(), { schema, casing: "snake_case" })
  return searchDb
}

export function getOwnerDb(): Database {
  ownerDb ??= drizzle(getOwnerPool(), { schema, casing: "snake_case" })
  return ownerDb
}

/** Releases whichever pools were opened. Scripts and tests end this way. */
export async function closePools(): Promise<void> {
  await Promise.all([
    globalForDb.humandbsPool?.end(),
    globalForDb.humandbsSearchPool?.end(),
    globalForDb.humandbsOwnerPool?.end(),
  ])
  globalForDb.humandbsPool = undefined
  globalForDb.humandbsSearchPool = undefined
  globalForDb.humandbsOwnerPool = undefined
  db = undefined
  searchDb = undefined
  ownerDb = undefined
}
