/**
 * One run of the database tests at a time (`holdTestDatabase`).
 *
 * A setup file runs once per test file, so the lock is taken here, once for the
 * whole run, and let go when the run ends.
 */

import { holdTestDatabase, testDatabaseUrl } from "./app/db/test-database"

export default async function setup(): Promise<() => Promise<void>> {
  const configured = process.env.HUMANDBS_OWNER_DATABASE_URL
  if (configured === undefined || configured === "") {
    throw new Error("HUMANDBS_OWNER_DATABASE_URL is required to run the database tests")
  }
  return holdTestDatabase(testDatabaseUrl(configured))
}
