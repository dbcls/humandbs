import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { type ContentId } from "@/config/content-config";
import { i18n } from "@/config/i18n";
import { db } from "@/db/database";
import { DOCUMENT_VERSION_STATUS, document } from "@/db/schema";
import { documentSelectSchema, insertDocumentSchema } from "@/db/types";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { createDocumentVersionRepository } from "@/repositories/documentVersion";

export interface DocumentsListItemResponse {
  createdAt: Date;
  contentId: ContentId;
  translations: {
    lang: (typeof i18n.locales)[number];
    statuses: {
      published?: string;
      draft?: string;
    };
  }[];
}

/** List all documents */
export const $getDocuments = createServerFn({
  method: "GET",
}).handler(async () => {
  const documents = await db.query.document.findMany();

  const documentsWithTitles = await Promise.all(
    documents.map(async (doc) => {
      const translations = await Promise.all(
        i18n.locales.map(async (locale) => {
          const [latestPublishedVersion, latestDraftVersion] = await Promise.all([
            db.query.documentVersion.findFirst({
              where: (table, { and, eq }) =>
                and(
                  eq(table.contentId, doc.contentId),
                  eq(table.locale, locale),
                  eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
                ),
              orderBy: (table, { desc }) => desc(table.versionNumber),
              columns: {
                title: true,
              },
            }),
            db.query.documentVersion.findFirst({
              where: (table, { and, eq }) =>
                and(
                  eq(table.contentId, doc.contentId),
                  eq(table.locale, locale),
                  eq(table.status, DOCUMENT_VERSION_STATUS.DRAFT),
                ),
              orderBy: (table, { desc }) => desc(table.versionNumber),
              columns: {
                title: true,
              },
            }),
          ]);

          return {
            lang: locale,
            statuses: {
              published: latestPublishedVersion?.title ?? undefined,
              draft: latestDraftVersion?.title ?? undefined,
            },
          };
        }),
      );

      return {
        ...doc,
        translations: translations.filter(
          (translation) =>
            translation.statuses.published || translation.statuses.draft,
        ),
      };
    }),
  );

  return documentsWithTitles as DocumentsListItemResponse[];
});

export function getDocumentsQueryOptions() {
  return queryOptions({
    queryKey: ["documents"],
    queryFn: $getDocuments,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Create new document with given contentId (must be unique)
 */
const documentVersionRepo = createDocumentVersionRepository(db);

export const $createDocument = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(insertDocumentSchema)
  .handler(async ({ context, data }) => {
    context.checkPermission("documents", "create");

    const userId =
      context.user?.id === "dev-user-id" ? undefined : context.user?.id;

    const doc = await db.insert(document).values(data).returning();

    await documentVersionRepo.createVersionFromPublished(data.contentId, userId);

    return doc;
  });

export const $validateDocumentContentId = createServerFn({ method: "POST" })
  .inputValidator(z.string())
  .handler(async ({ data }) => {
    const existingDoc = await db.query.document.findFirst({
      where: eq(document.contentId, data),
    });

    return !!existingDoc;
  });

/**
 * Delete document by contentId
 */
export const $deleteDocument = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(documentSelectSchema)
  .handler(async ({ context, data }) => {
    context.checkPermission("documents", "delete");

    const doc = await db
      .delete(document)
      .where(eq(document.contentId, data.contentId))
      .returning();

    return doc;
  });
