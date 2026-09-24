/**
 * Creating the database the tests run against, and bringing it to the schema
 * in `drizzle/`.
 *
 * Chained onto the development migrate so that the two cannot drift: one
 * command reaches the development database and this one, and a migration that
 * only landed in half of them would show up as tests failing against a table
 * the application no longer has.
 *
 * **This database holds nothing worth keeping** — every test empties it — so a
 * schema that records no migration is not marked as a baseline but dropped
 * and made again from the migrations.
 */

import { execFileSync } from "node:child_process"
import { join } from "node:path"

import { Client } from "pg"

import { loadConfig, loadOwnerDatabaseUrl } from "~/config.server"
import { databaseName, testDatabaseUrl } from "~/db/test-database"

const config = loadConfig(process.env)
const developmentOwnerUrl = loadOwnerDatabaseUrl(process.env)
const ownerUrl = testDatabaseUrl(developmentOwnerUrl)
const appUrl = testDatabaseUrl(config.databaseUrl)
const name = databaseName(ownerUrl)
const quoted = `"${name.replaceAll("\"", "\"\"")}"`

async function unrecordedSchema(): Promise<boolean> {
  const client = new Client({ connectionString: ownerUrl })
  await client.connect()
  try {
    const state = await client.query<{ pushed: boolean, recorded: boolean }>(`SELECT
      to_regclass('public.event') IS NOT NULL AS pushed,
      to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS recorded`)
    const { pushed = false, recorded = false } = state.rows[0] ?? {}
    return pushed && !recorded
  } finally {
    await client.end()
  }
}

// CREATE / DROP DATABASE cannot run inside a transaction and cannot run on the
// database they act on, so the connection for them is the development one.
const admin = new Client({ connectionString: developmentOwnerUrl })
await admin.connect()
try {
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name])
  if (existing.rowCount !== 0 && await unrecordedSchema()) {
    await admin.query(`DROP DATABASE ${quoted} WITH (FORCE)`)
    console.log(`dropped ${name}, whose schema recorded no migration`)
  }
  const present = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name])
  if (present.rowCount === 0) {
    await admin.query(`CREATE DATABASE ${quoted}`)
    console.log(`created ${name}`)
  }
} finally {
  await admin.end()
}

// Extensions belong to a database, and the script under docker/db/initdb ran
// only for the one the image created.
const created = new Client({ connectionString: ownerUrl })
await created.connect()
await created.query("CREATE EXTENSION IF NOT EXISTS pgroonga")
await created.end()

// The schema and the grants come from the same job a deployment runs; only the
// two connections differ.
execFileSync(join("node_modules", ".bin", "tsx"), ["scripts/migrate.ts"], {
  env: { ...process.env, HUMANDBS_DATABASE_URL: appUrl, HUMANDBS_OWNER_DATABASE_URL: ownerUrl },
  stdio: "inherit",
})
