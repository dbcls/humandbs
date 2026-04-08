import { z } from "zod";

import type { SiteNavigationConfig } from "@/config/site-navigation";

const localizedLabelValueSchema = z.string().trim().min(1);
const multilingualLabelSchema = z.record(z.string(), localizedLabelValueSchema);

const navigationGroupItemSchema = z.object({
  id: z.string().uuid(),
  order: z.number().int(),
});

const navigationGroupSchema = z.object({
  id: z.string().uuid(),
  label: multilingualLabelSchema,
  parentGroupId: z.string().uuid().optional(),
  order: z.number().int(),
  enabled: z.boolean(),
  items: z.array(navigationGroupItemSchema),
});

const navigationZoneSchema = z.object({
  groups: z.array(navigationGroupSchema),
});

const navigationItemSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["document", "link"]),
  contentId: z.string().optional(),
  url: z.string().optional(),
  label: multilingualLabelSchema.optional(),
  navbar: z
    .object({
      enabled: z.boolean(),
      visibility: z.enum(["essential", "secondary"]),
      order: z.number().int(),
      priority: z
        .enum(["important", "medium", "optional"])
        .default("important"),
      parentItemId: z.string().uuid().optional(),
    })
    .optional(),
});

export const siteNavigationConfigSchema = z
  .object({
    items: z.array(navigationItemSchema),
    zones: z.object({
      footer: navigationZoneSchema,
      navbar: navigationZoneSchema,
    }),
  })
  .superRefine((config, ctx) => {
    const itemIds = new Set(config.items.map((item) => item.id));

    // Item IDs must be unique
    if (itemIds.size !== config.items.length) {
      ctx.addIssue({
        code: "custom",
        message: "Navigation item ids must be unique.",
      });
    }

    // Validate navbar parentItemId references
    for (const item of config.items) {
      if (item.navbar?.parentItemId && !itemIds.has(item.navbar.parentItemId)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown navbar parentItemId "${item.navbar.parentItemId}" for item "${item.id}".`,
        });
      }

      // Document items must have contentId
      if (item.type === "document" && !item.contentId) {
        ctx.addIssue({
          code: "custom",
          message: `Document item "${item.id}" must have a contentId.`,
        });
      }

      // Link items must have url and label
      if (item.type === "link" && !item.url) {
        ctx.addIssue({
          code: "custom",
          message: `Link item "${item.id}" must have a url.`,
        });
      }

      if (item.type === "link" && !item.label?.en?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: `Link item "${item.id}" must have a non-empty English label.`,
        });
      }
    }

    // Validate each zone
    for (const [zoneName, zone] of Object.entries(config.zones)) {
      const groupIds = new Set(zone.groups.map((g) => g.id));

      // Group IDs must be unique within the zone
      if (groupIds.size !== zone.groups.length) {
        ctx.addIssue({
          code: "custom",
          message: `Footer group ids must be unique in zone "${zoneName}".`,
        });
      }

      // Track which items are assigned (to enforce one item per group)
      const assignedItemIds = new Set<string>();

      for (const group of zone.groups) {
        if (!group.label.en?.trim()) {
          ctx.addIssue({
            code: "custom",
            message: `Group "${group.id}" in zone "${zoneName}" must have a non-empty English label.`,
          });
        }

        // parentGroupId must reference an existing group in the same zone
        if (group.parentGroupId && !groupIds.has(group.parentGroupId)) {
          ctx.addIssue({
            code: "custom",
            message: `Unknown parentGroupId "${group.parentGroupId}" in group "${group.id}" in zone "${zoneName}".`,
          });
        }

        // Navbar nesting max depth 2
        if (group.parentGroupId) {
          const parent = zone.groups.find((g) => g.id === group.parentGroupId);
          if (parent?.parentGroupId) {
            ctx.addIssue({
              code: "custom",
              message: `Group "${group.id}" exceeds max nesting depth of 2 in zone "${zoneName}".`,
            });
          }
        }

        for (const ref of group.items) {
          // Item reference must point to an existing NavigationItem
          if (!itemIds.has(ref.id)) {
            ctx.addIssue({
              code: "custom",
              message: `Unknown item reference "${ref.id}" in group "${group.id}" in zone "${zoneName}".`,
            });
          }

          // One item can only appear in one group per zone
          if (assignedItemIds.has(ref.id)) {
            ctx.addIssue({
              code: "custom",
              message: `Item "${ref.id}" appears in multiple groups in zone "${zoneName}".`,
            });
          }
          assignedItemIds.add(ref.id);
        }
      }
    }

    // Home item (contentId === "home") must be visible somewhere
    const homeItem = config.items.find(
      (item) => item.type === "document" && item.contentId === "home",
    );
    if (homeItem) {
      const inFooter = config.zones.footer.groups.some((g) =>
        g.items.some((ref) => ref.id === homeItem.id),
      );
      const inNavbar = homeItem.navbar?.enabled;
      if (!inFooter && !inNavbar) {
        ctx.addIssue({
          code: "custom",
          message:
            'The protected navigation item "home" cannot be hidden from both navbar and footer.',
        });
      }
    }
  });

export type SiteNavigationConfigInput = z.input<
  typeof siteNavigationConfigSchema
>;
export type SiteNavigationConfigOutput = z.output<
  typeof siteNavigationConfigSchema
>;

export function parseSiteNavigationConfig(data: unknown): SiteNavigationConfig {
  return siteNavigationConfigSchema.parse(data) as SiteNavigationConfig;
}
