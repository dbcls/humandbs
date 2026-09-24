import { defineConfig } from "drizzle-kit"

import { loadOwnerDatabaseUrl } from "./app/config.server"

/**
 * `casing: "snake_case"` is what lets the table definitions leave column names
 * out: identifiers are camelCase in TypeScript and snake_case in Postgres. The
 * same option is passed to the runtime client, and the two have to agree.
 *
 * `out` is where `drizzle-kit generate` writes the versioned migrations, and
 * they are the only way the schema reaches any database, development included
 * (`scripts/migrate.ts`). `drizzle-kit push` is not used: it reads multi-column
 * unique constraints, composite primary keys and the PGroonga index back as
 * different from their definitions, and on every run tries to drop and make
 * them again — which on tables holding rows stops at a confirmation.
 *
 * The URL is the owner's, the only role that may change the schema.
 */
export default defineConfig({
  schema: "./app/db/schema/index.ts",
  dialect: "postgresql",
  casing: "snake_case",
  out: "./drizzle",
  dbCredentials: { url: loadOwnerDatabaseUrl(process.env) },
})
