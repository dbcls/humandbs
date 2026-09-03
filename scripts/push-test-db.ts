/**
 * Creating the database the tests run against, and putting the schema in it.
 *
 * Chained onto `db:push` so that the two cannot drift: one command reaches the
 * development database and this one, and a schema change that only landed in
 * half of them would show up as tests failing against a table the application
 * no longer has.
 */

import { execFileSync } from "node:child_process"
import { join } from "node:path"

import { Client } from "pg"

import { loadConfig } from "~/config.server"
import { databaseName, testDatabaseUrl } from "~/db/test-database"

const config = loadConfig(process.env)
const ownerUrl = testDatabaseUrl(config.ownerDatabaseUrl)
const appUrl = testDatabaseUrl(config.databaseUrl)
const name = databaseName(ownerUrl)

// CREATE DATABASE cannot run inside a transaction and cannot run on the
// database it creates, so the connection for it is the development one.
const admin = new Client({ connectionString: config.ownerDatabaseUrl })
await admin.connect()
const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name])
if (existing.rowCount === 0) {
  await admin.query(`CREATE DATABASE "${name.replaceAll("\"", "\"\"")}"`)
  console.log(`created ${name}`)
}
await admin.end()

// Extensions belong to a database, and the script under docker/db/initdb ran
// only for the one the image created.
const created = new Client({ connectionString: ownerUrl })
await created.connect()
await created.query("CREATE EXTENSION IF NOT EXISTS pgroonga")
await created.end()

// The schema and the grants come from the same tools the development database
// uses; only the two connections differ.
const env = {
  ...process.env,
  HUMANDBS_DATABASE_URL: appUrl,
  HUMANDBS_OWNER_DATABASE_URL: ownerUrl,
}
const bin = (command: string): string => join("node_modules", ".bin", command)

execFileSync(bin("drizzle-kit"), ["push"], { env, stdio: "inherit" })
execFileSync(bin("tsx"), ["scripts/grants.ts"], { env, stdio: "inherit" })
