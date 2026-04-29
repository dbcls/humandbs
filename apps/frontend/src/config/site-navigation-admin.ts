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

export function deriveNavbarCommittedGroups(
  config: SiteNavigationConfig,
): NavbarCommittedGroup[] {
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

      const [linkedItem, ...ownSubItems] = ownItems;

      return {
        group: {
          ...group,
          parentGroupId: undefined,
          enabled: group.enabled && linkedItem !== undefined,
        },
        ...(linkedItem ? { linkedItem: { item: linkedItem.item } } : {}),
        subItems: [...ownSubItems, ...legacyChildItems],
      };
    });
}

export function mergeCommittedNavbarGroups(
  current: SiteNavigationConfig,
  navGroups: NavbarCommittedGroup[],
): SiteNavigationConfig {
  const currentItemsById = new Map(
    current.items.map((item) => [item.id, item]),
  );

  for (const group of navGroups) {
    if (group.linkedItem) {
      currentItemsById.set(group.linkedItem.item.id, group.linkedItem.item);
    }

    for (const subItem of group.subItems) {
      currentItemsById.set(subItem.item.id, subItem.item);
    }
  }

  const nextNavbarGroups: NavigationGroup[] = navGroups.map(
    ({ group, linkedItem, subItems }) => ({
      ...group,
      parentGroupId: undefined,
      enabled: linkedItem ? group.enabled : false,
      items: [
        ...(linkedItem ? [{ id: linkedItem.item.id }] : []),
        ...subItems.map(({ item, enabled }) => ({
          id: item.id,
          enabled,
        })),
      ],
    }),
  );

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
