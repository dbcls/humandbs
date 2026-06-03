import type { NavigationGroup, NavigationItem } from "@/config/site-navigation";
import type { NavbarCommittedGroup } from "@/config/site-navigation-admin";

export type NavbarGroupWithItems = NavbarCommittedGroup;

export type FooterGroupWithItems = {
  group: NavigationGroup;
  items: Array<{
    item: NavigationItem;
    enabled: boolean;
  }>;
};

export type ItemsRecord = Record<string, string[]>;
