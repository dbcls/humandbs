import { type LinkOptions } from "@tanstack/react-router";

import { type Locale, type Messages } from "@/config/i18n";

export type NavigationItemId = keyof Messages["Navbar"];
export type FooterGroupId =
  | "overview"
  | "guidelines"
  | "submission"
  | "usage"
  | "policy";
export type FooterGroupLabelKey =
  | "group-overview"
  | "group-guidelines"
  | "group-submission"
  | "group-usage"
  | "group-policy";
export type NavVisibility = "essential" | "secondary";
export type NavPriority = "important" | "medium" | "optional";

export interface SiteNavigationConfig {
  footerGroups: Array<{
    id: FooterGroupId;
    labelKey: FooterGroupLabelKey;
    order: number;
    enabled: boolean;
  }>;
  items: Array<{
    id: NavigationItemId;
    parentId?: NavigationItemId;
    navbar?: {
      enabled: boolean;
      visibility: NavVisibility;
      order: number;
      priority: NavPriority;
    };
    footer?: {
      enabled: boolean;
      groupId: FooterGroupId;
      order: number;
    };
  }>;
}

interface SiteNavigationRegistryItem {
  id: NavigationItemId;
  labelKey: NavigationItemId;
  getLinkOptions: (lang: Locale) => LinkOptions;
}

export interface NavbarItem {
  id: NavigationItemId;
  labelKey: NavigationItemId;
  linkOptions: LinkOptions;
  children?: Array<{
    id: NavigationItemId;
    labelKey: NavigationItemId;
    linkOptions: LinkOptions;
  }>;
}

export interface FooterSitemapGroup {
  id: FooterGroupId;
  labelKey: FooterGroupLabelKey;
  items: Array<{
    id: NavigationItemId;
    labelKey: NavigationItemId;
    linkOptions: LinkOptions;
  }>;
}

export interface ResolvedSiteNavigation {
  navbar: NavbarItem[];
  footer: FooterSitemapGroup[];
}

export const NAVIGATION_ITEM_IDS: NavigationItemId[] = [
  "home",
  "data-submission",
  "application",
  "guidelines",
  "data-sharing-guidelines",
  "security-guidelines-for-users",
  "security-guidelines-for-submitters",
  "security-guidelines-for-dbcenters",
  "data-usage",
  "research-list",
  "dataset-list",
  "data-processing",
  "off-premise-server",
  "dac",
  "publications",
  "violation",
  "privacy-policy",
  "faq",
  "supported-browsers",
];

export const FOOTER_GROUP_IDS: FooterGroupId[] = [
  "overview",
  "guidelines",
  "submission",
  "usage",
  "policy",
];

export const FOOTER_GROUP_LABEL_KEYS: FooterGroupLabelKey[] = [
  "group-overview",
  "group-guidelines",
  "group-submission",
  "group-usage",
  "group-policy",
];

const siteNavigationRegistry: SiteNavigationRegistryItem[] = [
  {
    id: "home",
    labelKey: "home",
    getLinkOptions: (lang) => ({ to: "/{-$lang}", params: { lang } }),
  },
  {
    id: "data-submission",
    labelKey: "data-submission",
    getLinkOptions: (lang) => ({ to: "/{-$lang}/data-submission", params: { lang } }),
  },
  {
    id: "application",
    labelKey: "application",
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/data-submission/application",
      params: { lang },
    }),
  },
  {
    id: "guidelines",
    labelKey: "guidelines",
    getLinkOptions: (lang) => ({ to: "/{-$lang}/guidelines", params: { lang } }),
  },
  {
    id: "data-sharing-guidelines",
    labelKey: "data-sharing-guidelines",
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/guidelines/$slug",
      params: { lang, slug: "data-sharing-guidelines" },
    }),
  },
  {
    id: "security-guidelines-for-users",
    labelKey: "security-guidelines-for-users",
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/guidelines/$slug",
      params: { lang, slug: "security-guidelines-for-users" },
    }),
  },
  {
    id: "security-guidelines-for-submitters",
    labelKey: "security-guidelines-for-submitters",
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/guidelines/$slug",
      params: { lang, slug: "security-guidelines-for-submitters" },
    }),
  },
  {
    id: "security-guidelines-for-dbcenters",
    labelKey: "security-guidelines-for-dbcenters",
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/guidelines/$slug",
      params: { lang, slug: "security-guidelines-for-dbcenters" },
    }),
  },
  {
    id: "data-usage",
    labelKey: "data-usage",
    getLinkOptions: (lang) => ({ to: "/{-$lang}/data-usage", params: { lang } }),
  },
  {
    id: "research-list",
    labelKey: "research-list",
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/data-usage/researches",
      params: { lang },
    }),
  },
  {
    id: "dataset-list",
    labelKey: "dataset-list",
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/data-usage/datasets",
      params: { lang },
    }),
  },
  {
    id: "data-processing",
    labelKey: "data-processing",
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/$",
      params: { lang, _splat: "data-processing" },
    }),
  },
  {
    id: "off-premise-server",
    labelKey: "off-premise-server",
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/$",
      params: { lang, _splat: "off-premise-server" },
    }),
  },
  {
    id: "dac",
    labelKey: "dac",
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/$",
      params: { lang, _splat: "dac" },
    }),
  },
  {
    id: "publications",
    labelKey: "publications",
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/$",
      params: { lang, _splat: "publications" },
    }),
  },
  {
    id: "violation",
    labelKey: "violation",
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/$",
      params: { lang, _splat: "violation" },
    }),
  },
  {
    id: "privacy-policy",
    labelKey: "privacy-policy",
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/$",
      params: { lang, _splat: "privacy-policy" },
    }),
  },
  {
    id: "faq",
    labelKey: "faq",
    getLinkOptions: (lang) => ({ to: "/{-$lang}/$", params: { lang, _splat: "faq" } }),
  },
  {
    id: "supported-browsers",
    labelKey: "supported-browsers",
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/$",
      params: { lang, _splat: "supported-browsers" },
    }),
  },
];

const siteNavigationRegistryById = new Map(
  siteNavigationRegistry.map((item) => [item.id, item]),
);

const defaultSiteNavigationConfig: SiteNavigationConfig = {
  footerGroups: [
    { id: "overview", labelKey: "group-overview", order: 10, enabled: true },
    { id: "guidelines", labelKey: "group-guidelines", order: 20, enabled: true },
    { id: "submission", labelKey: "group-submission", order: 30, enabled: true },
    { id: "usage", labelKey: "group-usage", order: 40, enabled: true },
    { id: "policy", labelKey: "group-policy", order: 50, enabled: true },
  ],
  items: [
    { id: "home", footer: { enabled: true, groupId: "overview", order: 10 } },
    {
      id: "data-submission",
      navbar: { enabled: true, visibility: "essential", order: 10, priority: "important" },
      footer: { enabled: true, groupId: "submission", order: 10 },
    },
    {
      id: "application",
      parentId: "data-submission",
      navbar: { enabled: true, visibility: "secondary", order: 10, priority: "important" },
      footer: { enabled: true, groupId: "submission", order: 20 },
    },
    {
      id: "guidelines",
      navbar: { enabled: true, visibility: "essential", order: 20, priority: "important" },
      footer: { enabled: true, groupId: "guidelines", order: 10 },
    },
    {
      id: "data-sharing-guidelines",
      parentId: "guidelines",
      navbar: { enabled: true, visibility: "secondary", order: 10, priority: "important" },
      footer: { enabled: true, groupId: "guidelines", order: 20 },
    },
    {
      id: "security-guidelines-for-users",
      parentId: "guidelines",
      navbar: { enabled: true, visibility: "secondary", order: 20, priority: "important" },
      footer: { enabled: true, groupId: "guidelines", order: 30 },
    },
    {
      id: "security-guidelines-for-submitters",
      parentId: "guidelines",
      navbar: { enabled: true, visibility: "secondary", order: 30, priority: "important" },
      footer: { enabled: true, groupId: "guidelines", order: 40 },
    },
    {
      id: "security-guidelines-for-dbcenters",
      parentId: "guidelines",
      navbar: { enabled: true, visibility: "secondary", order: 40, priority: "important" },
      footer: { enabled: true, groupId: "guidelines", order: 50 },
    },
    {
      id: "data-usage",
      navbar: { enabled: true, visibility: "essential", order: 30, priority: "important" },
      footer: { enabled: true, groupId: "usage", order: 10 },
    },
    {
      id: "research-list",
      parentId: "data-usage",
      navbar: { enabled: true, visibility: "secondary", order: 10, priority: "important" },
      footer: { enabled: true, groupId: "usage", order: 20 },
    },
    {
      id: "dataset-list",
      parentId: "data-usage",
      navbar: { enabled: true, visibility: "secondary", order: 20, priority: "important" },
      footer: { enabled: true, groupId: "usage", order: 30 },
    },
    {
      id: "data-processing",
      navbar: { enabled: true, visibility: "essential", order: 40, priority: "important" },
      footer: { enabled: true, groupId: "usage", order: 40 },
    },
    {
      id: "off-premise-server",
      navbar: { enabled: true, visibility: "essential", order: 50, priority: "important" },
      footer: { enabled: true, groupId: "policy", order: 20 },
    },
    {
      id: "dac",
      navbar: { enabled: true, visibility: "essential", order: 60, priority: "important" },
      footer: { enabled: true, groupId: "submission", order: 40 },
    },
    {
      id: "publications",
      navbar: { enabled: true, visibility: "essential", order: 70, priority: "important" },
      footer: { enabled: true, groupId: "overview", order: 70 },
    },
    {
      id: "violation",
      navbar: { enabled: true, visibility: "essential", order: 80, priority: "important" },
      footer: { enabled: true, groupId: "policy", order: 40 },
    },
    {
      id: "privacy-policy",
      navbar: { enabled: true, visibility: "essential", order: 90, priority: "important" },
      footer: { enabled: true, groupId: "policy", order: 50 },
    },
    {
      id: "faq",
      navbar: { enabled: true, visibility: "essential", order: 100, priority: "important" },
      footer: { enabled: true, groupId: "overview", order: 80 },
    },
    {
      id: "supported-browsers",
      footer: { enabled: true, groupId: "policy", order: 60 },
    },
  ],
};

export function getDefaultSiteNavigationConfig(): SiteNavigationConfig {
  return structuredClone(defaultSiteNavigationConfig);
}

export function buildSiteNavigation(lang: Locale, config: SiteNavigationConfig) {
  assertNavigationConfigIntegrity(config);

  return {
    navbar: buildNavbarItems(lang, config),
    footer: buildFooterSitemapGroups(lang, config),
  } satisfies ResolvedSiteNavigation;
}

export function getNavbarItems(
  lang: Locale,
  visibility: NavVisibility = "essential",
): NavbarItem[] {
  return buildNavbarItems(lang, getDefaultSiteNavigationConfig(), visibility);
}

export function getFooterSitemapGroups(lang: Locale): FooterSitemapGroup[] {
  return buildFooterSitemapGroups(lang, getDefaultSiteNavigationConfig());
}

function buildNavbarItems(
  lang: Locale,
  config: SiteNavigationConfig,
  visibility: NavVisibility = "essential",
): NavbarItem[] {
  return config.items
    .filter(
      (item) =>
        item.parentId === undefined &&
        item.navbar?.enabled &&
        item.navbar.visibility === visibility,
    )
    .sort((a, b) => (a.navbar?.order ?? 0) - (b.navbar?.order ?? 0))
    .map((item) => {
      const registryItem = getRegistryItem(item.id);
      const children = config.items
        .filter((child) => child.parentId === item.id && child.navbar?.enabled)
        .sort((a, b) => (a.navbar?.order ?? 0) - (b.navbar?.order ?? 0))
        .map((child) => {
          const registryChild = getRegistryItem(child.id);
          return {
            id: registryChild.id,
            labelKey: registryChild.labelKey,
            linkOptions: registryChild.getLinkOptions(lang),
          };
        });

      return {
        id: registryItem.id,
        labelKey: registryItem.labelKey,
        linkOptions: registryItem.getLinkOptions(lang),
        ...(children.length > 0 ? { children } : {}),
      };
    });
}

function buildFooterSitemapGroups(
  lang: Locale,
  config: SiteNavigationConfig,
): FooterSitemapGroup[] {
  return config.footerGroups
    .filter((group) => group.enabled)
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      id: group.id,
      labelKey: group.labelKey,
      items: config.items
        .filter((item) => item.footer?.enabled && item.footer.groupId === group.id)
        .sort((a, b) => (a.footer?.order ?? 0) - (b.footer?.order ?? 0))
        .map((item) => {
          const registryItem = getRegistryItem(item.id);
          return {
            id: registryItem.id,
            labelKey: registryItem.labelKey,
            linkOptions: registryItem.getLinkOptions(lang),
          };
        }),
    }))
    .filter((group) => group.items.length > 0);
}

function getRegistryItem(id: NavigationItemId): SiteNavigationRegistryItem {
  const item = siteNavigationRegistryById.get(id);
  if (!item) {
    throw new Error(`Unknown site navigation item "${id}".`);
  }
  return item;
}

function assertNavigationConfigIntegrity(config: SiteNavigationConfig) {
  const groupIds = new Set(config.footerGroups.map((group) => group.id));
  const itemIds = new Set(config.items.map((item) => item.id));

  for (const item of config.items) {
    if (!siteNavigationRegistryById.has(item.id)) {
      throw new Error(`Unknown site navigation item "${item.id}".`);
    }
    if (item.parentId && !itemIds.has(item.parentId)) {
      throw new Error(`Unknown parent "${item.parentId}" for "${item.id}".`);
    }
    if (item.footer?.groupId && !groupIds.has(item.footer.groupId)) {
      throw new Error(`Unknown footer group "${item.footer.groupId}" for "${item.id}".`);
    }
  }
}
