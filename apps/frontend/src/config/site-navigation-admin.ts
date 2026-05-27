import type {
  NavigationGroup,
  NavigationItem,
  SiteNavigationConfig,
} from "@/config/site-navigation";

export interface NavbarResolvedItem {
  item: NavigationItem;
  enabled: boolean;
}

export interface NavbarCommittedGroup {
  group: NavigationGroup;
  linkedItem?: {
    item: NavigationItem;
  };
  subItems: NavbarResolvedItem[];
}

/**
 * Gets JSON from CMS DB and builds "enriched" version, that can be used in the UI
 * @param config - json config from the db.
 * @returns top-level nav groups with resolved sub-group ids.
 */
export function deriveNavbarCommittedGroups(config: SiteNavigationConfig): NavbarCommittedGroup[] {
  const itemById = new Map(config.items.map((item) => [item.id, item]));

  return config.zones.navbar.groups
    .filter((group) => !group.parentGroupId)
    .map((group) => {
      const ownItems = group.items
        .map((ref) => {
          const item = itemById.get(ref.id);
          return item ? { item, enabled: ref.enabled !== false } : null;
        })
        .filter((item): item is NavbarResolvedItem => item !== null);

      const legacyChildItems = config.zones.navbar.groups
        .filter((childGroup) => childGroup.parentGroupId === group.id)
        .flatMap((childGroup) =>
          childGroup.items
            .map((ref) => {
              const item = itemById.get(ref.id);
              return item ? { item, enabled: ref.enabled !== false } : null;
            })
            .filter((item): item is NavbarResolvedItem => item !== null),
        );

      const linkedItem = ownItems.find(
        (item) => item.item.id === group.linkedItemId && item.enabled,
      );

      const ownSubItems = ownItems.filter((item) => item.item.id !== group.linkedItemId);

      return {
        group: {
          ...group,
          parentGroupId: undefined,
          enabled: group.enabled && (linkedItem !== undefined || ownSubItems.length > 0),
        },
        ...(linkedItem ? { linkedItem: { item: linkedItem.item } } : {}),
        subItems: [...ownSubItems, ...legacyChildItems],
      };
    });
}

/**
 * Applies UI changes to JSON config
 *
 * @param current current JSON config (DB)
 * @param navGroups uodated navGroups in UI format
 * @returns new JSON config (DB) with applied updates
 */
export function mergeCommittedNavbarGroups(
  current: SiteNavigationConfig,
  navGroups: NavbarCommittedGroup[],
): SiteNavigationConfig {
  const currentItemsById = new Map(current.items.map((item) => [item.id, item]));

  for (const group of navGroups) {
    if (group.linkedItem) {
      currentItemsById.set(group.linkedItem.item.id, group.linkedItem.item);
    }

    for (const subItem of group.subItems) {
      currentItemsById.set(subItem.item.id, subItem.item);
    }
  }

  const nextNavbarGroups: NavigationGroup[] = navGroups.map(({ group, linkedItem, subItems }) => ({
    ...group,
    parentGroupId: undefined,
    enabled: linkedItem !== undefined || subItems.length > 0 ? group.enabled : false,
    linkedItemId: linkedItem?.item.id,
    items: [
      ...(linkedItem ? [{ id: linkedItem.item.id }] : []),
      ...subItems.map(({ item, enabled }) => ({
        id: item.id,
        enabled,
      })),
    ],
  }));

  return {
    ...current,
    items: [...currentItemsById.values()],
    zones: {
      ...current.zones,
      navbar: {
        groups: nextNavbarGroups,
      },
    },
  };
}
