import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";

async function resetDatabase() {
  if (process.env.NODE_ENV === "production") {
    console.error("❌ Cannot reset database in production environment");
    process.exit(1);
  }

  console.log("process.env.POSTGRES_HOST", process.env.POSTGRES_HOST);

  const db = drizzle(
    `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`,
    {
      schema,
    }
  );

  try {
    console.log("🗑️  Starting database reset...");

    await db.transaction(async (tx) => {
      // Get all tables in the public schema
      const tables = await tx.execute(sql`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public';
      `);

      // Drop all tables
      for (const { tablename } of tables) {
        await tx.execute(
          sql.raw(`DROP TABLE IF EXISTS "${tablename}" CASCADE;`)
        );
      }

      console.log("✨ All tables dropped");
    });

    console.log("✅ Database reset successfully");
  } catch (error) {
    console.error("❌ Error during database reset:", error);
    throw error;
  }
}

// Add confirmation prompt if running directly
if (import.meta.main) {
  console.log("⚠️  WARNING: This will delete all data in the database!");
  console.log("Press Ctrl+C within 5 seconds to cancel...");

  setTimeout(() => {
    resetDatabase().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }, 5000);
}
