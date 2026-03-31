import { z } from "zod";

import {
  FOOTER_GROUP_IDS,
  FOOTER_GROUP_LABEL_KEYS,
  NAVIGATION_ITEM_IDS,
  type SiteNavigationConfig,
} from "@/config/site-navigation";

const navigationItemIdSchema = z.enum(NAVIGATION_ITEM_IDS);
const footerGroupIdSchema = z.enum(FOOTER_GROUP_IDS);
const footerGroupLabelKeySchema = z.enum(FOOTER_GROUP_LABEL_KEYS);

export const siteNavigationConfigSchema = z
  .object({
    footerGroups: z.array(
      z.object({
        id: footerGroupIdSchema,
        labelKey: footerGroupLabelKeySchema,
        order: z.number().int(),
        enabled: z.boolean(),
      }),
    ),
    items: z.array(
      z.object({
        id: navigationItemIdSchema,
        parentId: navigationItemIdSchema.optional(),
        navbar: z
          .object({
            enabled: z.boolean(),
            visibility: z.enum(["essential", "secondary"]),
            order: z.number().int(),
          })
          .optional(),
        footer: z
          .object({
            enabled: z.boolean(),
            groupId: footerGroupIdSchema,
            order: z.number().int(),
          })
          .optional(),
      }),
    ),
  })
  .superRefine((config, ctx) => {
    const itemIds = new Set(config.items.map((item) => item.id));
    const groupIds = new Set(config.footerGroups.map((group) => group.id));
    const itemsById = new Map(config.items.map((item) => [item.id, item]));
    const groupsById = new Map(
      config.footerGroups.map((group) => [group.id, group]),
    );

    if (itemIds.size !== config.items.length) {
      ctx.addIssue({
        code: "custom",
        message: "Navigation item ids must be unique.",
      });
    }

    if (groupIds.size !== config.footerGroups.length) {
      ctx.addIssue({
        code: "custom",
        message: "Footer group ids must be unique.",
      });
    }

    for (const itemId of NAVIGATION_ITEM_IDS) {
      if (!itemIds.has(itemId)) {
        ctx.addIssue({
          code: "custom",
          message: `Missing navigation item "${itemId}".`,
        });
      }
    }

    for (const groupId of FOOTER_GROUP_IDS) {
      if (!groupIds.has(groupId)) {
        ctx.addIssue({
          code: "custom",
          message: `Missing footer group "${groupId}".`,
        });
      }
    }

    for (const item of config.items) {
      if (item.parentId && !itemIds.has(item.parentId)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown parentId "${item.parentId}" for "${item.id}".`,
        });
      }

      if (item.footer?.groupId && !groupIds.has(item.footer.groupId)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown footer group "${item.footer.groupId}" for "${item.id}".`,
        });
      }

      if (item.parentId && item.navbar?.enabled) {
        const parent = itemsById.get(item.parentId);

        if (!parent?.navbar?.enabled) {
          ctx.addIssue({
            code: "custom",
            message: `Navbar child "${item.id}" cannot be enabled while parent "${item.parentId}" is hidden.`,
          });
        }
      }

      if (item.footer?.enabled) {
        const footerGroup = groupsById.get(item.footer.groupId);

        if (!footerGroup?.enabled) {
          ctx.addIssue({
            code: "custom",
            message: `Footer item "${item.id}" cannot be enabled inside disabled group "${item.footer.groupId}".`,
          });
        }
      }
    }

    const homeItem = config.items.find((item) => item.id === "home");
    const homeVisible =
      !!homeItem?.navbar?.enabled || !!homeItem?.footer?.enabled;

    if (!homeVisible) {
      ctx.addIssue({
        code: "custom",
        message: 'The protected navigation item "home" cannot be hidden.',
      });
    }
  });

export type SiteNavigationConfigFile = z.infer<
  typeof siteNavigationConfigSchema
>;

export function parseSiteNavigationConfig(data: unknown): SiteNavigationConfig {
  return siteNavigationConfigSchema.parse(data);
}
