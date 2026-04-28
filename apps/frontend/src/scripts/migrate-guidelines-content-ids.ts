#!/usr/bin/env bun
/**
 * One-time migration: renames the four sub-guideline document IDs from flat
 * to multi-segment form, and updates the site_navigation_config JSON in-place.
 *
 * Renames:
 *   data-sharing-guidelines          → guidelines/data-sharing-guidelines
 *   security-guidelines-for-users    → guidelines/security-guidelines-for-users
 *   security-guidelines-for-submitters → guidelines/security-guidelines-for-submitters
 *   security-guidelines-for-dbcenters  → guidelines/security-guidelines-for-dbcenters
 *
 * Run once after deploying the new code:
 *   bun run apps/frontend/src/scripts/migrate-guidelines-content-ids.ts
 *
 * Safe to run multiple times — already-renamed IDs are skipped.
 */

import { Pool } from "pg";

const RENAMES: [string, string][] = [
  ["data-sharing-guidelines", "guidelines/data-sharing-guidelines"],
  [
    "security-guidelines-for-users",
    "guidelines/security-guidelines-for-users",
  ],
  [
    "security-guidelines-for-submitters",
    "guidelines/security-guidelines-for-submitters",
  ],
  [
    "security-guidelines-for-dbcenters",
    "guidelines/security-guidelines-for-dbcenters",
  ],
];

const databaseUrl =
  process.env.DATABASE_URL ??
  `postgres://${process.env.HUMANDBS_POSTGRES_USER}:${process.env.HUMANDBS_POSTGRES_PASSWORD}@${process.env.HUMANDBS_POSTGRES_HOST}:${process.env.HUMANDBS_POSTGRES_PORT}/${process.env.HUMANDBS_POSTGRES_DB}`;

if (!databaseUrl || databaseUrl.includes("undefined")) {
  console.error(
    "DATABASE_URL or HUMANDBS_POSTGRES_* environment variables are required.",
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

const client = await pool.connect();
try {
  await client.query("BEGIN");

  for (const [oldId, newId] of RENAMES) {
    // Check if old ID still exists
    const { rows: existing } = await client.query(
      `SELECT name FROM document WHERE name = $1`,
      [oldId],
    );

    if (existing.length === 0) {
      console.log(`Skipping "${oldId}" — not found (already migrated?)`);
      continue;
    }

    // Check new ID doesn't already exist
    const { rows: collision } = await client.query(
      `SELECT name FROM document WHERE name = $1`,
      [newId],
    );

    if (collision.length > 0) {
      console.error(
        `Cannot rename "${oldId}" → "${newId}": target already exists.`,
      );
      await client.query("ROLLBACK");
      process.exit(1);
    }

    // FK has no ON UPDATE CASCADE, so we must:
    // 1. Insert new document row (copying all columns)
    // 2. Re-point document_version rows to the new ID
    // 3. Delete the old document row (CASCADE deletes nothing since versions are gone)
    await client.query(
      `INSERT INTO document (name, created_at, hide_toc)
       SELECT $2, created_at, hide_toc FROM document WHERE name = $1`,
      [oldId, newId],
    );
    await client.query(
      `UPDATE document_version SET content_id = $2 WHERE content_id = $1`,
      [oldId, newId],
    );
    await client.query(`DELETE FROM document WHERE name = $1`, [oldId]);

    console.log(`Renamed document: "${oldId}" → "${newId}"`);
  }

  // Update site_navigation_config JSON — replace old contentId strings in the
  // items array with the new ones.
  const { rows: navRows } = await client.query(
    `SELECT id, config, revision FROM site_navigation_config WHERE id = 'global'`,
  );

  if (navRows.length > 0) {
    const row = navRows[0] as { id: string; config: unknown; revision: number };
    let configJson = JSON.stringify(row.config);

    for (const [oldId, newId] of RENAMES) {
      // Replace exact contentId string values in the JSON
      configJson = configJson.replaceAll(
        `"contentId":"${oldId}"`,
        `"contentId":"${newId}"`,
      );
    }

    const newRevision = (row.revision ?? 1) + 1;

    await client.query(
      `UPDATE site_navigation_config SET config = $1::jsonb, revision = $2, updated_at = now() WHERE id = 'global'`,
      [configJson, newRevision],
    );

    await client.query(
      `INSERT INTO site_navigation_config_revision (config_id, config, revision, created_at) VALUES ('global', $1::jsonb, $2, now())`,
      [configJson, newRevision],
    );

    console.log(
      `Updated site_navigation_config to revision ${newRevision}.`,
    );
  } else {
    console.log("No site_navigation_config row found — skipping nav update.");
  }

  await client.query("COMMIT");
  console.log("\nMigration complete.");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Migration failed, rolled back:", err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
