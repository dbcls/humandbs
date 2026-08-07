/**
 * Emptying the database.
 *
 * The tables are read from the catalog rather than listed here, so that a table
 * added to the schema is emptied without anyone remembering to add it. CASCADE
 * then covers the order.
 *
 * It takes the owner connection because the role the application connects as
 * cannot TRUNCATE anything (`grants.server.ts`). The callers are the dev data
 * load and the database tests; nothing that serves a request empties tables.
 */

import { sql } from "drizzle-orm"

import type { Executor } from "./client.server"

export async function emptyDatabase(owner: Executor): Promise<void> {
  const tables = await owner.execute<{ name: string }>(sql`
    SELECT quote_ident(tablename) AS name FROM pg_tables WHERE schemaname = 'public'
  `)
  const names = tables.rows.map((row) => row.name)
  if (names.length === 0) return
  await owner.execute(sql.raw(`TRUNCATE ${names.join(", ")} CASCADE`))
}
