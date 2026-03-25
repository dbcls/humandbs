import { type LinkOptions } from "@tanstack/react-router";

import { type Locale, type Messages } from "@/config/i18n";

type NavigationLabelKey = keyof Messages["Navbar"];

type FooterGroupId =
  | "overview"
  | "guidelines"
  | "submission"
  | "usage"
  | "policy";

type NavVisibility = "essential" | "secondary";

interface SiteNavigationItem {
  id: NavigationLabelKey;
  labelKey: NavigationLabelKey;
  parentId?: NavigationLabelKey;
  navbar?: {
    visibility: NavVisibility;
    order: number;
  };
  footer?: {
    group: FooterGroupId;
    order: number;
  };
  getLinkOptions: (lang: Locale) => LinkOptions;
}

export interface NavbarItem {
  id: NavigationLabelKey;
  labelKey: NavigationLabelKey;
  linkOptions: LinkOptions;
  children?: Array<{
    id: NavigationLabelKey;
    labelKey: NavigationLabelKey;
    linkOptions: LinkOptions;
  }>;
}

export interface FooterSitemapGroup {
  id: FooterGroupId;
  items: Array<{
    id: NavigationLabelKey;
    labelKey: NavigationLabelKey;
    linkOptions: LinkOptions;
  }>;
}

const FOOTER_GROUP_ORDER: readonly FooterGroupId[] = [
  "overview",
  "guidelines",
  "submission",
  "usage",
  "policy",
];

const siteNavigationItems: SiteNavigationItem[] = [
  {
    id: "home",
    labelKey: "home",
    footer: { group: "overview", order: 10 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}",
      params: { lang },
    }),
  },
  {
    id: "data-submission",
    labelKey: "data-submission",
    navbar: { visibility: "essential", order: 10 },
    footer: { group: "submission", order: 10 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/data-submission",
      params: { lang },
    }),
  },
  {
    id: "application",
    labelKey: "application",
    parentId: "data-submission",
    navbar: { visibility: "secondary", order: 10 },
    footer: { group: "submission", order: 20 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/data-submission/application",
      params: { lang },
    }),
  },
  {
    id: "guidelines",
    labelKey: "guidelines",
    navbar: { visibility: "essential", order: 20 },
    footer: { group: "guidelines", order: 10 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/guidelines",
      params: { lang },
    }),
  },
  {
    id: "data-sharing-guidelines",
    labelKey: "data-sharing-guidelines",
    parentId: "guidelines",
    navbar: { visibility: "secondary", order: 10 },
    footer: { group: "guidelines", order: 20 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/guidelines/$slug",
      params: { lang, slug: "data-sharing-guidelines" },
    }),
  },
  {
    id: "security-guidelines-for-users",
    labelKey: "security-guidelines-for-users",
    parentId: "guidelines",
    navbar: { visibility: "secondary", order: 20 },
    footer: { group: "guidelines", order: 30 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/guidelines/$slug",
      params: { lang, slug: "security-guidelines-for-users" },
    }),
  },
  {
    id: "security-guidelines-for-submitters",
    labelKey: "security-guidelines-for-submitters",
    parentId: "guidelines",
    navbar: { visibility: "secondary", order: 30 },
    footer: { group: "guidelines", order: 40 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/guidelines/$slug",
      params: { lang, slug: "security-guidelines-for-submitters" },
    }),
  },
  {
    id: "security-guidelines-for-dbcenters",
    labelKey: "security-guidelines-for-dbcenters",
    parentId: "guidelines",
    navbar: { visibility: "secondary", order: 40 },
    footer: { group: "guidelines", order: 50 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/guidelines/$slug",
      params: { lang, slug: "security-guidelines-for-dbcenters" },
    }),
  },
  {
    id: "data-usage",
    labelKey: "data-usage",
    navbar: { visibility: "essential", order: 30 },
    footer: { group: "usage", order: 10 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/data-usage",
      params: { lang },
    }),
  },
  {
    id: "research-list",
    labelKey: "research-list",
    parentId: "data-usage",
    navbar: { visibility: "secondary", order: 10 },
    footer: { group: "usage", order: 20 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/data-usage/researches",
      params: { lang },
    }),
  },
  {
    id: "dataset-list",
    labelKey: "dataset-list",
    parentId: "data-usage",
    navbar: { visibility: "secondary", order: 20 },
    footer: { group: "usage", order: 30 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/data-usage/datasets",
      params: { lang },
    }),
  },
  {
    id: "data-processing",
    labelKey: "data-processing",
    navbar: { visibility: "essential", order: 40 },
    footer: { group: "usage", order: 40 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/$",
      params: { lang, _splat: "data-processing" },
    }),
  },
  {
    id: "off-premise-server",
    labelKey: "off-premise-server",
    navbar: { visibility: "essential", order: 50 },
    footer: { group: "policy", order: 20 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/$",
      params: { lang, _splat: "off-premise-server" },
    }),
  },
  {
    id: "dac",
    labelKey: "dac",
    navbar: { visibility: "essential", order: 60 },
    footer: { group: "submission", order: 40 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/$",
      params: { lang, _splat: "dac" },
    }),
  },
  {
    id: "publications",
    labelKey: "publications",
    navbar: { visibility: "essential", order: 70 },
    footer: { group: "overview", order: 70 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/$",
      params: { lang, _splat: "publications" },
    }),
  },
  {
    id: "violation",
    labelKey: "violation",
    navbar: { visibility: "essential", order: 80 },
    footer: { group: "policy", order: 40 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/$",
      params: { lang, _splat: "violation" },
    }),
  },
  {
    id: "privacy-policy",
    labelKey: "privacy-policy",
    navbar: { visibility: "essential", order: 90 },
    footer: { group: "policy", order: 50 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/$",
      params: { lang, _splat: "privacy-policy" },
    }),
  },
  {
    id: "faq",
    labelKey: "faq",
    navbar: { visibility: "essential", order: 100 },
    footer: { group: "overview", order: 80 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/$",
      params: { lang, _splat: "faq" },
    }),
  },
  {
    id: "supported-browsers",
    labelKey: "supported-browsers",
    footer: { group: "policy", order: 60 },
    getLinkOptions: (lang) => ({
      to: "/{-$lang}/$",
      params: { lang, _splat: "supported-browsers" },
    }),
  },
];

const siteNavigationById = new Map(
  siteNavigationItems.map((item) => [item.id, item]),
);

function assertNavigationIntegrity() {
  for (const item of siteNavigationItems) {
    if (item.parentId && !siteNavigationById.has(item.parentId)) {
      throw new Error(`Unknown parent "${item.parentId}" for "${item.id}".`);
    }
  }
}

assertNavigationIntegrity();

export function getNavbarItems(
  lang: Locale,
  visibility: NavVisibility = "essential",
): NavbarItem[] {
  return siteNavigationItems
    .filter(
      (item) =>
        item.navbar?.visibility === visibility && item.parentId === undefined,
    )
    .sort((a, b) => a.navbar!.order - b.navbar!.order)
    .map((item) => {
      const children = siteNavigationItems
        .filter((child) => child.parentId === item.id && child.navbar)
        .sort((a, b) => a.navbar!.order - b.navbar!.order)
        .map((child) => ({
          id: child.id,
          labelKey: child.labelKey,
          linkOptions: child.getLinkOptions(lang),
        }));

      return {
        id: item.id,
        labelKey: item.labelKey,
        linkOptions: item.getLinkOptions(lang),
        ...(children.length > 0 ? { children } : {}),
      };
    });
}

export function getFooterSitemapGroups(lang: Locale): FooterSitemapGroup[] {
  return FOOTER_GROUP_ORDER.map((groupId) => ({
    id: groupId,
    items: siteNavigationItems
      .filter((item) => item.footer?.group === groupId)
      .sort((a, b) => a.footer!.order - b.footer!.order)
      .map((item) => ({
        id: item.id,
        labelKey: item.labelKey,
        linkOptions: item.getLinkOptions(lang),
      })),
  })).filter((group) => group.items.length > 0);
}
