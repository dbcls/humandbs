import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { Locale } from "use-intl";
import { z } from "zod";

import { ContentId, contentIdSchema } from "@/config/content-config";
import { localeSchema } from "@/config/i18n-config";
import { db } from "@/db/database";
import { DocVersionStatus } from "@/db/schema";
import {
  documentSelectSchema,
  documentVersionSelectSchema,
  DocumentVersionStatus,
} from "@/db/types";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import {
  createDocumentVersionRepository,
  DocVersionListItemResponseRaw,
  DocVersionResponseRaw,
} from "@/repositories/documentVersion";

const documentVersionRepo = createDocumentVersionRepository(db);

// === For CMS ===

// === LIST VERSIONS

export interface DocVersionListItemResponse {
  versionNumber: number;
  contentId: string;
  translations: {
    locale: Locale;
    statuses: { status: DocumentVersionStatus; title: string }[];
  }[];
}

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

    const versions = await documentVersionRepo.getVersionList(contentId);

    return groupDocumentVersions(versions);
  });

export const getDocumentVersionListQueryOptions = (data: {
  contentId: string | null;
}) =>
  queryOptions({
    queryKey: ["documents", data?.contentId, "versions"],
    queryFn: () => {
      if (!data) throw new Error("Invalid data");
      if (!data.contentId) return Promise.resolve([]);
      return $getDocumentVersionList({ data: { contentId: data.contentId } });
    },
    staleTime: 5 * 1000 * 60,
    enabled: !!data && !!data.contentId,
  });

export function groupDocumentVersions(
  rawVersions: DocVersionListItemResponseRaw[]
): DocVersionListItemResponse[] {
  const groupedVersions: DocVersionListItemResponse[] = [];

  for (const version of rawVersions) {
    const existingVersion = groupedVersions.find(
      (v) =>
        v.contentId === version.contentId &&
        v.versionNumber === version.versionNumber
    );

    if (existingVersion) {
      const existingTranslation = existingVersion.translations.find(
        (t) => t.locale === version.locale
      );

      if (existingTranslation) {
        existingTranslation.statuses.push({
          status: version.status,
          title: version.title ?? "",
        });
      } else {
        existingVersion.translations.push({
          locale: version.locale,
          statuses: [{ status: version.status, title: version.title ?? "" }],
        });
      }
    } else {
      groupedVersions.push({
        versionNumber: version.versionNumber,
        contentId: version.contentId,
        translations: [
          {
            locale: version.locale,
            statuses: [{ status: version.status, title: version.title ?? "" }],
          },
        ],
      });
    }
  }

  return groupedVersions;
}

// === GET VERSION

export interface DocVersionResponse {
  contentId: string;
  versionNumber: number;
  translations: Partial<
    Record<
      Locale,
      Partial<Record<DocVersionStatus, { title: string; content: string }>>
    >
  >;
}

const docVersionRequestSchema = documentVersionSelectSchema.pick({
  contentId: true,
  versionNumber: true,
});

export const $getDocumentVersion = createServerFn({
  method: "GET",
})
  .inputValidator(docVersionRequestSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "view");

    const { contentId, versionNumber } = data;

    const version = await documentVersionRepo.getVersion(
      contentId,
      versionNumber
    );

    return groupDocVersion(version);
  });

export const getDocumentVersionQueryOptions = (data: {
  contentId: ContentId;
  versionNumber: number | undefined;
}) =>
  queryOptions({
    queryKey: ["documents", data.contentId, "versions", data.versionNumber],
    queryFn: () => {
      const { contentId, versionNumber } = data;
      if (!versionNumber) {
        throw new Error("Version number is required");
      }
      return $getDocumentVersion({ data: { contentId, versionNumber } });
    },
    staleTime: 5 * 1000 * 60,
    enabled: typeof data.versionNumber === "number",
  });

/**
 *
 * @param rawVersion raw version return
 * @returns grouped result
 */
export function groupDocVersion(
  rawVersion: DocVersionResponseRaw[]
): DocVersionResponse {
  const result: DocVersionResponse = {
    contentId: rawVersion[0].contentId,
    versionNumber: rawVersion[0].versionNumber,
    translations: {},
  };

  for (const verStatusLang of rawVersion) {
    let translation = result.translations[verStatusLang.locale];
    if (!translation) {
      translation = {
        [verStatusLang.status]: {
          title: verStatusLang.title,
          content: verStatusLang.content,
        },
      };
    } else {
      translation[verStatusLang.status] = {
        title: verStatusLang.title ?? "",
        content: verStatusLang.content ?? "",
      };
    }
    result.translations[verStatusLang.locale] = translation;
  }
  return result;
}

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

    await documentVersionRepo.saveDraft(contentId, versionNumber, locale, rest);
  });

// === PUBLISH DRAFT

const publishDocVersionDraftRequestSchema = z.object({
  contentId: contentIdSchema,
  versionNumber: z.number(),
  locale: localeSchema,
});

export const $publishDocumentVersionDraft = createServerFn({ method: "POST" })
  .inputValidator(publishDocVersionDraftRequestSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "publish");

    await documentVersionRepo.publish(
      data.contentId,
      data.versionNumber,
      data.locale
    );
  });

// === UNPUBLISH DRAFT

export const $unpublishDocumentVersion = createServerFn({ method: "POST" })
  .inputValidator(publishDocVersionDraftRequestSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "delete");

    await documentVersionRepo.unpublish(
      data.contentId,
      data.versionNumber,
      data.locale
    );
  });

// === RESET DRAFT

export const $resetDocumentVersionDraft = createServerFn({ method: "POST" })
  .inputValidator(publishDocVersionDraftRequestSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "update");

    await documentVersionRepo.resetDraft(
      data.contentId,
      data.versionNumber,
      data.locale
    );
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
    const userId =
      context.user?.id === "dev-user-id" ? undefined : context.user?.id;

    const result = await documentVersionRepo.createVersionFromPublished(
      contentId,
      userId
    );

    return result;
  });

// === Public ===

// === GET LATEST DOCUMENT VERSION

const docPublishedVersionsRequestSchema = documentVersionSelectSchema.pick({
  contentId: true,
  locale: true,
});

export const $getLatestPublishedDocumentVersion = createServerFn({
  method: "GET",
})
  .inputValidator(docPublishedVersionsRequestSchema)
  .handler(async ({ data }) => {
    const { contentId, locale } = data;
    const docVersion = await documentVersionRepo.getLatestPublishedForLocale(
      contentId,
      locale
    );

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
    const docVersion =
      await documentVersionRepo.getPublishedForVersionNumberAndLocale(
        contentId,
        versionNumber,
        locale
      );

    return docVersion;
  });

// === GET PUBLISHED VERSIONS LIST

const getPublishedDocVersionListRequestSchema =
  docPublishedVersionsRequestSchema;

export const $getPublishedDocumentVersionList = createServerFn({
  method: "GET",
})
  .inputValidator(getPublishedDocVersionListRequestSchema)
  .handler(async ({ data }) => {
    const { contentId, locale } = data;

    const versions = await documentVersionRepo.getPublishedListForLocale(
      contentId,
      locale
    );

    return versions;
  });

export const getDocumentPublishedVersionsListQueryOptions = (
  data: z.infer<typeof getPublishedDocVersionListRequestSchema>
) =>
  queryOptions({
    queryKey: ["documents", data.contentId, "published-versions", data.locale],
    queryFn: () => $getPublishedDocumentVersionList({ data }),
    staleTime: 5 * 1000 * 60,
  });
