import type { NavigationGroup, NavigationItem } from "@/config/siteNavigation";
import type { NavbarCommittedGroup } from "@/config/siteNavigationAdmin";

export type NavbarGroupWithItems = NavbarCommittedGroup;

export type FooterGroupWithItems = {
  group: NavigationGroup;
  items: Array<{
    item: NavigationItem;
    enabled: boolean;
  }>;
};

export type ItemsRecord = Record<string, string[]>;
