import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";

async function resetDatabase(tables?: string[]) {
  if (process.env.NODE_ENV === "production") {
    console.error("❌ Cannot reset database in production environment");
    process.exit(1);
  }

  const db = drizzle(
    `postgres://${process.env.HUMANDBS_POSTGRES_USER}:${process.env.HUMANDBS_POSTGRES_PASSWORD}@${process.env.HUMANDBS_POSTGRES_HOST}:${process.env.HUMANDBS_POSTGRES_PORT}/${process.env.HUMANDBS_POSTGRES_DB}`,
    { schema },
  );

  try {
    console.log("🗑️  Starting database reset...");

    await db.transaction(async (tx) => {
      let tableNames: string[];

      if (tables && tables.length > 0) {
        tableNames = tables;
      } else {
        const result = await tx.execute(sql`
          SELECT tablename FROM pg_tables
          WHERE schemaname = 'public';
        `);
        tableNames = result.rows.map((row: any) => row.tablename);
      }

      if (tableNames.length > 0) {
        for (const tablename of tableNames) {
          console.log(`🗑️  Dropping table: ${tablename}`);
          await tx.execute(
            sql.raw(`DROP TABLE IF EXISTS "${tablename}" CASCADE;`),
          );
        }
        console.log("✨ Tables dropped");
      } else {
        console.log("ℹ️  No tables found to drop");
      }
    });

    console.log("✅ Database reset successfully");
  } catch (error) {
    console.error("❌ Error during database reset:", error);
    throw error;
  }
}

if (import.meta.main) {
  const yes = process.argv.includes("-y");
  const tablesArg = process.argv.find((a) => a.startsWith("--tables="));
  const tables = tablesArg
    ? tablesArg
        .replace("--tables=", "")
        .split(",")
        .map((t) => t.trim())
    : undefined;

  const warning = tables
    ? `⚠️  WARNING: This will DROP tables: ${tables.join(", ")}`
    : "⚠️  WARNING: This will DROP ALL TABLES in the database!";

  if (yes) {
    resetDatabase(tables).catch((err) => {
      console.error(err);
      process.exit(1);
    });
  } else {
    console.log(warning);
    process.stdout.write('Type "yes" to confirm: ');

    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (input) => {
      if (input.toString().trim() === "yes") {
        resetDatabase(tables).catch((err) => {
          console.error(err);
          process.exit(1);
        });
      } else {
        console.log("Aborted.");
        process.exit(0);
      }
    });
  }
}
