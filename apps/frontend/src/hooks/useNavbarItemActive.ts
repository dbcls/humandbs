import { useMatchRoute } from "@tanstack/react-router";

import type { ResolvedLinkOptions, ResolvedNavbarItem } from "@/config/siteNavigation";
import { asLinkProps } from "@/config/siteNavigation";

/**
 * Mirrors TanStack Link's default fuzzy active matching for a navbar item and
 * its immediate children, so a dropdown parent stays highlighted while one of
 * its child pages is current.
 */
export function useNavbarItemActive(item: ResolvedNavbarItem): boolean {
  const matchRoute = useMatchRoute();
  const links: Array<ResolvedLinkOptions | undefined> = [
    item.linkOptions,
    ...(item.children?.map((child) => child.linkOptions) ?? []),
  ];

  return links.some(
    (linkOptions) =>
      linkOptions !== undefined &&
      Boolean(
        matchRoute({
          ...asLinkProps(linkOptions),
          fuzzy: true,
          includeSearch: true,
        }),
      ),
  );
}
