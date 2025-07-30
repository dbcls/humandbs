import { z } from "zod";
import { documentVersion, documentVersionTranslation } from "@/db/schema";
import { db } from "@/lib/database";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";

/** Read a document version list */
export const $getDocumentVersions = createServerFn({
  method: "GET",
  response: "data",
})
  .validator(
    z.object({
      documentId: z.uuidv4(),
    })
  )
  .handler(async ({ data }) => {
    const { documentId } = data;

    const versions = await db.query.documentVersion.findMany({
      where: (table) => eq(table.documentId, documentId),
      with: {
        translations: {
          columns: {
            locale: true,
          },
        },
      },
    });

    return versions;
  });

export const getDocumentVersionsListQueryOptions = ({
  documentId,
}: {
  documentId: string | null;
}) =>
  queryOptions({
    queryKey: ["documents", documentId, "versions"],
    queryFn: () => {
      if (!documentId) return Promise.resolve([]);
      return $getDocumentVersions({ data: { documentId } });
    },
    staleTime: 5 * 1000 * 60,
    enabled: !!documentId,
  });

/** Create new document version */
export const $createDocumentVersion = createServerFn({
  method: "POST",
  response: "data",
})
  .validator(
    z.object({
      documentId: z.uuidv4(),
    })
  )
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "create");

    const user = context.user!;

    const { documentId } = data;

    // Find the latest version number for this document
    const latestVersion = await db.query.documentVersion.findFirst({
      where: (table) => eq(table.documentId, documentId),
      orderBy: (table, { desc }) => [desc(table.versionNumber)],
      columns: { versionNumber: true },
    });

    const newVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    const [result] = await db
      .insert(documentVersion)
      .values({
        authorId: user.id,
        documentId,
        versionNumber: newVersionNumber,
      })
      .returning();

    return result;
  });

const selectDocumentVersionSchema = z.object({
  documentId: z.uuidv4(),
  versionNumber: z.number().min(1),
});

/**
 * Clone documentVersion into new version
 */
export const $cloneDocumentVersion = createServerFn({
  method: "POST",
})
  .validator(selectDocumentVersionSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "create");
    const { documentId, versionNumber } = data;

    const existingVersionWithTranslations =
      await db.query.documentVersion.findFirst({
        where: (table) =>
          and(
            eq(table.documentId, documentId),
            eq(table.versionNumber, versionNumber)
          ),
        with: {
          translations: true,
        },
      });

    if (!existingVersionWithTranslations) {
      throw new Error("Document version not found");
    }

    const { translations, ...restExistingVersion } =
      existingVersionWithTranslations;

    // Find the latest version number for this document
    const latestVersion = await db.query.documentVersion.findFirst({
      where: (table) => eq(table.documentId, documentId),
      orderBy: (table, { desc }) => [desc(table.versionNumber)],
      columns: { versionNumber: true },
    });

    const newVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    const result = await db.transaction(async (tx) => {
      const newVersion = await tx
        .insert(documentVersion)
        .values({
          ...restExistingVersion,
          versionNumber: newVersionNumber,
          status: "draft",
        })
        .returning();

      const newTranslations = await tx
        .insert(documentVersionTranslation)
        .values(
          translations.map((tr) => ({
            ...tr,
            documentVersionId: newVersion[0].id,
            createdAt: new Date(),
            translatedBy: context.user?.id,
          }))
        )
        .returning();

      return {
        ...newVersion[0],
        translations: newTranslations,
      };
    });

    return result;
  });

/** Delete document version */
export const $deleteDocumentVersion = createServerFn({
  method: "POST",
  response: "data",
})
  .validator(selectDocumentVersionSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    // TODO: Implement permissions
    context.checkPermission("documentVersions", "delete");

    const { documentId, versionNumber } = data;

    const [result] = await db
      .delete(documentVersion)
      .where(
        and(
          eq(documentVersion.documentId, documentId),
          eq(documentVersion.versionNumber, versionNumber)
        )
      )
      .returning();

    return result;
  });

/**
 * Publish documentVersion
 */
export const $publishDocumentVersion = createServerFn({ method: "POST" })
  .validator(selectDocumentVersionSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "publish");

    const { documentId, versionNumber } = data;

    const [result] = await db
      .update(documentVersion)
      .set({ status: "published" })
      .where(
        and(
          eq(documentVersion.documentId, documentId),
          eq(documentVersion.versionNumber, versionNumber)
        )
      )
      .returning();

    return result;
  });
