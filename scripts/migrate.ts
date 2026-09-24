/**
 * Brings a deployed database to the schema in `drizzle/` and puts the
 * application role's privileges back.
 *
 * This is the one-shot job a deployment runs before the application starts. It
 * connects as the owner — the only role that can change the schema — and ends
 * with the grants, because a table a migration has just created is unreachable
 * to the application until they are applied again (`app/db/grants.server.ts`).
 *
 * `--mark-baseline` records the first migration as applied without running it.
 * It is for a database whose schema was put there by `drizzle-kit push` and has
 * been checked to be the one that migration would create; it refuses a
 * database that already records any migration.
 */

import { join } from "node:path"

import { drizzle } from "drizzle-orm/node-postgres"
import { readMigrationFiles } from "drizzle-orm/migrator"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client } from "pg"

import { loadOwnerDatabaseUrl } from "~/config.server"
import { applyGrantsFromEnv } from "~/db/grants.server"
import * as schema from "~/db/schema"

const MIGRATIONS_FOLDER = join(import.meta.dirname, "..", "drizzle")

/**
 * Two runs at once would both read the same last migration and apply the next
 * one twice; the migrator itself takes no lock.
 */
const LOCK_KEY = 7_311_742_001

/** The database may still be starting: the job is launched beside it. */
const CONNECT_ATTEMPTS = 60

async function connect(url: string): Promise<Client> {
  for (let attempt = 1; ; attempt++) {
    const client = new Client({ connectionString: url })
    try {
      await client.connect()
      await client.query("SELECT 1")
      return client
    } catch (error) {
      await client.end().catch(() => undefined)
      if (attempt >= CONNECT_ATTEMPTS) throw error
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
}

async function recordedMigrations(client: Client): Promise<number> {
  const result = await client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations",
  )
  return result.rows[0]?.n ?? 0
}

async function markBaseline(client: Client): Promise<void> {
  const [baseline] = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER })
  if (baseline === undefined) throw new Error("drizzle/ holds no migration")

  const pushed = await client.query<{ present: boolean }>(
    "SELECT to_regclass('public.event') IS NOT NULL AS present",
  )
  if (!pushed.rows[0]?.present) {
    throw new Error("this database has no schema; run the migrations instead of marking the baseline")
  }
  // The table as the migrator creates it, so that it finds the mark.
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle")
  await client.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`)
  if (await recordedMigrations(client) !== 0) {
    throw new Error("this database already records migrations; the baseline is only for one that records none")
  }
  await client.query(
    "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
    [baseline.hash, baseline.folderMillis],
  )
  console.log(`marked the baseline as applied (${baseline.folderMillis})`)
}

/**
 * A schema that records no migration was pushed. Running the first migration on
 * it would fail on the first type it creates, halfway through nothing; saying so
 * is clearer.
 */
async function refuseUnrecordedSchema(client: Client): Promise<void> {
  const state = await client.query<{ pushed: boolean, recorded: boolean }>(`SELECT
    to_regclass('public.event') IS NOT NULL AS pushed,
    to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS recorded`)
  const { pushed = false, recorded = false } = state.rows[0] ?? {}
  if (!pushed) return
  if (!recorded || await recordedMigrations(client) === 0) {
    throw new Error("this database has a schema but records no migration; check it and mark the baseline first")
  }
}

const client = await connect(loadOwnerDatabaseUrl(process.env))
try {
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY])
  const db = drizzle(client, { schema, casing: "snake_case" })
  if (process.argv.includes("--mark-baseline")) {
    await markBaseline(client)
  } else {
    await refuseUnrecordedSchema(client)
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
    const total = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER }).length
    console.log(`schema is at migration ${await recordedMigrations(client)} of ${total}`)
    const app = await applyGrantsFromEnv(db, process.env)
    console.log(`granted ${app.user} read and write on ${app.database}, append-only on event`)
  }
} finally {
  await client.end()
}
