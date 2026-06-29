import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";
import { createCmsDataTransferArchiveBuilder } from "@/lib/cmsDataTransferArchive";
import {
  CMS_DATA_TRANSFER_CATEGORIES,
  cmsDataTransferCategorySchema,
  type CmsDataTransferCategory,
} from "@/serverFunctions/cmsDataTransfer";

import { buildDatabaseUrl } from "./utils";

interface ParsedArgs {
  categories: CmsDataTransferCategory[];
  out: string;
}

function parseArgs(): ParsedArgs {
  let categories: CmsDataTransferCategory[] = [...CMS_DATA_TRANSFER_CATEGORIES];
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z");
  let out = `./cms-data-export-${timestamp}.tar.gz`;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--categories=")) {
      const list = arg
        .slice("--categories=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      categories = list.map((s) => cmsDataTransferCategorySchema.parse(s));
    } else if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length);
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  return { categories, out };
}

function printUsage(): void {
  console.log(`Usage: bun run db:cms-export [--categories=<list>] [--out=<path>]

Options:
  --categories=<list>   Comma-separated category list (default: all).
                        Available: ${CMS_DATA_TRANSFER_CATEGORIES.join(", ")}
  --out=<path>          Output tar.gz path (default: ./cms-data-export-<timestamp>.tar.gz)
  -h, --help            Show this message

Environment:
  HUMANDBS_POSTGRES_USER / PASSWORD / HOST / PORT / DB    Required.
  HUMANDBS_FRONTEND_PUBLIC_FILES_DIR    Subdir name under ./public or ./dist/client
                                        (default: public-files). Used for "assets" category.
  NODE_ENV=production                   Resolve asset dir under ./dist/client instead of ./public.
`);
}

function resolveAssetDir(): string {
  const filesSubdir = process.env.HUMANDBS_FRONTEND_PUBLIC_FILES_DIR ?? "public-files";
  return path.resolve(
    process.env.NODE_ENV === "development" ? "./public" : "./dist/client",
    filesSubdir,
  );
}

async function main(): Promise<void> {
  const { categories, out } = parseArgs();

  const pool = new Pool({ connectionString: buildDatabaseUrl() });
  const db = drizzle(pool, { schema });

  try {
    const createArchive = createCmsDataTransferArchiveBuilder({
      database: db,
      getAssetDir: resolveAssetDir,
    });

    const { manifest, bytes } = await createArchive({
      categories,
      createdBy: null,
    });

    const absOut = path.resolve(out);
    await mkdir(path.dirname(absOut), { recursive: true });
    await writeFile(absOut, bytes);

    console.log(`Archive written: ${absOut}`);
    console.log(`Categories: ${manifest.categories.join(", ")}`);
    console.log(`Counts: ${JSON.stringify(manifest.counts)}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
