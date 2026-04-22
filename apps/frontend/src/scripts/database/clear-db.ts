import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

async function clearDatabase(tables?: string[]) {
  if (process.env.NODE_ENV === "production") {
    console.error("❌ Cannot clear database in production environment");
    process.exit(1);
  }

  if (process.env.DEBUG_DB_CLEAR === "true") {
    console.log("process.env.HUMANDBS_POSTGRES_HOST", process.env.HUMANDBS_POSTGRES_HOST);
  }

  const db = drizzle(
    new Pool({
      connectionString: `postgres://${process.env.HUMANDBS_POSTGRES_USER}:${process.env.HUMANDBS_POSTGRES_PASSWORD}@${process.env.HUMANDBS_POSTGRES_HOST}:${process.env.HUMANDBS_POSTGRES_PORT}/${process.env.HUMANDBS_POSTGRES_DB}`,
    }),
    {
      schema,
    }
  );

  try {
    console.log("🗑️  Starting database content clearing...");

    await db.transaction(async (tx) => {
      let tableNames: string[];

      if (tables && tables.length > 0) {
        tableNames = tables;
      } else {
        const result = await tx.execute(sql`
          SELECT tablename FROM pg_tables
          WHERE schemaname = 'public'
          ORDER BY tablename;
        `);
        tableNames = result.rows.map((row: any) => row.tablename);
      }

      if (tableNames.length > 0) {
        console.log(`Found ${tableNames.length} table(s) to clear`);

        await tx.execute(sql`SET session_replication_role = replica;`);

        for (const tablename of tableNames) {
          console.log(`🗑️  Clearing table: ${tablename}`);
          await tx.execute(
            sql.raw(`TRUNCATE TABLE "${tablename}" RESTART IDENTITY CASCADE;`)
          );
        }

        await tx.execute(sql`SET session_replication_role = DEFAULT;`);

        console.log("✨ All table content cleared");
      } else {
        console.log("ℹ️  No tables found to clear");
      }
    });

    console.log("✅ Database content cleared successfully");
  } catch (error) {
    console.error("❌ Error during database clearing:", error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Add confirmation prompt if running directly
if (import.meta.main) {
  const tablesArg = process.argv.find((a) => a.startsWith("--tables="));
  const tables = tablesArg
    ? tablesArg.replace("--tables=", "").split(",").map((t) => t.trim())
    : undefined;

  if (tables) {
    console.log(`⚠️  WARNING: This will clear tables: ${tables.join(", ")}`);
  } else {
    console.log(
      "⚠️  WARNING: This will delete all data in the database but keep table structure!"
    );
  }
  console.log("Press Ctrl+C within 5 seconds to cancel...");

  setTimeout(() => {
    clearDatabase(tables).catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }, 5000);
}
