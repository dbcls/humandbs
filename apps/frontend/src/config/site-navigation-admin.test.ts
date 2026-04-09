import { describe, expect, test } from "bun:test";

import {
  buildSiteNavigation,
  type SiteNavigationConfig,
} from "@/config/site-navigation";

import {
  deriveNavbarCommittedGroups,
  mergeCommittedNavbarGroups,
} from "./site-navigation-admin";

describe("deriveNavbarCommittedGroups", () => {
  test("treats the first group item as linked and the rest as submenu items", () => {
    const config: SiteNavigationConfig = {
      items: [
        { id: "item-top", type: "link", url: "/top", label: { en: "Top", ja: "Top" } },
        { id: "item-sub-1", type: "link", url: "/sub-1", label: { en: "Sub 1", ja: "Sub 1" } },
        { id: "item-sub-2", type: "link", url: "/sub-2", label: { en: "Sub 2", ja: "Sub 2" } },
      ],
      zones: {
        footer: { groups: [] },
        navbar: {
          groups: [
            {
              id: "group-a",
              label: { en: "Group A", ja: "Group A" },
              enabled: true,
              priority: "important",
              items: [
                { id: "item-top" },
                { id: "item-sub-1" },
                { id: "item-sub-2", enabled: false },
              ],
            },
          ],
        },
      },
    };

    const [group] = deriveNavbarCommittedGroups(config);

    expect(group?.linkedItem?.item.id).toBe("item-top");
    expect(group?.subItems.map(({ item, enabled }) => ({ id: item.id, enabled }))).toEqual([
      { id: "item-sub-1", enabled: true },
      { id: "item-sub-2", enabled: false },
    ]);
  });
});

describe("mergeCommittedNavbarGroups", () => {
  test("stores the linked item first and submenu items after it", () => {
    const config: SiteNavigationConfig = {
      items: [],
      zones: {
        footer: { groups: [] },
        navbar: {
          groups: [],
        },
      },
    };

    const result = mergeCommittedNavbarGroups(config, [
      {
        group: {
          id: "group-a",
          label: { en: "Group A", ja: "Group A" },
          enabled: true,
          priority: "important",
          items: [],
        },
        linkedItem: {
          item: {
            id: "item-top",
            type: "link",
            url: "/top",
            label: { en: "Top", ja: "Top" },
          },
        },
        subItems: [
          {
            item: {
              id: "item-sub",
              type: "link",
              url: "/sub",
              label: { en: "Sub", ja: "Sub" },
            },
            enabled: false,
          },
        ],
      },
    ]);

    expect(result.zones.navbar.groups).toEqual([
      {
        id: "group-a",
        label: { en: "Group A", ja: "Group A" },
        enabled: true,
        priority: "important",
        parentGroupId: undefined,
        items: [
          { id: "item-top" },
          { id: "item-sub", enabled: false },
        ],
      },
    ]);
    expect(result.items.map((item) => item.id)).toEqual(["item-top", "item-sub"]);
  });

  test("auto-disables groups whose linked slot is empty", () => {
    const config: SiteNavigationConfig = {
      items: [],
      zones: {
        footer: { groups: [] },
        navbar: { groups: [] },
      },
    };

    const result = mergeCommittedNavbarGroups(config, [
      {
        group: {
          id: "group-empty",
          label: { en: "Empty", ja: "Empty" },
          enabled: true,
          priority: "important",
          items: [],
        },
        subItems: [],
      },
    ]);

    expect(result.zones.navbar.groups[0]?.enabled).toBe(false);
  });
});

describe("buildSiteNavigation", () => {
  test("uses the first navbar item as the link target and the remaining items as dropdown children", () => {
    const config: SiteNavigationConfig = {
      items: [
        { id: "item-top", type: "link", url: "/top", label: { en: "Top", ja: "Top" } },
        { id: "item-sub-1", type: "link", url: "/sub-1", label: { en: "Sub 1", ja: "Sub 1" } },
        { id: "item-sub-2", type: "link", url: "/sub-2", label: { en: "Sub 2", ja: "Sub 2" } },
      ],
      zones: {
        footer: { groups: [] },
        navbar: {
          groups: [
            {
              id: "group-a",
              label: { en: "Group A", ja: "Group A" },
              enabled: true,
              priority: "important",
              items: [
                { id: "item-top" },
                { id: "item-sub-1" },
                { id: "item-sub-2", enabled: false },
              ],
            },
          ],
        },
      },
    };

    const siteNavigation = buildSiteNavigation("en", config);

    expect(siteNavigation.navbar).toEqual([
      {
        id: "group-a",
        label: "Group A",
        linkOptions: { to: "/{-$lang}/top", params: { lang: "en" } },
        priority: "important",
        children: [
          {
            id: "item-sub-1",
            label: "Sub 1",
            linkOptions: { to: "/{-$lang}/sub-1", params: { lang: "en" } },
          },
        ],
      },
    ]);
  });
});
