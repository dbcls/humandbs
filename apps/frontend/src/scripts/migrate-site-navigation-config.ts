#!/usr/bin/env bun
/**
 * One-time migration: converts the old SiteNavigationConfig shape (hardcoded
 * NavigationItemId + FooterGroupId) to the new shape (UUID-based NavigationItem
 * + NavigationGroup inside zones).
 *
 * Run once after deploying the new code:
 *   bun run apps/frontend/src/scripts/migrate-site-navigation-config.ts
 *
 * Safe to run multiple times — if no old-shape config exists in the DB (or the
 * row is already in the new shape), it exits without changes.
 */

import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Old shape types (kept here to avoid importing from the deleted source)
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
  footer?: {
    enabled: boolean;
    groupId: string;
    order: number;
  };
}

interface OldConfig {
  footerGroups: OldFooterGroup[];
  items: OldNavItem[];
}

// ---------------------------------------------------------------------------
// New shape types (mirror of site-navigation.ts)
// ---------------------------------------------------------------------------

interface NewNavigationItem {
  id: string;
  type: "document" | "link";
  contentId?: string;
  url?: string;
  label?: Record<string, string>;
  navbar?: {
    enabled: boolean;
    visibility: string;
    order: number;
    priority: string;
    parentItemId?: string;
  };
}

interface NewNavigationGroupItem {
  id: string;
  order: number;
  enabled?: boolean;
}

interface NewNavigationGroup {
  id: string;
  label: Record<string, string>;
  order: number;
  enabled: boolean;
  items: NewNavigationGroupItem[];
}

interface NewConfig {
  items: NewNavigationItem[];
  zones: {
    footer: { groups: NewNavigationGroup[] };
    navbar: { groups: NewNavigationGroup[] };
  };
}

// ---------------------------------------------------------------------------
// Mapping tables — old item ID → new UUID + link info
// ---------------------------------------------------------------------------

// These are the stable UUIDs from the new default config
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

// Items that are link-type (route-only, no CMS document)
const LINK_ITEMS: Record<
  string,
  { url: string; label: Record<string, string> }
> = {
  "research-list": {
    url: "/data-use/research",
    label: { en: "Research List", ja: "研究一覧" },
  },
  "dataset-list": {
    url: "/data-use/datasets",
    label: { en: "Dataset List", ja: "データセット一覧" },
  },
};

// Old footer group ID → new UUID + inline labels
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
// Migration logic
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

function migrateConfig(old: OldConfig): NewConfig {
  // Build new NavigationItem list
  const newItems: NewNavigationItem[] = old.items.map((item) => {
    const newId = ITEM_ID_MAP[item.id];
    if (!newId) {
      throw new Error(`Unknown old item id: ${item.id}`);
    }

    const linkInfo = LINK_ITEMS[item.id];
    const isLink = !!linkInfo;

    const newItem: NewNavigationItem = {
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
      if (item.parentId && !parentNewId) {
        throw new Error(`Unknown old parentId: ${item.parentId}`);
      }
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

  // Build footer groups — preserve enabled/order from old config
  const oldGroupsSorted = old.footerGroups
    .slice()
    .sort((a, b) => a.order - b.order);

  const newFooterGroups: NewNavigationGroup[] = oldGroupsSorted.map(
    (oldGroup, idx) => {
      const newGroupId = GROUP_ID_MAP[oldGroup.id];
      if (!newGroupId) {
        throw new Error(`Unknown old footer group id: ${oldGroup.id}`);
      }

      // Collect items that belonged to this group, sorted by their footer order
      const groupItems: NewNavigationGroupItem[] = old.items
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
    },
  );

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

const { rows } = await pool.query(
  `SELECT id, config, revision FROM site_navigation_config WHERE id = 'global'`,
);

if (rows.length === 0) {
  console.log(
    "No existing site_navigation_config row found — nothing to migrate.",
  );
  await pool.end();
  process.exit(0);
}

const row = rows[0] as { id: string; config: unknown; revision: number };
const config = row.config;

if (!isOldShape(config)) {
  console.log(
    "Config is not in old shape (already migrated or unknown format) — skipping.",
  );
  await pool.end();
  process.exit(0);
}

console.log("Migrating old site navigation config to new shape...");
const newConfig = migrateConfig(config);
const newRevision = (row.revision ?? 1) + 1;

await pool.query(
  "UPDATE site_navigation_config SET config = $1::jsonb, revision = $2, updated_at = now() WHERE id = 'global'",
  [JSON.stringify(newConfig), newRevision],
);

// Insert a revision snapshot
await pool.query(
  "INSERT INTO site_navigation_config_revision (config_id, config, revision, created_at) VALUES ('global', $1::jsonb, $2, now())",
  [JSON.stringify(newConfig), newRevision],
);

console.log(`Migration complete. Config updated to revision ${newRevision}.`);
await pool.end();
