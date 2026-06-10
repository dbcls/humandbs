import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, exists, like, or } from "drizzle-orm";
import { z } from "zod";

import { i18n } from "@/config/i18n";
import { db } from "@/db/database";
import { DOCUMENT_VERSION_STATUS, document, documentVersion } from "@/db/schema";
import { documentSelectSchema, insertDocumentSchema } from "@/db/types";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { createDocumentVersionRepository } from "@/repositories/documentVersion";

export interface DocumentsListItemResponse {
  id: string;
  createdAt: Date;
  contentId: string;
  latestVersionNumber: number | null;
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
})
  .inputValidator(
    z.object({
      q: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const documents = await db.query.document.findMany({
      where: data.q
        ? (table) =>
            or(
              like(table.contentId, `%${data.q}%`),
              exists(
                db
                  .select({ _: documentVersion.documentId })
                  .from(documentVersion)
                  .where(
                    and(
                      eq(documentVersion.documentId, table.id),
                      or(
                        like(documentVersion.title, `%${data.q}%`),
                        like(documentVersion.content, `%${data.q}%`),
                      ),
                    ),
                  ),
              ),
            )
        : undefined,
    });

    const documentsWithTitles = await Promise.all(
      documents.map(async (doc) => {
        const [translations, latestVersion] = await Promise.all([
          Promise.all(
            i18n.locales.map(async (locale) => {
              const [latestPublishedVersion, latestDraftVersion] = await Promise.all([
                db.query.documentVersion.findFirst({
                  where: (table, { and, eq }) =>
                    and(
                      eq(table.documentId, doc.id),
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
                      eq(table.documentId, doc.id),
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
          ),
          db.query.documentVersion.findFirst({
            where: (table, { eq }) => eq(table.documentId, doc.id),
            orderBy: (table, { desc }) => desc(table.versionNumber),
            columns: { versionNumber: true },
          }),
        ]);

        return {
          ...doc,
          latestVersionNumber: latestVersion?.versionNumber ?? null,
          translations: translations.filter(
            (translation) => translation.statuses.published || translation.statuses.draft,
          ),
        };
      }),
    );

    return documentsWithTitles as DocumentsListItemResponse[];
  });

export function getDocumentsQueryOptions(params?: { q?: string }) {
  return queryOptions({
    queryKey: ["documents", params],
    queryFn: () => $getDocuments({ data: params ?? {} }),
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

    const userId = context.user?.id === "dev-user-id" ? undefined : context.user?.id;

    const doc = await db.insert(document).values(data).returning();

    await documentVersionRepo.createVersionFromPublished(data.contentId, userId);

    return doc;
  });

/** Get a single document by contentId */
export const $getDocument = createServerFn({ method: "GET" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(documentSelectSchema)
  .handler(async ({ context, data }) => {
    context.checkPermission("documents", "view");

    const doc = await db.query.document.findFirst({
      where: eq(document.contentId, data.contentId),
    });

    return doc ?? null;
  });

export function getDocumentQueryOptions(contentId: string) {
  return queryOptions({
    queryKey: ["documents", contentId],
    queryFn: () => $getDocument({ data: { contentId } }),
    staleTime: 1000 * 60 * 5,
  });
}

/** Update hideTOC flag for a document */
export const $updateDocumentHideTOC = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(z.object({ contentId: z.string(), hideTOC: z.boolean() }))
  .handler(async ({ context, data }) => {
    context.checkPermission("documents", "update");

    await db
      .update(document)
      .set({ hideTOC: data.hideTOC })
      .where(eq(document.contentId, data.contentId));
  });

/** Update hideRevisions flag for a document */
export const $updateDocumentHideRevisions = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(z.object({ contentId: z.string(), hideRevisions: z.boolean() }))
  .handler(async ({ context, data }) => {
    context.checkPermission("documents", "update");

    await db
      .update(document)
      .set({ hideRevisions: data.hideRevisions })
      .where(eq(document.contentId, data.contentId));
  });

/**
 * Delete document by contentId
 */
export const $deleteDocument = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(documentSelectSchema)
  .handler(async ({ context, data }) => {
    context.checkPermission("documents", "delete");

    const doc = await db.delete(document).where(eq(document.contentId, data.contentId)).returning();

    return doc;
  });

/**
 * Change Id of document
 *
 */
export const $changeIdOfDocument = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(z.object({ oldId: z.string(), newId: z.string() }))
  .handler(async ({ context, data }) => {
    context.checkPermission("documents", "update");

    await db
      .update(document)
      .set({ contentId: data.newId })
      .where(eq(document.contentId, data.oldId));
  });
