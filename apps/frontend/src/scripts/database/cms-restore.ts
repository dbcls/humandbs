import { readFile } from "node:fs/promises";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";
import { createCmsDataTransferArchiveRestorer } from "@/lib/cmsDataTransferArchive";
import {
  CMS_DATA_TRANSFER_CATEGORIES,
  cmsDataTransferCategorySchema,
  type CmsDataTransferCategory,
} from "@/serverFunctions/cmsDataTransfer";

import { buildDatabaseUrl } from "./utils";

interface ParsedArgs {
  input: string;
  categories: CmsDataTransferCategory[];
  userId: string | undefined;
}

function parseArgs(): ParsedArgs {
  const positional: string[] = [];
  let categories: CmsDataTransferCategory[] | null = null;
  let userId: string | undefined;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--categories=")) {
      categories = arg
        .slice("--categories=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => cmsDataTransferCategorySchema.parse(s));
    } else if (arg.startsWith("--user=")) {
      userId = arg.slice("--user=".length);
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (!arg.startsWith("--")) {
      positional.push(arg);
    }
  }

  if (positional.length !== 1) {
    printUsage();
    throw new Error("Specify exactly one archive path.");
  }

  if (categories === null || categories.length === 0) {
    printUsage();
    throw new Error("Specify --categories=<list>; restore is destructive.");
  }

  return { input: positional[0], categories, userId };
}

function printUsage(): void {
  console.log(`Usage: bun run db:cms-restore <archive.tar.gz> --categories=<list> [--user=<id>]

Arguments:
  archive.tar.gz       Path to the archive to restore from.

Options:
  --categories=<list>  Comma-separated category list to restore. Required.
                       Available: ${CMS_DATA_TRANSFER_CATEGORIES.join(", ")}
  --user=<id>          User id to record as restoredBy (optional).
  -h, --help           Show this message.

Restore is destructive: each selected category is replaced with archive contents.

Environment: same as db:cms-export
(HUMANDBS_POSTGRES_* + HUMANDBS_FRONTEND_PUBLIC_FILES_DIR / HUMANDBS_FRONTEND_PUBLIC_FILES_BASE).
`);
}

async function main(): Promise<void> {
  const { input, categories, userId } = parseArgs();
  const absInput = path.resolve(input);
  const fileBuffer = await readFile(absInput);

  const pool = new Pool({ connectionString: buildDatabaseUrl() });
  const db = drizzle(pool, { schema });

  try {
    const restore = createCmsDataTransferArchiveRestorer({
      database: db,
    });

    const result = await restore({
      fileName: path.basename(absInput),
      bytes: new Uint8Array(fileBuffer),
      categories,
      restoredByUserId: userId,
    });

    console.log("Restore completed.");
    console.log(`Archive: ${result.archiveName}`);
    console.log(`Restored categories: ${result.restoredCategories.join(", ")}`);
    console.log(`Counts: ${JSON.stringify(result.counts)}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
