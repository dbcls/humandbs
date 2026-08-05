import { defineConfig } from "drizzle-kit"

import { loadConfig } from "./app/config.server"

/**
 * `casing: "snake_case"` is what lets the table definitions leave column names
 * out: identifiers are camelCase in TypeScript and snake_case in Postgres. The
 * same option is passed to the runtime client, and the two have to agree.
 */
export default defineConfig({
  schema: "./app/db/schema/index.ts",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url: loadConfig(process.env).databaseUrl },
})
