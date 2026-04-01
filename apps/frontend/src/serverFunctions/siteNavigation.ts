import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  buildSiteNavigation,
  getDefaultSiteNavigationConfig,
} from "@/config/site-navigation";
import { localeSchema } from "@/config/i18n";
import { siteNavigationConfigUpdateSchema } from "@/db/types";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import {
  siteNavigationRepository,
  SiteNavigationConfigConflictError,
} from "@/repositories/siteNavigation";

export const $getSiteNavigation = createServerFn({ method: "GET" })
  .inputValidator(localeSchema)
  .handler(async ({ data: lang }) => {
    try {
      const active = await siteNavigationRepository.getActive();

      if (!active) {
        return buildSiteNavigation(lang, getDefaultSiteNavigationConfig());
      }

      return buildSiteNavigation(lang, active.config);
    } catch (error) {
      console.error(
        "Failed to load persisted site navigation config, using fallback.",
        error,
      );
      return buildSiteNavigation(lang, getDefaultSiteNavigationConfig());
    }
  });

export const $getSiteNavigationConfig = createServerFn({ method: "GET" })
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context }) => {
    context.checkPermission("admin-panel", "view-cms");

    const active = await siteNavigationRepository.getActive();

    if (active) return active;

    return {
      id: "global",
      config: getDefaultSiteNavigationConfig(),
      revision: 1,
      updatedAt: new Date(0),
      updatedBy: null,
    };
  });

export function getSiteNavigationConfigQueryOptions() {
  return queryOptions({
    queryKey: ["site-navigation", "config"],
    queryFn: () => $getSiteNavigationConfig(),
    staleTime: 1000 * 60 * 5,
  });
}

export const $saveSiteNavigationConfig = createServerFn({ method: "POST" })
  .inputValidator(siteNavigationConfigUpdateSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("admin-panel", "view-cms");

    const userId =
      context.user?.id === "dev-user-id" ? undefined : context.user?.id;

    try {
      return {
        ok: true as const,
        data: await siteNavigationRepository.save(data.config, {
          expectedRevision: data.expectedRevision,
          userId,
        }),
      };
    } catch (error) {
      if (error instanceof SiteNavigationConfigConflictError) {
        return {
          ok: false as const,
          code: "CONFLICT" as const,
          error: error.message,
        };
      }

      throw error;
    }
  });

export const $resetSiteNavigationConfig = createServerFn({ method: "POST" })
  .inputValidator(z.object({ expectedRevision: z.number().int().min(1) }))
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("admin-panel", "view-cms");

    const userId =
      context.user?.id === "dev-user-id" ? undefined : context.user?.id;

    try {
      return {
        ok: true as const,
        data: await siteNavigationRepository.resetToDefault({
          expectedRevision: data.expectedRevision,
          userId,
        }),
      };
    } catch (error) {
      if (error instanceof SiteNavigationConfigConflictError) {
        return {
          ok: false as const,
          code: "CONFLICT" as const,
          error: error.message,
        };
      }

      throw error;
    }
  });
