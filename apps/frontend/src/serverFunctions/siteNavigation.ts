import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Locale } from "@/config/i18n";
import { localeSchema } from "@/config/i18n";
import type { DocumentLabelResolver, DocumentPathResolver } from "@/config/site-navigation";
import { buildSiteNavigation, getDefaultSiteNavigationConfig } from "@/config/site-navigation";
import { db } from "@/db/database";
import { DOCUMENT_VERSION_STATUS, document, documentVersion } from "@/db/schema";
import { siteNavigationConfigUpdateSchema } from "@/db/types";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import {
  SiteNavigationConfigConflictError,
  siteNavigationRepository,
} from "@/repositories/siteNavigation";

async function buildResolvers(lang: Locale): Promise<{
  labelResolver: DocumentLabelResolver;
  pathResolver: DocumentPathResolver;
}> {
  const [docRows, versionRows] = await Promise.all([
    db.select({ id: document.id, contentId: document.contentId }).from(document),
    db
      .selectDistinctOn([documentVersion.documentId], {
        documentId: documentVersion.documentId,
        title: documentVersion.title,
      })
      .from(documentVersion)
      .where(
        and(
          eq(documentVersion.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
          eq(documentVersion.locale, lang),
        ),
      )
      .orderBy(asc(documentVersion.documentId), desc(documentVersion.versionNumber)),
  ]);

  // documentId → contentId (path)
  const pathMap = new Map(docRows.map((d) => [d.id, d.contentId]));

  // contentId → published title
  const titleMap = new Map(
    versionRows
      .filter((r) => r.title !== null)
      .map((r) => {
        const contentId = pathMap.get(r.documentId);
        return contentId ? ([contentId, r.title as string] as const) : null;
      })
      .filter((r): r is [string, string] => r !== null),
  );

  return {
    pathResolver: (documentId) => pathMap.get(documentId),
    labelResolver: (contentId) => titleMap.get(contentId),
  };
}

export const $getSiteNavigation = createServerFn({ method: "GET" })
  .inputValidator(localeSchema)
  .handler(async ({ data: lang }) => {
    try {
      const [active, { labelResolver, pathResolver }] = await Promise.all([
        siteNavigationRepository.getActive(),
        buildResolvers(lang),
      ]);

      const config = active?.config ?? getDefaultSiteNavigationConfig();
      return buildSiteNavigation(lang, config, labelResolver, pathResolver);
    } catch (error) {
      console.error("Failed to load persisted site navigation config, using fallback.", error);
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

    const userId = context.user?.id === "dev-user-id" ? undefined : context.user?.id;

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

    const userId = context.user?.id === "dev-user-id" ? undefined : context.user?.id;

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
