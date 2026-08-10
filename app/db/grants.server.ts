/**
 * The privileges of the role the application connects as.
 *
 * The event log is append-only, and that is enforced here rather than in the
 * application or in a trigger: whatever can UPDATE the log can also correct a
 * trigger's own bookkeeping, so the only place the guarantee can live is the
 * privileges of the role that serves requests. The application therefore gets
 * SELECT and INSERT on `event` and nothing else, and — as a consequence of
 * granting privileges one by one rather than as ALL — cannot empty any table.
 *
 * These are applied after every schema push. `DROP SCHEMA public CASCADE`, the
 * documented way to rebuild the schema, takes the default privileges with it,
 * and a table created since the last run would otherwise be unreachable.
 */

import { sql } from "drizzle-orm"

import type { Executor } from "./client.server"

export interface Connection {
  user: string
  password: string
  database: string
}

/**
 * The connection string is the definition of the role. Reading the role out of
 * it rather than out of a setting of its own means the role the script creates
 * and the role the application connects as cannot drift apart.
 *
 * The components are percent-decoded, as libpq decodes them: a password with an
 * `@` in it reaches Postgres decoded, and the role would be created with the
 * encoded form otherwise.
 */
export function parseConnection(url: string): Connection {
  const parsed = new URL(url)
  return {
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
  }
}

export function quoteIdentifier(value: string): string {
  if (value.includes("\0")) {
    throw new Error("an identifier cannot contain a null byte")
  }
  return `"${value.replaceAll("\"", "\"\"")}"`
}

/**
 * Postgres runs with `standard_conforming_strings` on, so a backslash inside a
 * single-quoted string is an ordinary character and doubling the quote is the
 * whole of the escaping.
 */
export function quoteLiteral(value: string): string {
  if (value.includes("\0")) {
    throw new Error("a string literal cannot contain a null byte")
  }
  return `'${value.replaceAll("'", "''")}'`
}

export function grantStatements(app: Connection, owner: Connection): string[] {
  const role = quoteIdentifier(app.user)
  return [
    // There is no CREATE ROLE IF NOT EXISTS, and the password is set separately
    // so that a change in the environment reaches an existing role.
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteLiteral(app.user)}) THEN
         CREATE ROLE ${role} LOGIN;
       END IF;
     END $$`,
    `ALTER ROLE ${role} WITH LOGIN PASSWORD ${quoteLiteral(app.password)}`,
    `GRANT CONNECT ON DATABASE ${quoteIdentifier(app.database)} TO ${role}`,
    `GRANT USAGE ON SCHEMA public TO ${role}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdentifier(owner.user)} IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    `REVOKE UPDATE, DELETE, TRUNCATE ON event FROM ${role}`,
    // The description a publish wrote over is part of the same trail, and the
    // cascade that removes it with its dataset runs as the table owner.
    `REVOKE UPDATE, DELETE, TRUNCATE ON replaced_dataset_content FROM ${role}`,
  ]
}

/** Runs the statements above on the owner connection. Idempotent. */
export async function applyGrants(owner: Executor, statements: string[]): Promise<void> {
  for (const statement of statements) {
    await owner.execute(sql.raw(statement))
  }
}
