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
    }
  });

export type SiteNavigationConfigFile = z.infer<
  typeof siteNavigationConfigSchema
>;

export function parseSiteNavigationConfig(data: unknown): SiteNavigationConfig {
  return siteNavigationConfigSchema.parse(data);
}
