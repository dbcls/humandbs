import {
  documentVersion,
  DocumentVersionTranslation,
  documentVersionTranslation,
} from "@/db/schema";
import {
  documentVersionSchema,
  DocumentVersionStatus,
  InsertDocumentVersionTranslationParams,
  insertDocumentVersionTranslationSchema,
} from "@/db/types";
import { buildConflictUpdateColumns } from "@/db/utils";
import { db } from "@/lib/database";
import { i18n } from "@/lib/i18n-config";
import { unionOfLiterals } from "@/lib/utils";
import {
  authMiddleware,
  hasPermissionMiddleware,
} from "@/middleware/authMiddleware";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { User } from "better-auth";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { Locale } from "use-intl";
import { z } from "zod";

export interface DocumentVersionListItemResponse {
  statuses: DocumentVersionStatus[];
  locales: Locale[];
  versionNumber: number;
  documentId: string;
}

/** Read a document version list */
export const $getDocumentVersions = createServerFn({
  method: "GET",
  response: "data",
})
  .middleware([authMiddleware])
  .validator(
    z.object({
      documentId: z.uuidv4(),
    })
  )
  .handler(async ({ data, context }) => {
    const { documentId } = data;

    // if just public user, filter out drafts
    const filterOutDrafts = !(
      context.user?.role === "admin" || context.user?.role === "editor"
    );

    const versions = await db.query.documentVersion.findMany({
      where: (table) => {
        if (filterOutDrafts) {
          return and(
            eq(table.documentId, documentId),
            ne(table.status, "draft")
          );
        }

        return eq(table.documentId, documentId);
      },
      with: {
        translations: {
          columns: {
            locale: true,
          },
        },
      },

      orderBy: [desc(documentVersion.versionNumber)],
    });

    // Group by documentId and versionNumber
    const groupedVersions = versions.reduce(
      (acc, version) => {
        const key = `${version.documentId}-${version.versionNumber}`;
        if (!acc[key]) {
          acc[key] = {
            statuses: new Set(),
            locales: new Set(),
            versionNumber: version.versionNumber,
            documentId: version.documentId,
          };
        }

        acc[key].statuses.add(version.status);
        version.translations.forEach((t) =>
          acc[key].locales.add(t.locale as Locale)
        );

        return acc;
      },
      {} as Record<
        string,
        {
          statuses: Set<DocumentVersionStatus>;
          locales: Set<Locale>;
          versionNumber: number;
          documentId: string;
        }
      >
    );

    // Convert grouped results back to array format
    return Object.values(groupedVersions).map((group) => ({
      statuses: Array.from(group.statuses),
      locales: Array.from(group.locales),
      versionNumber: group.versionNumber,
      documentId: group.documentId,
    })) satisfies DocumentVersionListItemResponse[];
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

const selectDocumentVersionSchema = documentVersionSchema.pick({
  documentId: true,
  versionNumber: true,
  status: true,
});

interface Author {
  id: string;
  name: string;
  email: string;
}

/** CMS document version response */
export type DocumentVersionResponse = Record<
  DocumentVersionStatus,
  DocumentVersionContentResponse
>;

export type DocumentVersionContentResponse = {
  id: string;
  translations: Record<Locale, DocumentVersionTranslation>;
  versionNumber: number;
  status: DocumentVersionStatus;
  author: Author;
};

/**
 * Get document version with content
 */
export const $getDocumentVersion = createServerFn({
  method: "GET",
})
  .middleware([hasPermissionMiddleware])
  .validator(selectDocumentVersionSchema.omit({ status: true }))
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "view");

    const result = await db.query.documentVersion.findMany({
      where: (table) =>
        and(
          eq(table.documentId, data.documentId),
          eq(table.versionNumber, data.versionNumber)
        ),
      with: {
        translations: true,
        author: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // group by status and by language
    const groupedResult = result.reduce((acc, item) => {
      acc[item.status] = {
        ...item,
        translations: item.translations.reduce(
          (acc, translation) => {
            acc[translation.locale as Locale] = translation;
            return acc;
          },
          {} as DocumentVersionResponse[keyof DocumentVersionResponse]["translations"]
        ),
      };
      return acc;
    }, {} as DocumentVersionResponse);

    return groupedResult satisfies DocumentVersionResponse;
  });

export const getDocumentVersionQueryOptions = ({
  documentId,
  versionNumber,
}: {
  documentId: string;
  versionNumber: number;
}) => {
  return queryOptions({
    queryKey: ["documents", documentId, "versions", versionNumber],
    queryFn: () =>
      $getDocumentVersion({
        data: { documentId, versionNumber },
      }),
    staleTime: 5 * 1000 * 60,
    enabled: !!documentId && !!versionNumber,
  });
};

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

    const result = await db
      .insert(documentVersion)
      .values({
        authorId: user.id,
        documentId,
        versionNumber: newVersionNumber,
      })
      .returning();

    return result;
  });

/**
 * Clone documentVersion into new version
 */
export const $cloneDocumentVersion = createServerFn({
  method: "POST",
})
  .validator(selectDocumentVersionSchema.omit({ status: true }))
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "create");
    const { documentId, versionNumber } = data;

    const existingVersionWithTranslations =
      await db.query.documentVersion.findFirst({
        where: (table) =>
          and(
            eq(table.documentId, documentId),
            eq(table.versionNumber, versionNumber),
            eq(table.status, "published")
          ),
        with: {
          translations: true,
        },
      });

    if (!existingVersionWithTranslations) {
      throw new Error("Document version not found");
    }

    const { translations, id, ...restExistingVersion } =
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
          createdAt: new Date(),
          authorId: context.user?.id!,
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
  .validator(selectDocumentVersionSchema.omit({ status: true }))
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
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

const versionTranslationUpdateSchema =
  insertDocumentVersionTranslationSchema.pick({
    locale: true,
    title: true,
    content: true,
  });

const versionUpdateSchema = selectDocumentVersionSchema.extend({
  translations: z.record(
    unionOfLiterals(i18n.locales),
    versionTranslationUpdateSchema.pick({ title: true, content: true })
  ),
});

/**
 * Save/Update document version.
 * Set `status:"draft"` or `status:"published"` to upsert draft or published version
 */
export const $saveDocumentVersion = createServerFn({
  method: "POST",
})
  .middleware([hasPermissionMiddleware])
  .validator(versionUpdateSchema)
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "update");
    await upsertDocVersion({ data, user: context.user });
  });

/**
 * Publish documentVersion draft and delete draft
 */
export const $publishDocumentVersionDraft = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .validator(versionUpdateSchema.omit({ status: true }))
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "publish");

    await upsertDocVersion({
      data: { ...data, status: "published" },
      user: context.user,
    });

    // delete draft on publish
    await db
      .delete(documentVersion)
      .where(
        and(
          eq(documentVersion.documentId, data.documentId),
          eq(documentVersion.versionNumber, data.versionNumber),
          eq(documentVersion.status, "draft")
        )
      );
  });

async function upsertDocVersion({
  data,
  user,
}: {
  data: z.infer<typeof versionUpdateSchema>;
  user: User | undefined;
}) {
  const { documentId, versionNumber, translations, status } = data;

  await db.transaction(async (tx) => {
    // Upsert the document version

    const [upsertedDocVersion] = await tx
      .insert(documentVersion)
      .values({
        documentId,
        versionNumber,
        status,
        authorId: user?.id!,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          documentVersion.documentId,
          documentVersion.versionNumber,
          documentVersion.status,
        ],

        set: {
          updatedAt: new Date(),
          authorId: sql.raw(`excluded.author_id`),
        },
      })
      .returning();

    // Prepare translations for upsert
    const translationsToUpsert: InsertDocumentVersionTranslationParams[] =
      Object.entries(translations).map(([locale, t]) => ({
        ...t,
        documentVersionId: upsertedDocVersion.id,
        updatedAt: new Date(),
        locale,
        translatedBy: user?.id!,
      }));

    // upsert  doc ver translations
    await tx
      .insert(documentVersionTranslation)
      .values(translationsToUpsert)
      .onConflictDoUpdate({
        target: [
          documentVersionTranslation.documentVersionId,
          documentVersionTranslation.locale,
        ],

        set: buildConflictUpdateColumns(documentVersionTranslation, [
          "content",
          "title",
          "updatedAt",
          "documentVersionId",
        ]),
      });
  });
}

/**
 * Delete ocumentVersion draft
 */
export const $deleteDocumentVersionDraft = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .validator(selectDocumentVersionSchema.omit({ status: true }))
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "update");

    await db
      .delete(documentVersion)
      .where(
        and(
          eq(documentVersion.documentId, data.documentId),
          eq(documentVersion.versionNumber, data.versionNumber),
          eq(documentVersion.status, "draft")
        )
      );
  });
