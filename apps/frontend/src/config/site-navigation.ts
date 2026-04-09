import { type LinkOptions } from "@tanstack/react-router";

import { type Locale } from "@/config/i18n";

// ---------------------------------------------------------------------------
// Core model types
// ---------------------------------------------------------------------------

export type NavVisibility = "essential" | "secondary";
export type NavPriority = "important" | "medium" | "optional";

/**
 * A NavigationItem is a wrapper around either a CMS document or an internal link.
 * Items are identified by a stable UUID and referenced by groups via that UUID.
 */
export type NavigationItemType = "document" | "link";

export interface NavigationItem {
  id: string; // UUID
  type: NavigationItemType;
  // For type === "document": the contentId from the document table
  contentId?: string;
  // For type === "link": the internal URL path
  url?: string;
  // For type === "link": required display label per locale
  // For type === "document": optional override label (falls back to published title)
  label?: Record<string, string>;
  // Navbar configuration (if this item appears in the navbar zone)
  navbar?: {
    enabled: boolean;
    visibility: NavVisibility;
    order: number;
    priority: NavPriority;
    parentItemId?: string; // UUID of parent NavigationItem for 2-level nesting
  };
}

export interface NavigationGroupItem {
  id: string; // references NavigationItem.id
  order: number;
  enabled?: boolean;
}

export interface NavigationGroup {
  id: string; // UUID
  label: Record<string, string>; // { en: "...", ja: "..." }
  parentGroupId?: string; // UUID — for navbar nesting (max 2 levels); unused by footer
  order: number;
  enabled: boolean;
  items: NavigationGroupItem[];
}

export interface NavigationZone {
  groups: NavigationGroup[];
}

export interface SiteNavigationConfig {
  items: NavigationItem[];
  zones: {
    footer: NavigationZone;
    navbar: NavigationZone;
  };
}

// ---------------------------------------------------------------------------
// Resolved output types (used by Navbar, Footer, MobileNav components)
// ---------------------------------------------------------------------------

export interface ResolvedNavbarItem {
  id: string;
  label: string;
  linkOptions: LinkOptions;
  priority: NavPriority;
  children?: Array<{
    id: string;
    label: string;
    linkOptions: LinkOptions;
  }>;
}

export interface ResolvedFooterGroup {
  id: string;
  label: string;
  items: Array<{
    id: string;
    label: string;
    linkOptions: LinkOptions;
  }>;
}

export interface ResolvedSiteNavigation {
  navbar: ResolvedNavbarItem[];
  footer: ResolvedFooterGroup[];
}

// ---------------------------------------------------------------------------
// Registry — maps known item contentIds/urls to link builders
// ---------------------------------------------------------------------------

interface NavigationItemRegistry {
  getLinkOptions: (lang: Locale) => LinkOptions;
  defaultLabel: Record<string, string>; // fallback labels
}

const navigationRegistry = new Map<string, NavigationItemRegistry>([
  [
    "home",
    {
      getLinkOptions: (lang) => ({ to: "/{-$lang}", params: { lang } }),
      defaultLabel: { en: "Home", ja: "ホーム" },
    },
  ],
  [
    "data-submission",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/data-submission",
        params: { lang },
      }),
      defaultLabel: { en: "Data submission", ja: "データの提供" },
    },
  ],
  [
    "guidelines",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/guidelines",
        params: { lang },
      }),
      defaultLabel: { en: "Guidelines", ja: "ガイドライン" },
    },
  ],
  [
    "data-sharing-guidelines",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/guidelines/$slug",
        params: { lang, slug: "data-sharing-guidelines" },
      }),
      defaultLabel: {
        en: "NBDC Guidelines for Human Data Sharing",
        ja: "NBDCヒトデータ共有ガイドライン",
      },
    },
  ],
  [
    "security-guidelines-for-users",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/guidelines/$slug",
        params: { lang, slug: "security-guidelines-for-users" },
      }),
      defaultLabel: {
        en: "NBDC Security Guidelines for Human Data (for Data Users)",
        ja: "NBDCヒトデータ取扱いセキュリティガイドライン（データ利用者向け）",
      },
    },
  ],
  [
    "security-guidelines-for-submitters",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/guidelines/$slug",
        params: { lang, slug: "security-guidelines-for-submitters" },
      }),
      defaultLabel: {
        en: "NBDC Security Guidelines for Human Data (for Data Submitters)",
        ja: "NBDCヒトデータ取扱いセキュリティガイドライン（データ提供者向け）",
      },
    },
  ],
  [
    "security-guidelines-for-dbcenters",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/guidelines/$slug",
        params: { lang, slug: "security-guidelines-for-dbcenters" },
      }),
      defaultLabel: {
        en: "NBDC Security Guidelines for Human Data (for Database Center Operation Managers and Off-Premise-Server Operation Managers)",
        ja: "NBDCヒトデータ取扱いセキュリティガイドライン（データベースセンター運用責任者ならびに機関外サーバ運用責任者向け）",
      },
    },
  ],
  [
    "data-usage",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/data-use",
        params: { lang },
      }),
      defaultLabel: { en: "Data Usage", ja: "データの利用" },
    },
  ],
  [
    "research-list",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/data-use/research",
        params: { lang },
      }),
      defaultLabel: { en: "Research List", ja: "研究一覧" },
    },
  ],
  [
    "dataset-list",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/data-use/datasets",
        params: { lang },
      }),
      defaultLabel: { en: "Dataset List", ja: "データセット一覧" },
    },
  ],
  [
    "data-processing",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/$",
        params: { lang, _splat: "data-processing" },
      }),
      defaultLabel: { en: "Data Processing", ja: "加工データ" },
    },
  ],
  [
    "off-premise-server",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/$",
        params: { lang, _splat: "off-premise-server" },
      }),
      defaultLabel: { en: "Off-premise Server", ja: "機関外サーバ" },
    },
  ],
  [
    "dac",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/$",
        params: { lang, _splat: "dac" },
      }),
      defaultLabel: {
        en: "Human Data Review Committee",
        ja: "ヒトデータ審査委員会",
      },
    },
  ],
  [
    "publications",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/$",
        params: { lang, _splat: "publications" },
      }),
      defaultLabel: { en: "Publications", ja: "成果発表" },
    },
  ],
  [
    "violation",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/$",
        params: { lang, _splat: "violation" },
      }),
      defaultLabel: { en: "Guideline Violation", ja: "ガイドライン違反" },
    },
  ],
  [
    "privacy-policy",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/$",
        params: { lang, _splat: "privacy-policy" },
      }),
      defaultLabel: { en: "Privacy Policy", ja: "プライバシーポリシー" },
    },
  ],
  [
    "faq",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/$",
        params: { lang, _splat: "faq" },
      }),
      defaultLabel: { en: "FAQ", ja: "FAQ" },
    },
  ],
  [
    "supported-browsers",
    {
      getLinkOptions: (lang) => ({
        to: "/{-$lang}/$",
        params: { lang, _splat: "supported-browsers" },
      }),
      defaultLabel: { en: "Supported Browsers", ja: "対応ブラウザ" },
    },
  ],
]);

// ---------------------------------------------------------------------------
// Default config — UUIDs are stable and hardcoded for the default
// ---------------------------------------------------------------------------

const defaultSiteNavigationConfig: SiteNavigationConfig = {
  items: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      type: "document",
      contentId: "home",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      type: "document",
      contentId: "data-submission",
      navbar: {
        enabled: true,
        visibility: "essential",
        order: 10,
        priority: "important",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      type: "document",
      contentId: "guidelines",
      navbar: {
        enabled: true,
        visibility: "essential",
        order: 20,
        priority: "important",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000004",
      type: "document",
      contentId: "data-sharing-guidelines",
      navbar: {
        enabled: true,
        visibility: "secondary",
        order: 10,
        priority: "important",
        parentItemId: "00000000-0000-4000-8000-000000000003",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000005",
      type: "document",
      contentId: "security-guidelines-for-users",
      navbar: {
        enabled: true,
        visibility: "secondary",
        order: 20,
        priority: "important",
        parentItemId: "00000000-0000-4000-8000-000000000003",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000006",
      type: "document",
      contentId: "security-guidelines-for-submitters",
      navbar: {
        enabled: true,
        visibility: "secondary",
        order: 30,
        priority: "important",
        parentItemId: "00000000-0000-4000-8000-000000000003",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000007",
      type: "document",
      contentId: "security-guidelines-for-dbcenters",
      navbar: {
        enabled: true,
        visibility: "secondary",
        order: 40,
        priority: "important",
        parentItemId: "00000000-0000-4000-8000-000000000003",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000008",
      type: "document",
      contentId: "data-usage",
      navbar: {
        enabled: true,
        visibility: "essential",
        order: 30,
        priority: "important",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000009",
      type: "link",
      url: "/data-use/research",
      label: { en: "Research List", ja: "研究一覧" },
      navbar: {
        enabled: true,
        visibility: "secondary",
        order: 10,
        priority: "important",
        parentItemId: "00000000-0000-4000-8000-000000000008",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000010",
      type: "link",
      url: "/data-use/datasets",
      label: { en: "Dataset List", ja: "データセット一覧" },
      navbar: {
        enabled: true,
        visibility: "secondary",
        order: 20,
        priority: "important",
        parentItemId: "00000000-0000-4000-8000-000000000008",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000011",
      type: "document",
      contentId: "data-processing",
      navbar: {
        enabled: true,
        visibility: "essential",
        order: 40,
        priority: "important",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000012",
      type: "document",
      contentId: "off-premise-server",
      navbar: {
        enabled: true,
        visibility: "essential",
        order: 50,
        priority: "important",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000013",
      type: "document",
      contentId: "dac",
      navbar: {
        enabled: true,
        visibility: "essential",
        order: 60,
        priority: "important",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000014",
      type: "document",
      contentId: "publications",
      navbar: {
        enabled: true,
        visibility: "essential",
        order: 70,
        priority: "important",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000015",
      type: "document",
      contentId: "violation",
      navbar: {
        enabled: true,
        visibility: "essential",
        order: 80,
        priority: "important",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000016",
      type: "document",
      contentId: "privacy-policy",
      navbar: {
        enabled: true,
        visibility: "essential",
        order: 90,
        priority: "important",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000017",
      type: "document",
      contentId: "faq",
      navbar: {
        enabled: true,
        visibility: "essential",
        order: 100,
        priority: "important",
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000018",
      type: "document",
      contentId: "supported-browsers",
    },
  ],
  zones: {
    footer: {
      groups: [
        {
          id: "00000000-0000-4001-8000-000000000001",
          label: { en: "Overview", ja: "概要" },
          order: 10,
          enabled: true,
          items: [
            { id: "00000000-0000-4000-8000-000000000001", order: 10 }, // home
            { id: "00000000-0000-4000-8000-000000000014", order: 70 }, // publications
            { id: "00000000-0000-4000-8000-000000000017", order: 80 }, // faq
          ],
        },
        {
          id: "00000000-0000-4001-8000-000000000002",
          label: { en: "Guidelines", ja: "ガイドライン" },
          order: 20,
          enabled: true,
          items: [
            { id: "00000000-0000-4000-8000-000000000003", order: 10 }, // guidelines
            { id: "00000000-0000-4000-8000-000000000004", order: 20 }, // data-sharing-guidelines
            { id: "00000000-0000-4000-8000-000000000005", order: 30 }, // security-guidelines-for-users
            { id: "00000000-0000-4000-8000-000000000006", order: 40 }, // security-guidelines-for-submitters
            { id: "00000000-0000-4000-8000-000000000007", order: 50 }, // security-guidelines-for-dbcenters
          ],
        },
        {
          id: "00000000-0000-4001-8000-000000000003",
          label: { en: "Submission", ja: "提供" },
          order: 30,
          enabled: true,
          items: [
            { id: "00000000-0000-4000-8000-000000000002", order: 10 }, // data-submission
            { id: "00000000-0000-4000-8000-000000000013", order: 40 }, // dac
          ],
        },
        {
          id: "00000000-0000-4001-8000-000000000004",
          label: { en: "Usage", ja: "利用" },
          order: 40,
          enabled: true,
          items: [
            { id: "00000000-0000-4000-8000-000000000008", order: 10 }, // data-usage
            { id: "00000000-0000-4000-8000-000000000009", order: 20 }, // research-list
            { id: "00000000-0000-4000-8000-000000000010", order: 30 }, // dataset-list
            { id: "00000000-0000-4000-8000-000000000011", order: 40 }, // data-processing
          ],
        },
        {
          id: "00000000-0000-4001-8000-000000000005",
          label: { en: "Policies", ja: "ポリシー" },
          order: 50,
          enabled: true,
          items: [
            { id: "00000000-0000-4000-8000-000000000012", order: 20 }, // off-premise-server
            { id: "00000000-0000-4000-8000-000000000015", order: 40 }, // violation
            { id: "00000000-0000-4000-8000-000000000016", order: 50 }, // privacy-policy
            { id: "00000000-0000-4000-8000-000000000018", order: 60 }, // supported-browsers
          ],
        },
      ],
    },
    navbar: {
      groups: [],
    },
  },
};

export function getDefaultSiteNavigationConfig(): SiteNavigationConfig {
  return structuredClone(defaultSiteNavigationConfig);
}

// ---------------------------------------------------------------------------
// Build resolved navigation for rendering
// ---------------------------------------------------------------------------

/**
 * Optional resolver for document-backed item labels.
 * The server function passes in published document titles from the DB;
 * without it, the registry default labels are used as fallback.
 */
export type DocumentLabelResolver = (
  contentId: string,
  lang: Locale,
) => string | undefined;

export function buildSiteNavigation(
  lang: Locale,
  config: SiteNavigationConfig,
  resolveDocumentLabel?: DocumentLabelResolver,
): ResolvedSiteNavigation {
  return {
    navbar: buildNavbarItems(lang, config, resolveDocumentLabel),
    footer: buildFooterGroups(lang, config, resolveDocumentLabel),
  };
}

export function getNavbarItems(
  lang: Locale,
  visibility: NavVisibility = "essential",
): ResolvedNavbarItem[] {
  return buildNavbarItems(
    lang,
    getDefaultSiteNavigationConfig(),
    undefined,
    visibility,
  );
}

export function getFooterSitemapGroups(lang: Locale): ResolvedFooterGroup[] {
  return buildFooterGroups(lang, getDefaultSiteNavigationConfig());
}

function resolveItemLabel(
  item: NavigationItem,
  lang: Locale,
  resolveDocumentLabel?: DocumentLabelResolver,
): string {
  // Explicit label override on the item takes priority
  if (item.label) {
    return (
      item.label[lang] ??
      item.label["en"] ??
      item.contentId ??
      item.url ??
      item.id
    );
  }
  // Document items: try DB-resolved title first, then registry default
  if (item.type === "document" && item.contentId) {
    const dbLabel = resolveDocumentLabel?.(item.contentId, lang);
    if (dbLabel) return dbLabel;
    const reg = navigationRegistry.get(item.contentId);
    if (reg) {
      return reg.defaultLabel[lang] ?? reg.defaultLabel["en"] ?? item.contentId;
    }
    return item.contentId;
  }
  return item.url ?? item.id;
}

function resolveItemLinkOptions(
  item: NavigationItem,
  lang: Locale,
): LinkOptions {
  if (item.type === "document" && item.contentId) {
    const reg = navigationRegistry.get(item.contentId);
    if (reg) return reg.getLinkOptions(lang);
    // Unknown document — link to root as safe fallback
    return { to: "/{-$lang}", params: { lang } };
  }
  // Link type — use the url directly
  const url = item.url ?? "/";
  return { to: `/{-$lang}${url}` as never, params: { lang } };
}

function buildNavbarItems(
  lang: Locale,
  config: SiteNavigationConfig,
  resolveDocumentLabel?: DocumentLabelResolver,
  visibility: NavVisibility = "essential",
): ResolvedNavbarItem[] {
  return config.items
    .filter(
      (item) =>
        item.navbar?.enabled &&
        item.navbar.visibility === visibility &&
        !item.navbar.parentItemId,
    )
    .sort((a, b) => (a.navbar?.order ?? 0) - (b.navbar?.order ?? 0))
    .map((item) => {
      const children = config.items
        .filter(
          (child) =>
            child.navbar?.enabled && child.navbar.parentItemId === item.id,
        )
        .sort((a, b) => (a.navbar?.order ?? 0) - (b.navbar?.order ?? 0))
        .map((child) => ({
          id: child.id,
          label: resolveItemLabel(child, lang, resolveDocumentLabel),
          linkOptions: resolveItemLinkOptions(child, lang),
        }));

      return {
        id: item.id,
        label: resolveItemLabel(item, lang, resolveDocumentLabel),
        linkOptions: resolveItemLinkOptions(item, lang),
        priority: item.navbar?.priority ?? "important",
        ...(children.length > 0 ? { children } : {}),
      };
    });
}

function buildFooterGroups(
  lang: Locale,
  config: SiteNavigationConfig,
  resolveDocumentLabel?: DocumentLabelResolver,
): ResolvedFooterGroup[] {
  const itemById = new Map(config.items.map((i) => [i.id, i]));

  return config.zones.footer.groups
    .filter((group) => group.enabled)
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      id: group.id,
      label: group.label[lang] ?? group.label["en"] ?? "",
      items: group.items
        .slice()
        .sort((a, b) => a.order - b.order)
        .filter((ref) => ref.enabled !== false)
        .map((ref) => itemById.get(ref.id))
        .filter((item): item is NavigationItem => item !== undefined)
        .map((item) => ({
          id: item.id,
          label: resolveItemLabel(item, lang, resolveDocumentLabel),
          linkOptions: resolveItemLinkOptions(item, lang),
        })),
    }))
    .filter((group) => group.items.length > 0);
}
