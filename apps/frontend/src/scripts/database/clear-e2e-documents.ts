import { like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";

import { buildDatabaseUrl } from "./utils";

const db = drizzle(buildDatabaseUrl(), { schema });

async function clearDocuments() {
  const deleted = await db
    .delete(schema.document)
    .where(like(schema.document.contentId, "playwright-test-%"))
    .returning({ contentId: schema.document.contentId });

  console.log(`Deleted ${deleted.length} e2e document(s)`);
  deleted.forEach((d) => {
    console.log(" -", d.contentId);
  });
}

const args = process.argv.slice(2);

if (args.includes("--documents")) await clearDocuments();

if (args.length === 0) console.log("No flags provided. Use --documents.");

await db.$client.end();
