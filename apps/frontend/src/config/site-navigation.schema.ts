import { z } from "zod";

import type { SiteNavigationConfig } from "@/config/site-navigation";

const localizedLabelValueSchema = z.string().trim().min(1);
const multilingualLabelSchema = z.record(z.string(), localizedLabelValueSchema);

const navigationGroupItemSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean().optional().default(true),
});

const navigationGroupSchema = z.object({
  id: z.string().uuid(),
  label: multilingualLabelSchema,
  parentGroupId: z.string().uuid().optional(),
  enabled: z.boolean(),
  items: z.array(navigationGroupItemSchema),
  visibility: z.enum(["essential", "secondary"]).optional(),
  priority: z.enum(["important", "medium", "optional"]).optional(),
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

    // Document items must have contentId; link items must have url and label
    for (const item of config.items) {
      if (item.type === "document" && !item.contentId) {
        ctx.addIssue({
          code: "custom",
          message: `Document item "${item.id}" must have a contentId.`,
        });
      }
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
          message: `Group ids must be unique in zone "${zoneName}".`,
        });
      }

      const assignedItemIds = new Set<string>();

      for (const group of zone.groups) {
        if (!group.label.en?.trim()) {
          ctx.addIssue({
            code: "custom",
            message: `Group "${group.id}" in zone "${zoneName}" must have a non-empty English label.`,
          });
        }

        if (zoneName === "navbar" && group.parentGroupId) {
          ctx.addIssue({
            code: "custom",
            message: `Navbar group "${group.id}" cannot define a parentGroupId in the simplified navbar model.`,
          });
        }

        if (
          zoneName !== "navbar" &&
          group.parentGroupId &&
          !groupIds.has(group.parentGroupId)
        ) {
          ctx.addIssue({
            code: "custom",
            message: `Unknown parentGroupId "${group.parentGroupId}" in group "${group.id}" in zone "${zoneName}".`,
          });
        }

        if (zoneName !== "navbar" && group.parentGroupId) {
          const parent = zone.groups.find((g) => g.id === group.parentGroupId);
          if (parent?.parentGroupId) {
            ctx.addIssue({
              code: "custom",
              message: `Group "${group.id}" exceeds max nesting depth of 2 in zone "${zoneName}".`,
            });
          }
        }

        if (zoneName === "navbar") {
          if (group.enabled && group.items.length === 0) {
            ctx.addIssue({
              code: "custom",
              message: `Navbar group "${group.id}" cannot be enabled without a linked item.`,
            });
          }

          if (group.items[0]?.enabled === false) {
            ctx.addIssue({
              code: "custom",
              message: `Navbar group "${group.id}" cannot disable its top-level linked item.`,
            });
          }
        }

        for (const ref of group.items) {
          if (!itemIds.has(ref.id)) {
            ctx.addIssue({
              code: "custom",
              message: `Unknown item reference "${ref.id}" in group "${group.id}" in zone "${zoneName}".`,
            });
          }

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

    // Home item must be visible somewhere
    const homeItem = config.items.find(
      (item) => item.type === "document" && item.contentId === "home",
    );
    if (homeItem) {
      const inFooter = config.zones.footer.groups.some((g) =>
        g.items.some((ref) => ref.id === homeItem.id),
      );
      const inNavbar = config.zones.navbar.groups.some((g) =>
        g.items.some((ref) => ref.id === homeItem.id),
      );
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
