#!/usr/bin/env bun
/**
 * One-time migration: rewrites old /data-use/research/* and /data-use/datasets/*
 * link URLs to /research/* and /dataset/* respectively.
 *
 * Run before starting the frontend after the route rename:
 *   bun run apps/frontend/src/scripts/migrate-data-use-urls.ts
 *
 * Safe to run multiple times — if no old URLs exist in the config the script
 * exits without changes.
 */

import { Pool } from "pg";

const URL_REWRITES: Array<{ from: RegExp; to: string }> = [
  { from: /^\/data-use\/datasets(\/|$)/, to: "/dataset$1" },
  { from: /^\/data-use\/research(\/|$)/, to: "/research$1" },
];

function rewriteUrl(url: string): string {
  for (const { from, to } of URL_REWRITES) {
    const rewritten = url.replace(from, to);
    if (rewritten !== url) return rewritten;
  }
  return url;
}

function rewriteConfig(config: unknown): { config: unknown; changed: boolean } {
  if (typeof config !== "object" || config === null || !("items" in config)) {
    return { config, changed: false };
  }

  const cfg = config as { items: unknown[] } & Record<string, unknown>;
  let changed = false;

  const items = cfg.items.map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("type" in item) ||
      (item as { type: unknown }).type !== "link" ||
      !("url" in item)
    ) {
      return item;
    }

    const linkItem = item as { url: string } & Record<string, unknown>;
    const newUrl = rewriteUrl(linkItem.url);
    if (newUrl === linkItem.url) return item;

    console.log(`  Rewriting URL: "${linkItem.url}" → "${newUrl}"`);
    changed = true;
    return { ...linkItem, url: newUrl };
  });

  return { config: { ...cfg, items }, changed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const databaseUrl =
  process.env.DATABASE_URL ??
  `postgres://${process.env.HUMANDBS_POSTGRES_USER}:${process.env.HUMANDBS_POSTGRES_PASSWORD}@${process.env.HUMANDBS_POSTGRES_HOST}:${process.env.HUMANDBS_POSTGRES_PORT}/${process.env.HUMANDBS_POSTGRES_DB}`;

if (!databaseUrl || databaseUrl.includes("undefined")) {
  console.error("DATABASE_URL or HUMANDBS_POSTGRES_* environment variables are required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

const { rows } = await pool.query(
  `SELECT id, config, revision FROM site_navigation_config WHERE id = 'global'`,
);

if (rows.length === 0) {
  console.log("No existing site_navigation_config row found — nothing to migrate.");
  await pool.end();
  process.exit(0);
}

const row = rows[0] as { id: string; config: unknown; revision: number };
const { config: newConfig, changed } = rewriteConfig(row.config);

if (!changed) {
  console.log("No old /data-use/* URLs found in config — nothing to do.");
  await pool.end();
  process.exit(0);
}

const newRevision = (row.revision ?? 1) + 1;

await pool.query(
  "UPDATE site_navigation_config SET config = $1::jsonb, revision = $2, updated_at = now() WHERE id = 'global'",
  [JSON.stringify(newConfig), newRevision],
);

await pool.query(
  "INSERT INTO site_navigation_config_revision (config_id, config, revision, created_at) VALUES ('global', $1::jsonb, $2, now())",
  [JSON.stringify(newConfig), newRevision],
);

console.log(`Migration complete. Config updated to revision ${newRevision}.`);
await pool.end();
