import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { User } from "better-auth";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { Locale } from "use-intl";
import { z } from "zod";

import {
  DOCUMENT_VERSION_STATUS,
  documentVersion,
  DocumentVersionTranslation,
  documentVersionTranslation,
} from "@/db/schema";
import {
  documentVersionSchema,
  DocumentVersionStatus,
  InsertDocumentVersionTranslationParams,
} from "@/db/types";
import { buildConflictUpdateColumns } from "@/db/utils";
import { db } from "@/db/database";
import { i18n } from "@/config/i18n-config";
import { unionOfLiterals } from "@/lib/utils";
import {
  authMiddleware,
  hasPermissionMiddleware,
} from "@/middleware/authMiddleware";
import { USER_ROLES } from "@/config/permissions";

export interface DocumentVersionListItemResponse {
  statuses: DocumentVersionStatus[];
  locales: Locale[];
  versionNumber: number;
  contentId: string;
}

/** Read a document version list */
export const $getDocumentVersions = createServerFn({
  method: "GET",
})
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      contentId: z.string(),
    })
  )
  .handler(async ({ data, context }) => {
    const { contentId } = data;

    // if just public user, filter out drafts
    const filterOutDrafts = !(
      context.user?.role === USER_ROLES.ADMIN ||
      context.user?.role === USER_ROLES.EDITOR
    );

    const versions = await db.query.documentVersion.findMany({
      where: (table) => {
        if (filterOutDrafts) {
          return and(eq(table.contentId, contentId), ne(table.status, "draft"));
        }

        return eq(table.contentId, contentId);
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
        const key = `${version.contentId}-${version.versionNumber}`;
        if (!acc[key]) {
          acc[key] = {
            statuses: new Set(),
            locales: new Set(),
            versionNumber: version.versionNumber,
            contentId: version.contentId,
          };
        }

        acc[key].statuses.add(version.status);
        version.translations.forEach((t) => {
          acc[key].locales.add(t.locale as Locale);
        });

        return acc;
      },
      {} as Record<
        string,
        {
          statuses: Set<DocumentVersionStatus>;
          locales: Set<Locale>;
          versionNumber: number;
          contentId: string;
        }
      >
    );

    // Convert grouped results back to array format
    return Object.values(groupedVersions).map((group) => ({
      statuses: Array.from(group.statuses).sort(),
      locales: Array.from(group.locales).sort(),
      versionNumber: group.versionNumber,
      contentId: group.contentId,
    })) satisfies DocumentVersionListItemResponse[];
  });

export const getDocumentVersionsListQueryOptions = ({
  contentId,
}: {
  contentId: string | null;
}) =>
  queryOptions({
    queryKey: ["documents", contentId, "versions"],
    queryFn: () => {
      if (!contentId) return Promise.resolve([]);
      return $getDocumentVersions({ data: { contentId } });
    },
    staleTime: 5 * 1000 * 60,
    enabled: !!contentId,
  });

const selectDocumentVersionSchema = documentVersionSchema.pick({
  contentId: true,
  versionNumber: true,
  status: true,
});

interface Author {
  id: string;
  name: string;
  email: string;
}

/** CMS document version response */
export type DocumentVersionResponse = Partial<
  Record<DocumentVersionStatus, DocumentVersionContentResponse>
>;

export interface DocumentVersionContentResponse {
  id: string;
  translations: Record<Locale, DocumentVersionTranslation>;
  versionNumber: number;
  status: DocumentVersionStatus;
  author: Author;
}

/**
 * Get document version with content
 */
export const $getDocumentVersion = createServerFn({
  method: "GET",
})
  .middleware([hasPermissionMiddleware])
  .inputValidator(selectDocumentVersionSchema)
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "view");

    const result = await db.query.documentVersion.findFirst({
      where: (table) =>
        and(
          eq(table.contentId, data.contentId),
          eq(table.versionNumber, data.versionNumber),
          eq(table.status, data.status)
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
      columns: {
        authorId: false,
      },
    });

    if (!result) {
      return null;
    }

    return {
      ...result,
      translations:
        result?.translations.reduce(
          (acc, translation) => {
            acc[translation.locale as Locale] = translation;
            return acc;
          },
          {} as DocumentVersionContentResponse["translations"]
        ) || ({} as DocumentVersionContentResponse["translations"]),
    } satisfies DocumentVersionContentResponse;
  });

export const getDocumentVersionDraftQueryOptions = ({
  contentId,
  versionNumber,
}: {
  contentId: string;
  versionNumber: number;
}) =>
  queryOptions({
    queryKey: [
      "documents",
      contentId,
      "versions",
      versionNumber,
      DOCUMENT_VERSION_STATUS.DRAFT,
    ],
    queryFn: () =>
      $getDocumentVersion({
        data: {
          contentId,
          versionNumber,
          status: DOCUMENT_VERSION_STATUS.DRAFT,
        },
      }),

    staleTime: 5 * 1000 * 60,
    enabled: !!contentId && !!versionNumber,
  });

export const getDocumentVersionPublishedQueryOptions = ({
  contentId,
  versionNumber,
}: {
  contentId: string;
  versionNumber: number;
}) =>
  queryOptions({
    queryKey: [
      "documents",
      contentId,
      "versions",
      versionNumber,
      DOCUMENT_VERSION_STATUS.PUBLISHED,
    ],
    queryFn: () =>
      $getDocumentVersion({
        data: {
          contentId,
          versionNumber,
          status: DOCUMENT_VERSION_STATUS.PUBLISHED,
        },
      }),
    staleTime: 5 * 1000 * 60,
    enabled: !!contentId && !!versionNumber,
  });

/** Create new document version */
export const $createDocumentVersion = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      contentId: z.string(),
    })
  )
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "create");

    const user = context.user!;

    const { contentId } = data;

    // Find the latest version number for this document
    const latestVersion = await db.query.documentVersion.findFirst({
      where: (table) => eq(table.contentId, contentId),
      orderBy: (table, { desc }) => [desc(table.versionNumber)],
      columns: { versionNumber: true },
    });

    const newVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    const result = await db
      .insert(documentVersion)
      .values({
        authorId: user.id,
        contentId,
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
  .inputValidator(selectDocumentVersionSchema.omit({ status: true }))
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "create");
    const { contentId, versionNumber } = data;

    const existingVersionWithTranslations =
      await db.query.documentVersion.findFirst({
        where: (table) =>
          and(
            eq(table.contentId, contentId),
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
      where: (table) => eq(table.contentId, contentId),
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
          authorId: context.user!.id,
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
})
  .inputValidator(selectDocumentVersionSchema.omit({ status: true }))
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "delete");

    const { contentId, versionNumber } = data;

    const [result] = await db
      .delete(documentVersion)
      .where(
        and(
          eq(documentVersion.contentId, contentId),
          eq(documentVersion.versionNumber, versionNumber)
        )
      )
      .returning();

    return result;
  });

// Define schemas for translation fields based on status
const draftTranslationSchema = z.object({
  title: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
});

const publishedTranslationSchema = z.object({
  title: z.string().nullable(),
  content: z.string().nullable(),
});

// Draft document version schema
const draftVersionSchema = selectDocumentVersionSchema.extend({
  status: z.literal("draft"),
  translations: z.partialRecord(
    unionOfLiterals(i18n.locales),
    draftTranslationSchema
  ),
});

// Published document version schema
const publishedVersionSchema = selectDocumentVersionSchema.extend({
  status: z.literal("published"),
  translations: z.record(
    unionOfLiterals(i18n.locales),
    publishedTranslationSchema
  ),
});

// Create a discriminated union based on status
const versionUpdateSchema = z.discriminatedUnion("status", [
  draftVersionSchema,
  publishedVersionSchema,
]);

/**
 * Save/Update document version.
 * Set `status:"draft"` or `status:"published"` to upsert draft or published version
 */
export const $saveDocumentVersion = createServerFn({
  method: "POST",
})
  .middleware([hasPermissionMiddleware])
  .inputValidator(versionUpdateSchema)
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "update");
    await upsertDocVersion({ data, user: context.user });
  });

/**
 * Publish documentVersion draft and delete draft
 */
export const $publishDocumentVersionDraft = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(draftVersionSchema.omit({ status: true }))
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "publish");

    // We received a draft but need to validate the content as if it were published
    // Check if any required fields are missing before proceeding
    const validatedData = publishedVersionSchema.parse({
      ...data,
      status: "published",
    });

    await upsertDocVersion({
      data: { ...validatedData, status: "published" } as z.infer<
        typeof publishedVersionSchema
      >,
      user: context.user,
    });

    // delete draft on publish
    await db
      .delete(documentVersion)
      .where(
        and(
          eq(documentVersion.contentId, data.contentId),
          eq(documentVersion.versionNumber, data.versionNumber),
          eq(documentVersion.status, "draft")
        )
      );
  });

async function upsertDocVersion({
  data,
  user,
}: {
  data:
    | z.infer<typeof draftVersionSchema>
    | z.infer<typeof publishedVersionSchema>;
  user: User | undefined;
}) {
  const { contentId, versionNumber, translations, status } = data;

  await db.transaction(async (tx) => {
    // Upsert the document version

    const [upsertedDocVersion] = await tx
      .insert(documentVersion)
      .values({
        contentId,
        versionNumber,
        status,
        authorId: user!.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          documentVersion.contentId,
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
        translatedBy: user!.id,
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
  .inputValidator(selectDocumentVersionSchema.omit({ status: true }))
  .handler(async ({ data, context }) => {
    context.checkPermission("documentVersions", "update");

    await db
      .delete(documentVersion)
      .where(
        and(
          eq(documentVersion.contentId, data.contentId),
          eq(documentVersion.versionNumber, data.versionNumber),
          eq(documentVersion.status, "draft")
        )
      );
  });
