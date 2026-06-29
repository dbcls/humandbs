import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/router-core";
import type { Locale } from "use-intl";
import { z } from "zod";

import { localeSchema } from "@/config/i18n";
import { db } from "@/db/database";
import type { DocVersionStatus } from "@/db/schema";
import { documentSelectSchema } from "@/db/types";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { createDocumentVersionRepository } from "@/repositories/documentVersion";

import { $getPublishedContentItemTranslation } from "./contentItem";

const documentVersionRepo = createDocumentVersionRepository(db);

// === For CMS ===

// === LIST VERSIONS

const docVersionsRequestSchema = documentSelectSchema;
/**
 * Get version list for given document. For CMS.
 */
export const $getDocumentVersionList = createServerFn({
  method: "GET",
})
  .inputValidator(docVersionsRequestSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "list");

    const { contentId } = data;

    return await documentVersionRepo.getVersionList(contentId);
  });

export const getDocumentVersionListQueryOptions = ({ contentId }: { contentId: string | null }) =>
  queryOptions({
    queryKey: ["documents", contentId, "versions"],
    queryFn: () => {
      if (!contentId) return Promise.resolve([]);
      return $getDocumentVersionList({ data: { contentId } });
    },
    staleTime: 5 * 1000 * 60,
    enabled: !!contentId,
  });

// === GET VERSION

export interface DocVersionTranslationMeta {
  createdAt: Date;
  updatedAt: Date;
  author: { name: string | null; email: string } | null;
}

export interface DocVersionResponse {
  contentId: string;
  versionNumber: number;
  translations: Partial<
    Record<
      Locale,
      DocVersionTranslationMeta &
        Partial<Record<DocVersionStatus, { title: string; content: string }>>
    >
  >;
}

const docVersionRequestSchema = z.object({
  contentId: z.string(),
  versionNumber: z.number().int(),
});

export const $getDocumentVersion = createServerFn({
  method: "GET",
})
  .inputValidator(docVersionRequestSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "view");

    const { contentId, versionNumber } = data;

    const version = await documentVersionRepo.getVersion(contentId, versionNumber);

    return version;
  });

export const getDocumentVersionQueryOptions = ({
  contentId,
  versionNumber,
}: {
  contentId: string;
  versionNumber: number | undefined;
}) =>
  queryOptions({
    queryKey: ["documents", contentId, "versions", versionNumber],
    queryFn: () => {
      if (!versionNumber) {
        throw new Error("Version number is required");
      }
      return $getDocumentVersion({ data: { contentId, versionNumber } });
    },
    staleTime: 5 * 1000 * 60,
    enabled: typeof versionNumber === "number",
  });

// === SAVE DRAFT

const saveDocVersionDraftRequestSchema = z.object({
  contentId: z.string(),
  versionNumber: z.number(),
  locale: localeSchema,
  title: z.string().optional(),
  content: z.string().optional(),
});

export const $saveDocumentVersionDraft = createServerFn({ method: "POST" })
  .inputValidator(saveDocVersionDraftRequestSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "update");

    const { contentId, versionNumber, locale, ...rest } = data;

    return documentVersionRepo.saveDraft(contentId, versionNumber, locale, rest, context.user.id);
  });

// === PUBLISH DRAFT

const publishDocVersionDraftRequestSchema = z.object({
  contentId: z.string(),
  versionNumber: z.number(),
  locale: localeSchema,
});

export const $publishDocumentVersionDraft = createServerFn({ method: "POST" })
  .inputValidator(publishDocVersionDraftRequestSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "publish");

    await documentVersionRepo.publish(data.contentId, data.versionNumber, data.locale);
  });

// === UNPUBLISH DRAFT

export const $unpublishDocumentVersion = createServerFn({ method: "POST" })
  .inputValidator(publishDocVersionDraftRequestSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "delete");

    await documentVersionRepo.unpublish(data.contentId, data.versionNumber, data.locale);
  });

// === RESET DRAFT

export const $resetDocumentVersionDraft = createServerFn({ method: "POST" })
  .inputValidator(publishDocVersionDraftRequestSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "update");

    await documentVersionRepo.resetDraft(data.contentId, data.versionNumber, data.locale);
  });

// === DELETE VERSION

export const $deleteDocumentVersion = createServerFn({
  method: "POST",
})
  .inputValidator(docVersionRequestSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "delete");

    const { contentId, versionNumber } = data;

    await documentVersionRepo.delete(contentId, versionNumber);
  });

// === CREATE VERSION

const createDocVersionRequestSchema = z.object({
  contentId: z.string(),
});

/**
 * Create a new document version from the latest published version.
 * Copies all published locale content as drafts for the new version.
 */
export const $createDocumentVersion = createServerFn({
  method: "POST",
})
  .inputValidator(createDocVersionRequestSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "create");

    const { contentId } = data;
    // Don't pass dev bypass user ID as it doesn't exist in the user table
    const userId = context.user?.id === "dev-user-id" ? undefined : context.user?.id;

    const result = await documentVersionRepo.createVersionFromPublished(contentId, userId);

    return result;
  });

// === Public ===

// === GET LATEST DOCUMENT VERSION

const docPublishedVersionsRequestSchema = z.object({
  contentId: z.string(),
  locale: localeSchema,
});

export const $getLatestDocumentOrContent = createServerFn()
  .inputValidator(z.object({ id: z.string(), lang: localeSchema }))
  .handler(async ({ data }) => {
    const { id, lang } = data;

    const docVersion = await documentVersionRepo.getLatestPublishedForLocale(id, lang);

    if (docVersion) {
      return docVersion;
    }

    try {
      const content = await $getPublishedContentItemTranslation({
        data: { id, lang },
      });
      return content;
    } catch {
      throw notFound();
    }
  });

export const $getLatestPublishedDocumentVersion = createServerFn({
  method: "GET",
})
  .inputValidator(docPublishedVersionsRequestSchema)
  .handler(async ({ data }) => {
    const { contentId, locale } = data;
    const docVersion = await documentVersionRepo.getLatestPublishedForLocale(contentId, locale);

    if (!docVersion) {
      throw new Error("Page not found");
    }
    return docVersion;
  });

// === GET PUBLISHED DOCUMENT VERSION FOR VN AND LOCALE

const getDocumentVersionRequestSchema = publishDocVersionDraftRequestSchema;

export const $getPublishedDocumentVersion = createServerFn({
  method: "GET",
})
  .inputValidator(getDocumentVersionRequestSchema)
  .handler(async ({ data }) => {
    const { contentId, versionNumber, locale } = data;
    const docVersion = await documentVersionRepo.getPublishedForVersionNumberAndLocale(
      contentId,
      versionNumber,
      locale,
    );

    return docVersion;
  });

/**
 * For Diff view
 */
export function getTwoDocumentVersionsQueryOptions({
  contentId,
  versionNumber1,
  versionNumber2,
  locale,
}: {
  contentId: string;
  versionNumber1: number;
  versionNumber2: number;
  locale: Locale;
}) {
  return queryOptions({
    queryKey: [
      "documents",
      contentId,
      "published-versions",
      versionNumber1,
      versionNumber2,
      locale,
    ],
    queryFn: async () => {
      const [version1, version2] = await Promise.all([
        $getPublishedDocumentVersion({
          data: { contentId, versionNumber: versionNumber1, locale },
        }),
        $getPublishedDocumentVersion({
          data: { contentId, versionNumber: versionNumber2, locale },
        }),
      ]);
      return [version1, version2];
    },
    staleTime: 5 * 1000 * 60,
    // versionNumber can legitimately be 0/falsy-adjacent on the smallest version,
    // so guard on Number.isFinite rather than truthiness.
    enabled:
      !!contentId && Number.isFinite(versionNumber1) && Number.isFinite(versionNumber2) && !!locale,
  });
}

// === GET PUBLISHED VERSIONS LIST

const getPublishedDocVersionListRequestSchema = docPublishedVersionsRequestSchema;

export const $getPublishedDocumentVersionList = createServerFn({
  method: "GET",
})
  .inputValidator(getPublishedDocVersionListRequestSchema)
  .handler(async ({ data }) => {
    const { contentId, locale } = data;

    const versions = await documentVersionRepo.getPublishedListForLocale(contentId, locale);

    return versions;
  });

// === GET BREADCRUMBS FOR A DOCUMENT PATH

/**
 * Resolves a crumb label for each prefix segment of a multi-segment contentId.
 * e.g. "guidelines/data-sharing-guidelines" →
 *   [{ label: "Guidelines", href: "/guidelines" },
 *    { label: "Data Sharing Guidelines", href: "/guidelines/data-sharing-guidelines" }]
 */
export const $getDocumentBreadcrumbs = createServerFn({ method: "GET" })
  .inputValidator(z.object({ contentId: z.string(), locale: localeSchema }))
  .handler(async ({ data }) => {
    const { contentId, locale } = data;
    const segments = contentId.split("/");

    const crumbs = await Promise.all(
      segments.map(async (_, i) => {
        const path = segments.slice(0, i + 1).join("/");
        const doc = await documentVersionRepo.getLatestPublishedForLocale(path, locale);
        return { label: doc?.title ?? path, href: `/${path}` };
      }),
    );

    return crumbs;
  });

export const getDocumentPublishedVersionsListQueryOptions = ({
  contentId,
  locale,
}: z.infer<typeof getPublishedDocVersionListRequestSchema>) =>
  queryOptions({
    queryKey: ["documents", contentId, "published-versions", locale],
    queryFn: () => $getPublishedDocumentVersionList({ data: { contentId, locale } }),
    staleTime: 5 * 1000 * 60,
  });
