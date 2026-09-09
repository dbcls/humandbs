/**
 * Where the database tests connect.
 *
 * The name is derived from the development one rather than configured. A
 * setting can be pointed at the wrong database, and the tests empty every table
 * of whatever they reach — the development data behind that is rebuilt from a
 * v1 dump, a hand-taken CSV and two downloaded dictionaries, so being wrong
 * once costs an afternoon. The same reasoning as the cookie flag in
 * `config.server.ts`: the value that must not be wrong is not offered as a
 * value at all.
 *
 * `assertTestDatabase` then checks the connection that was actually made.
 * Deriving and checking overlap on purpose; what they guard is not recoverable
 * from the tests themselves.
 */

import { sql } from "drizzle-orm"

import type { Executor } from "./client.server"

const SUFFIX = "_test"

/** The database a connection URL addresses. */
export function databaseName(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""))
  if (name === "") {
    throw new Error("the connection URL names no database")
  }
  return name
}

/**
 * The same connection, against the test database.
 *
 * Idempotent, because a setup file runs once per test file and the environment
 * it rewrites is shared.
 */
export function testDatabaseUrl(url: string): string {
  const name = databaseName(url)
  if (name.endsWith(SUFFIX)) return url

  const parsed = new URL(url)
  parsed.pathname = `/${encodeURIComponent(name + SUFFIX)}`
  return parsed.toString()
}

/**
 * Refuses to go on unless the connection is to the test database.
 *
 * Both halves matter: the suffix rules out a database holding anything worth
 * keeping, and the name rules out a different one that happens to end the same
 * way.
 */
export async function assertTestDatabase(owner: Executor, expected: string): Promise<void> {
  const result = await owner.execute<{ name: string }>(sql`SELECT current_database() AS name`)
  const actual = result.rows[0]?.name

  if (actual === undefined) {
    throw new Error("could not read the name of the connected database")
  }
  if (!actual.endsWith(SUFFIX) || actual !== expected) {
    throw new Error(
      `the database tests are connected to "${actual}" rather than "${expected}"; `
      + "they empty every table, so nothing is run",
    )
  }
}
