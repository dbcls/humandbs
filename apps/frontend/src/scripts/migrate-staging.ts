#!/usr/bin/env bun
/**
 * One-time staging migration. Run once after deploying the new code.
 * Run this only after `bun run db:migrate` has completed successfully.
 * Safe to run multiple times — each step detects and skips already-applied changes.
 *
 * Steps:
 *   1. Convert old nav config shape (footerGroups/items) → new zones-based shape
 *   2. Rename flat guideline document IDs to nested paths in the document table
 *   3. Rebuild the nav config from the current document table using the
 *      same logic as db:seed-navigation
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";
import { buildNavigationConfig } from "./database/build-navigation-config";

// ---------------------------------------------------------------------------
// Step 1 types — old nav config shape
// ---------------------------------------------------------------------------

interface OldFooterGroup {
  id: string;
  labelKey: string;
  order: number;
  enabled: boolean;
}

interface OldNavItem {
  id: string;
  parentId?: string;
  navbar?: {
    enabled: boolean;
    visibility: string;
    order: number;
    priority: string;
  };
  footer?: { enabled: boolean; groupId: string; order: number };
}

interface OldConfig {
  footerGroups: OldFooterGroup[];
  items: OldNavItem[];
}

// ---------------------------------------------------------------------------
// Step 1 mapping tables
// ---------------------------------------------------------------------------

const ITEM_ID_MAP: Record<string, string> = {
  home: "00000000-0000-4000-8000-000000000001",
  "data-submission": "00000000-0000-4000-8000-000000000002",
  guidelines: "00000000-0000-4000-8000-000000000003",
  "data-sharing-guidelines": "00000000-0000-4000-8000-000000000004",
  "security-guidelines-for-users": "00000000-0000-4000-8000-000000000005",
  "security-guidelines-for-submitters": "00000000-0000-4000-8000-000000000006",
  "security-guidelines-for-dbcenters": "00000000-0000-4000-8000-000000000007",
  "data-usage": "00000000-0000-4000-8000-000000000008",
  "research-list": "00000000-0000-4000-8000-000000000009",
  "dataset-list": "00000000-0000-4000-8000-000000000010",
  "data-processing": "00000000-0000-4000-8000-000000000011",
  "off-premise-server": "00000000-0000-4000-8000-000000000012",
  dac: "00000000-0000-4000-8000-000000000013",
  publications: "00000000-0000-4000-8000-000000000014",
  violation: "00000000-0000-4000-8000-000000000015",
  "privacy-policy": "00000000-0000-4000-8000-000000000016",
  faq: "00000000-0000-4000-8000-000000000017",
  "supported-browsers": "00000000-0000-4000-8000-000000000018",
};

const LINK_ITEMS: Record<
  string,
  { url: string; label: Record<string, string> }
> = {
  "research-list": {
    url: "/research",
    label: { en: "Research List", ja: "研究一覧" },
  },
  "dataset-list": {
    url: "/dataset",
    label: { en: "Dataset List", ja: "データセット一覧" },
  },
};

const GROUP_ID_MAP: Record<string, string> = {
  overview: "00000000-0000-4001-8000-000000000001",
  guidelines: "00000000-0000-4001-8000-000000000002",
  submission: "00000000-0000-4001-8000-000000000003",
  usage: "00000000-0000-4001-8000-000000000004",
  policy: "00000000-0000-4001-8000-000000000005",
};

const GROUP_LABELS: Record<string, Record<string, string>> = {
  overview: { en: "Overview", ja: "概要" },
  guidelines: { en: "Guidelines", ja: "ガイドライン" },
  submission: { en: "Submission", ja: "提供" },
  usage: { en: "Usage", ja: "利用" },
  policy: { en: "Policies", ja: "ポリシー" },
};

// ---------------------------------------------------------------------------
// Step 2 — guideline renames
// ---------------------------------------------------------------------------

const GUIDELINE_RENAMES: [string, string][] = [
  ["data-sharing-guidelines", "guidelines/data-sharing-guidelines"],
  ["security-guidelines-for-users", "guidelines/security-guidelines-for-users"],
  [
    "security-guidelines-for-submitters",
    "guidelines/security-guidelines-for-submitters",
  ],
  [
    "security-guidelines-for-dbcenters",
    "guidelines/security-guidelines-for-dbcenters",
  ],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOldShape(config: unknown): config is OldConfig {
  return (
    typeof config === "object" &&
    config !== null &&
    "footerGroups" in config &&
    "items" in config &&
    !("zones" in config)
  );
}

function convertOldShape(old: OldConfig): unknown {
  const newItems = old.items.map((item) => {
    const newId = ITEM_ID_MAP[item.id];
    if (!newId) throw new Error(`Unknown old item id: ${item.id}`);

    const linkInfo = LINK_ITEMS[item.id];
    const isLink = !!linkInfo;

    const newItem: Record<string, unknown> = {
      id: newId,
      type: isLink ? "link" : "document",
      ...(isLink
        ? { url: linkInfo.url, label: linkInfo.label }
        : { contentId: item.id }),
    };

    if (item.navbar) {
      const parentNewId = item.parentId
        ? ITEM_ID_MAP[item.parentId]
        : undefined;
      if (item.parentId && !parentNewId)
        throw new Error(`Unknown old parentId: ${item.parentId}`);
      newItem.navbar = {
        enabled: item.navbar.enabled,
        visibility: item.navbar.visibility,
        order: item.navbar.order,
        priority: item.navbar.priority,
        ...(parentNewId ? { parentItemId: parentNewId } : {}),
      };
    }

    return newItem;
  });

  const newFooterGroups = old.footerGroups
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((oldGroup, idx) => {
      const newGroupId = GROUP_ID_MAP[oldGroup.id];
      if (!newGroupId)
        throw new Error(`Unknown old footer group id: ${oldGroup.id}`);

      const groupItems = old.items
        .filter((item) => item.footer?.groupId === oldGroup.id)
        .sort((a, b) => (a.footer?.order ?? 0) - (b.footer?.order ?? 0))
        .map((item) => {
          const newItemId = ITEM_ID_MAP[item.id];
          if (!newItemId) throw new Error(`Unknown item id: ${item.id}`);
          return {
            id: newItemId,
            order: item.footer!.order,
            enabled: item.footer?.enabled ?? true,
          };
        });

      return {
        id: newGroupId,
        label: GROUP_LABELS[oldGroup.id] ?? {
          en: oldGroup.id,
          ja: oldGroup.id,
        },
        order: (idx + 1) * 10,
        enabled: oldGroup.enabled,
        items: groupItems,
      };
    });

  return {
    items: newItems,
    zones: {
      footer: { groups: newFooterGroups },
      navbar: { groups: [] },
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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
const db = drizzle(client, { schema });

try {
  await client.query("BEGIN");

  // -------------------------------------------------------------------------
  // Step 1: convert old nav shape if needed
  // -------------------------------------------------------------------------
  const { rows: navRows } = await client.query(
    `SELECT id, config, revision FROM site_navigation_config WHERE id = 'global'`,
  );

  if (navRows.length === 0) {
    console.log(
      "No site_navigation_config row found — skipping shape migration.",
    );
  } else {
    const row = navRows[0] as { id: string; config: unknown; revision: number };

    if (isOldShape(row.config)) {
      console.log("Step 1: converting old nav config shape...");
      const newConfig = convertOldShape(row.config);
      const newRevision = (row.revision ?? 1) + 1;

      await client.query(
        `UPDATE site_navigation_config SET config = $1::jsonb, revision = $2, updated_at = now() WHERE id = 'global'`,
        [JSON.stringify(newConfig), newRevision],
      );
      await client.query(
        `INSERT INTO site_navigation_config_revision (config_id, config, revision, created_at) VALUES ('global', $1::jsonb, $2, now())`,
        [JSON.stringify(newConfig), newRevision],
      );
      console.log(`  Done — config updated to revision ${newRevision}.`);
    } else {
      console.log("Step 1: nav config already in new shape — skipping.");
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: rename flat guideline document IDs
  // -------------------------------------------------------------------------
  console.log("Step 2: renaming guideline document IDs...");

  for (const [oldId, newId] of GUIDELINE_RENAMES) {
    const { rows: existing } = await client.query(
      `SELECT name FROM document WHERE name = $1`,
      [oldId],
    );
    if (existing.length === 0) {
      console.log(`  Skipping "${oldId}" — not found (already migrated?)`);
      continue;
    }

    const { rows: collision } = await client.query(
      `SELECT name FROM document WHERE name = $1`,
      [newId],
    );
    if (collision.length > 0) {
      throw new Error(
        `Cannot rename "${oldId}" → "${newId}": target already exists.`,
      );
    }

    await client.query(
      `INSERT INTO document (name, created_at, hide_toc)
       SELECT $2, created_at, hide_toc FROM document WHERE name = $1`,
      [oldId, newId],
    );
    await client.query(
      `UPDATE document_version SET document_id = (SELECT id FROM document WHERE name = $2)
       WHERE document_id = (SELECT id FROM document WHERE name = $1)`,
      [oldId, newId],
    );
    await client.query(`DELETE FROM document WHERE name = $1`, [oldId]);

    console.log(`  Renamed: "${oldId}" → "${newId}"`);
  }

  // -------------------------------------------------------------------------
  // Step 3: rebuild nav config from the current document table
  // -------------------------------------------------------------------------
  console.log("Step 3: rebuilding nav config from current documents...");

  const { rows: freshNavRows } = await client.query(
    `SELECT id, config, revision FROM site_navigation_config WHERE id = 'global'`,
  );

  if (freshNavRows.length === 0) {
    console.log("  No nav config found — skipping.");
  } else {
    const row = freshNavRows[0] as {
      id: string;
      config: unknown;
      revision: number;
    };
    const newConfig = await buildNavigationConfig(db);
    const newRevision = (row.revision ?? 1) + 1;

    await client.query(
      `UPDATE site_navigation_config SET config = $1::jsonb, revision = $2, updated_at = now() WHERE id = 'global'`,
      [JSON.stringify(newConfig), newRevision],
    );
    await client.query(
      `INSERT INTO site_navigation_config_revision (config_id, config, revision, created_at) VALUES ('global', $1::jsonb, $2, now())`,
      [JSON.stringify(newConfig), newRevision],
    );
    console.log(`  Nav config rebuilt — revision ${newRevision}.`);
  }

  await client.query("COMMIT");
  console.log("\nAll steps complete.");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Migration failed, rolled back:", err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
