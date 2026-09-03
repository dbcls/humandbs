/**
 * Pointing the database tests at the test database.
 *
 * The rewrite happens here rather than in `config.server.ts` because the
 * application has no test database: it reads the two connection URLs the
 * environment gives it, and this replaces them before anything asks for the
 * configuration. `getPool` builds its pool on first use, which is after the
 * setup file has run.
 */

import { beforeAll } from "vitest"

import { getOwnerDb } from "~/db/client.server"
import { assertTestDatabase, databaseName, testDatabaseUrl } from "~/db/test-database"

const CONNECTIONS = ["HUMANDBS_DATABASE_URL", "HUMANDBS_OWNER_DATABASE_URL"] as const

for (const name of CONNECTIONS) {
  const configured = process.env[name]
  if (configured === undefined || configured === "") {
    throw new Error(`${name} is required to run the database tests`)
  }
  process.env[name] = testDatabaseUrl(configured)
}

beforeAll(async () => {
  await assertTestDatabase(getOwnerDb(), databaseName(process.env.HUMANDBS_OWNER_DATABASE_URL ?? ""))
})
