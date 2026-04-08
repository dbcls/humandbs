import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  buildSiteNavigation,
  getDefaultSiteNavigationConfig,
  type DocumentLabelResolver,
} from "@/config/site-navigation";
import { localeSchema, type Locale } from "@/config/i18n";
import { siteNavigationConfigUpdateSchema } from "@/db/types";
import { db } from "@/db/database";
import { documentVersion, DOCUMENT_VERSION_STATUS } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import {
  siteNavigationRepository,
  SiteNavigationConfigConflictError,
} from "@/repositories/siteNavigation";

/**
 * Fetches all published document titles for a given locale and returns
 * a DocumentLabelResolver that the navigation builder can use.
 */
async function buildDocumentLabelResolver(lang: Locale): Promise<DocumentLabelResolver> {
  // DISTINCT ON contentId, ordered by contentId ASC, versionNumber DESC
  // → picks the highest version number per contentId
  const rows = await db
    .selectDistinctOn([documentVersion.contentId], {
      contentId: documentVersion.contentId,
      title: documentVersion.title,
    })
    .from(documentVersion)
    .where(
      and(
        eq(documentVersion.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
        eq(documentVersion.locale, lang),
      ),
    )
    .orderBy(asc(documentVersion.contentId), desc(documentVersion.versionNumber));

  const titleMap = new Map(
    rows
      .filter((row) => row.title !== null)
      .map((row) => [row.contentId, row.title as string]),
  );

  return (contentId, _lang) => titleMap.get(contentId);
}

export const $getSiteNavigation = createServerFn({ method: "GET" })
  .inputValidator(localeSchema)
  .handler(async ({ data: lang }) => {
    try {
      const [active, resolver] = await Promise.all([
        siteNavigationRepository.getActive(),
        buildDocumentLabelResolver(lang),
      ]);

      const config = active?.config ?? getDefaultSiteNavigationConfig();
      return buildSiteNavigation(lang, config, resolver);
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
