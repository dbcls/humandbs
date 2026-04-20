import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { execSync } from "node:child_process";
import { Pool, type PoolClient } from "pg";

import * as schema from "@/db/schema";

const {
  HUMANDBS_POSTGRES_USER: user = "humandbs",
  HUMANDBS_POSTGRES_PASSWORD: password = "mysecretpassword",
  HUMANDBS_POSTGRES_HOST: host = "localhost",
  HUMANDBS_POSTGRES_PORT: port = "5432",
} = process.env;

export const TEST_DB = "humandbs_test";

const adminUrl = `postgres://${user}:${password}@${host}:${port}/postgres`;
export const testDbUrl = `postgres://${user}:${password}@${host}:${port}/${TEST_DB}`;

async function withAdminClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: adminUrl });
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
    await pool.end();
  }
}

export async function createTestDatabase(): Promise<void> {
  await withAdminClient(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
    await client.query(`CREATE DATABASE "${TEST_DB}"`);
  });
}

export async function pushSchema(): Promise<void> {
  execSync("bunx drizzle-kit push --force", {
    cwd: new URL("../../../../", import.meta.url).pathname,
    env: {
      ...process.env,
      HUMANDBS_POSTGRES_DB: TEST_DB,
      HUMANDBS_POSTGRES_USER: user,
      HUMANDBS_POSTGRES_PASSWORD: password,
      HUMANDBS_POSTGRES_HOST: host,
      HUMANDBS_POSTGRES_PORT: port,
    },
    stdio: "inherit",
  });
}

export async function dropTestDatabase(): Promise<void> {
  await withAdminClient(async (client) => {
    await client.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid()
    `);
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
  });
}

export function createTestDb() {
  const pool = new Pool({ connectionString: testDbUrl });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export async function clearTables(
  db: ReturnType<typeof drizzle<typeof schema>>,
): Promise<void> {
  await db.execute(sql`SET session_replication_role = replica`);
  await db.execute(sql`TRUNCATE TABLE content_translation, content_item, "user" RESTART IDENTITY CASCADE`);
  await db.execute(sql`SET session_replication_role = DEFAULT`);
}
