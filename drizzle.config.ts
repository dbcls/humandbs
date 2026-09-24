import { defineConfig } from "drizzle-kit"

import { loadOwnerDatabaseUrl } from "./app/config.server"

/**
 * `casing: "snake_case"` is what lets the table definitions leave column names
 * out: identifiers are camelCase in TypeScript and snake_case in Postgres. The
 * same option is passed to the runtime client, and the two have to agree.
 *
 * The push runs as the owner. The role the application connects as cannot
 * create tables, and deliberately cannot erase the event log either
 * (`app/db/grants.server.ts`), so `db:push` chains the grant script behind it.
 *
 * `out` is where `drizzle-kit generate` writes the versioned migrations a
 * deployment applies (`scripts/migrate.ts`). Development pushes instead, so a
 * schema change is pushed while it is being written and generated once it is
 * settled.
 */
export default defineConfig({
  schema: "./app/db/schema/index.ts",
  dialect: "postgresql",
  casing: "snake_case",
  out: "./drizzle",
  dbCredentials: { url: loadOwnerDatabaseUrl(process.env) },
})
