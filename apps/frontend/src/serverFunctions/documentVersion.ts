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
    console.log("loading server fn");
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

// const selectDocumentVersionSchema = documentVersionSchema.pick({
//   contentId: true,
//   versionNumber: true,
//   status: true,
// });

// interface Author {
//   id: string;
//   name: string;
//   email: string;
// }

// /** CMS document version response */
// export type DocumentVersionResponse = Partial<
//   Record<DocumentVersionStatus, DocumentVersionContentResponse>
// >;

// // export interface DocumentVersionContentResponse {
// //   id: string;
// //   translations: Record<Locale, DocumentVersionTranslation>;
// //   versionNumber: number;
// //   status: DocumentVersionStatus;
// //   author: Author;
// // }

// const getDocVersionSchema = selectDocumentVersionSchema.partial({
//   versionNumber: true,
// });

// const getStatusDocVersionSchema = getDocVersionSchema.omit({ status: true });

// // /**
// //  * Get document version with content
// //  */
// // export const $getDocumentVersion = createServerFn({
// //   method: "GET",
// // })
// //   .middleware([hasPermissionMiddleware])
// //   .inputValidator(getDocVersionSchema)
// //   .handler(async ({ data, context }) => {
// //     context.checkPermission("documentVersions", "view");

// //     const result = await db.query.documentVersion.findFirst({
// //       where: (table) =>
// //         and(
// //           eq(table.contentId, data.contentId),
// //           data.versionNumber !== undefined
// //             ? eq(table.versionNumber, data.versionNumber)
// //             : undefined,
// //           eq(table.status, data.status)
// //         ),
// //       orderBy: (table, { desc }) => [desc(table.versionNumber)],
// //       with: {
// //         translations: true,
// //         author: {
// //           columns: {
// //             id: true,
// //             name: true,
// //             email: true,
// //           },
// //         },
// //       },
// //       columns: {
// //         authorId: false,
// //       },
// //     });

// //     if (!result) {
// //       return null;
// //     }

// //     return {
// //       ...result,
// //       translations:
// //         result?.translations.reduce(
// //           (acc, translation) => {
// //             acc[translation.locale as Locale] = translation;
// //             return acc;
// //           },
// //           {} as DocumentVersionContentResponse["translations"]
// //         ) || ({} as DocumentVersionContentResponse["translations"]),
// //     } satisfies DocumentVersionContentResponse;
// //   });

// export const getDocumentVersionDraftQueryOptions = (
//   data: z.infer<typeof getStatusDocVersionSchema> | null
// ) =>
//   queryOptions({
//     queryKey: [
//       "documents",
//       data?.contentId,
//       "versions",
//       data?.versionNumber,
//       DOCUMENT_VERSION_STATUS.DRAFT,
//     ],
//     queryFn: () => {
//       if (!data) throw new Error("Missing data");

//       return $getDocumentVersion({
//         data: {
//           contentId: data.contentId,
//           versionNumber: data.versionNumber,
//           status: DOCUMENT_VERSION_STATUS.DRAFT,
//         },
//       });
//     },

//     staleTime: 5 * 1000 * 60,
//     enabled: !!data,
//   });

// export const getDocumentVersionPublishedQueryOptions = (
//   data: z.infer<typeof getStatusDocVersionSchema> | null
// ) =>
//   queryOptions({
//     queryKey: [
//       "documents",
//       data?.contentId,
//       "versions",
//       data?.versionNumber,
//       DOCUMENT_VERSION_STATUS.PUBLISHED,
//     ],
//     queryFn: () => {
//       if (!data) throw new Error("Missing data");

//       return $getDocumentVersion({
//         data: {
//           contentId: data.contentId,
//           versionNumber: data.versionNumber,
//           status: DOCUMENT_VERSION_STATUS.PUBLISHED,
//         },
//       });
//     },
//     staleTime: 5 * 1000 * 60,
//     enabled: !!data,
//   });

// /** Create new document version */
// export const $createDocumentVersion = createServerFn({
//   method: "POST",
// })
//   .inputValidator(
//     z.object({
//       contentId: z.string(),
//     })
//   )
//   .middleware([hasPermissionMiddleware])
//   .handler(async ({ data, context }) => {
//     context.checkPermission("documentVersions", "create");

//     const user = context.user!;

//     const { contentId } = data;

//     // Find the latest version number for this document
//     const latestVersion = await db.query.documentVersion.findFirst({
//       where: (table) => eq(table.contentId, contentId),
//       orderBy: (table, { desc }) => [desc(table.versionNumber)],
//       columns: { versionNumber: true },
//     });

//     const newVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

//     const result = await db
//       .insert(documentVersion)
//       .values({
//         authorId: user.id,
//         contentId,
//         versionNumber: newVersionNumber,
//       })
//       .returning();

//     return result;
//   });

// const cloneDocVersionInputSchema = selectDocumentVersionSchema.omit({
//   status: true,
// });

// /**
//  * Clone documentVersion into new version
//  */
// export const $cloneDocumentVersion = createServerFn({
//   method: "POST",
// })
//   .inputValidator(cloneDocVersionInputSchema)
//   .middleware([hasPermissionMiddleware])
//   .handler(async ({ data, context }) => {
//     context.checkPermission("documentVersions", "create");
//     const { contentId, versionNumber } = data;

//     const existingVersionWithTranslations =
//       await db.query.documentVersion.findFirst({
//         where: (table) =>
//           and(
//             eq(table.contentId, contentId),
//             eq(table.versionNumber, versionNumber),
//             eq(table.status, "published")
//           ),
//         with: {
//           translations: true,
//         },
//       });

//     if (!existingVersionWithTranslations) {
//       throw new Error("Document version not found");
//     }

//     const { translations, id, ...restExistingVersion } =
//       existingVersionWithTranslations;

//     // Find the latest version number for this document
//     const latestVersion = await db.query.documentVersion.findFirst({
//       where: (table) => eq(table.contentId, contentId),
//       orderBy: (table, { desc }) => [desc(table.versionNumber)],
//       columns: { versionNumber: true },
//     });

//     const newVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

//     const result = await db.transaction(async (tx) => {
//       const newVersion = await tx
//         .insert(documentVersion)
//         .values({
//           ...restExistingVersion,
//           versionNumber: newVersionNumber,
//           createdAt: new Date(),
//           authorId: context.user!.id,
//           status: "draft",
//         })
//         .returning();

//       const newTranslations = await tx
//         .insert(documentVersionTranslation)
//         .values(
//           translations.map((tr) => ({
//             ...tr,
//             documentVersionId: newVersion[0].id,
//             createdAt: new Date(),
//           }))
//         )
//         .returning();

//       return {
//         ...newVersion[0],
//         translations: newTranslations,
//       };
//     });

//     return result;
//   });

// const deleteDocVersioSchema = cloneDocVersionInputSchema;

// /** Delete document version */
// export const $deleteDocumentVersion = createServerFn({
//   method: "POST",
// })
//   .inputValidator(deleteDocVersioSchema)
//   .middleware([hasPermissionMiddleware])
//   .handler(async ({ data, context }) => {
//     context.checkPermission("documentVersions", "delete");

//     const { contentId, versionNumber } = data;

//     const [result] = await db
//       .delete(documentVersion)
//       .where(
//         and(
//           eq(documentVersion.contentId, contentId),
//           eq(documentVersion.versionNumber, versionNumber)
//         )
//       )
//       .returning();

//     return result;
//   });

// // Define schemas for translation fields based on status
// const draftTranslationSchema = z.object({
//   title: z.string().nullable().optional(),
//   content: z.string().nullable().optional(),
// });

// const publishedTranslationSchema = z.object({
//   title: z.string().nullable(),
//   content: z.string().nullable(),
// });

// // Draft document version schema
// const draftVersionSchema = selectDocumentVersionSchema.extend({
//   status: z.literal("draft"),
//   translations: z.partialRecord(
//     unionOfLiterals(i18n.locales),
//     draftTranslationSchema
//   ),
// });

// // Published document version schema
// const publishedVersionSchema = selectDocumentVersionSchema.extend({
//   status: z.literal("published"),
//   translations: z.record(
//     unionOfLiterals(i18n.locales),
//     publishedTranslationSchema
//   ),
// });

// // Create a discriminated union based on status
// const versionUpdateSchema = z.discriminatedUnion("status", [
//   draftVersionSchema,
//   publishedVersionSchema,
// ]);

// /**
//  * Save/Update document version.
//  * Set `status:"draft"` or `status:"published"` to upsert draft or published version
//  */
// export const $saveDocumentVersion = createServerFn({
//   method: "POST",
// })
//   .middleware([hasPermissionMiddleware])
//   .inputValidator(versionUpdateSchema)
//   .handler(async ({ data, context }) => {
//     context.checkPermission("documentVersions", "update");
//     await upsertDocVersion({ data, user: context.user });
//   });

// const publishDocVersionDraftSchema = cloneDocVersionInputSchema;

// /**
//  * Publish documentVersion draft and delete draft
//  */
// export const $publishDocumentVersionDraft = createServerFn({ method: "POST" })
//   .middleware([hasPermissionMiddleware])
//   .inputValidator(publishDocVersionDraftSchema)
//   .handler(async ({ data, context }) => {
//     context.checkPermission("documentVersions", "publish");

//     // We received a draft but need to validate the content as if it were published
//     // Check if any required fields are missing before proceeding
//     const validatedData = publishedVersionSchema.parse({
//       ...data,
//       status: "published",
//     });

//     await upsertDocVersion({
//       data: { ...validatedData, status: "published" } as z.infer<
//         typeof publishedVersionSchema
//       >,
//       user: context.user,
//     });

//     // delete draft on publish
//     await db
//       .delete(documentVersion)
//       .where(
//         and(
//           eq(documentVersion.contentId, data.contentId),
//           eq(documentVersion.versionNumber, data.versionNumber),
//           eq(documentVersion.status, "draft")
//         )
//       );
//   });

// async function upsertDocVersion({
//   data,
//   user,
// }: {
//   data:
//     | z.infer<typeof draftVersionSchema>
//     | z.infer<typeof publishedVersionSchema>;
//   user: SessionUser;
// }) {
//   const { contentId, versionNumber, translations, status } = data;

//   await db.transaction(async (tx) => {
//     // Upsert the document version

//     const [upsertedDocVersion] = await tx
//       .insert(documentVersion)
//       .values({
//         contentId,
//         versionNumber,
//         status,
//         authorId: user.id,
//         updatedAt: new Date(),
//       })
//       .onConflictDoUpdate({
//         target: [
//           documentVersion.contentId,
//           documentVersion.versionNumber,
//           documentVersion.status,
//         ],

//         set: {
//           updatedAt: new Date(),
//           authorId: sql.raw(`excluded.author_id`),
//         },
//       })
//       .returning();

//     // Prepare translations for upsert
//     const translationsToUpsert: InsertDocumentVersionTranslationParams[] =
//       Object.entries(translations).map(([locale, t]) => ({
//         ...t,
//         documentVersionId: upsertedDocVersion.id,
//         updatedAt: new Date(),
//         locale,
//         translatedBy: user!.id,
//       }));

//     // upsert  doc ver translations
//     await tx
//       .insert(documentVersionTranslation)
//       .values(translationsToUpsert)
//       .onConflictDoUpdate({
//         target: [
//           documentVersionTranslation.documentVersionId,
//           documentVersionTranslation.locale,
//         ],

//         set: buildConflictUpdateColumns(documentVersionTranslation, [
//           "content",
//           "title",
//           "updatedAt",
//           "documentVersionId",
//         ]),
//       });
//   });
// }

// /**
//  * Delete ocumentVersion draft
//  */
// export const $deleteDocumentVersionDraft = createServerFn({ method: "POST" })
//   .middleware([hasPermissionMiddleware])
//   .inputValidator(selectDocumentVersionSchema.omit({ status: true }))
//   .handler(async ({ data, context }) => {
//     context.checkPermission("documentVersions", "update");

//     await db
//       .delete(documentVersion)
//       .where(
//         and(
//           eq(documentVersion.contentId, data.contentId),
//           eq(documentVersion.versionNumber, data.versionNumber),
//           eq(documentVersion.status, "draft")
//         )
//       );
//   });

// // ============================================================================
// // Document Version Translation Functions
// // ============================================================================

// const selectDocVersionTranslationSchema = z.object({
//   contentId: z.string(),
//   versionNumber: z.number(),
//   locale: localeSchema,
// });

// export type SelectDocVersionTranslationParams = z.infer<
//   typeof selectDocVersionTranslationSchema
// >;

// /** Helper to find documentVersionId from contentId, versionNumber, status */
// async function findDocumentVersionId(params: {
//   contentId: string;
//   versionNumber: number;
//   status: DocumentVersionStatus;
// }) {
//   const docVersion = await db.query.documentVersion.findFirst({
//     where: (table) =>
//       and(
//         eq(table.contentId, params.contentId),
//         eq(table.versionNumber, params.versionNumber),
//         eq(table.status, params.status)
//       ),
//     columns: { id: true },
//   });
//   return docVersion?.id ?? null;
// }

// /**
//  * Get document version translation
//  */
// export const $getDocVersionTranslation = createServerFn({
//   method: "GET",
// })
//   .middleware([hasPermissionMiddleware])
//   .inputValidator(
//     selectDocVersionTranslationSchema.extend({
//       status: statusSchema.optional(),
//     })
//   )
//   .handler(async ({ data, context }) => {
//     context.checkPermission("documentVersions", "view");

//     const { contentId, versionNumber, locale, status } = data;
//     const targetStatus = status ?? DOCUMENT_VERSION_STATUS.DRAFT;

//     const documentVersionId = await findDocumentVersionId({
//       contentId,
//       versionNumber,
//       status: targetStatus,
//     });

//     if (!documentVersionId) {
//       return null;
//     }

//     const translation = await db.query.documentVersionTranslation.findFirst({
//       where: (table) =>
//         and(
//           eq(table.documentVersionId, documentVersionId),
//           eq(table.locale, locale)
//         ),
//     });

//     return translation ?? null;
//   });

// export const getDocVersionTranslationQueryOptions = (
//   data: SelectDocVersionTranslationParams & { status?: DocumentVersionStatus }
// ) =>
//   queryOptions({
//     queryKey: [
//       "documents",
//       data.contentId,
//       "versions",
//       data.versionNumber,
//       "translations",
//       data.locale,
//       data.status ?? DOCUMENT_VERSION_STATUS.DRAFT,
//     ],
//     queryFn: () => $getDocVersionTranslation({ data }),
//     staleTime: 5 * 1000 * 60,
//   });

// const upsertDocVersionTranslationSchema =
//   selectDocVersionTranslationSchema.extend({
//     translation: insertDocumentVersionTranslationSchema.pick({
//       title: true,
//       content: true,
//     }),
//   });

// export type UpsertDocVersionTranslationParams = z.infer<
//   typeof upsertDocVersionTranslationSchema
// >;

// /**
//  * Save/Create draft translation for a document version
//  */
// export const $saveDocVersionTranslationDraft = createServerFn({
//   method: "POST",
// })
//   .middleware([hasPermissionMiddleware])
//   .inputValidator(upsertDocVersionTranslationSchema)
//   .handler(async ({ data, context }) => {
//     context.checkPermission("documentVersions", "update");

//     const { contentId, versionNumber, locale, translation } = data;

//     const documentVersionId = await findDocumentVersionId({
//       contentId,
//       versionNumber,
//       status: DOCUMENT_VERSION_STATUS.DRAFT,
//     });

//     if (!documentVersionId) {
//       throw new Error(
//         `Draft document version not found for contentId: ${contentId}, versionNumber: ${versionNumber}`
//       );
//     }

//     const [result] = await db
//       .insert(documentVersionTranslation)
//       .values({
//         documentVersionId,
//         locale,
//         title: translation.title,
//         content: translation.content,
//         translatedBy: context.user.id,
//         updatedAt: new Date(),
//       })
//       .onConflictDoUpdate({
//         target: [
//           documentVersionTranslation.documentVersionId,
//           documentVersionTranslation.locale,
//         ],
//         set: buildConflictUpdateColumns(documentVersionTranslation, [
//           "title",
//           "content",
//           "updatedAt",
//           "translatedBy",
//         ]),
//       })
//       .returning();

//     return result;
//   });

// /**
//  * Publish draft translation (copy draft translation to published version)
//  */
// export const $publishDocVersionTranslation = createServerFn({
//   method: "POST",
// })
//   .middleware([hasPermissionMiddleware])
//   .inputValidator(selectDocVersionTranslationSchema)
//   .handler(async ({ data, context }) => {
//     context.checkPermission("documentVersions", "publish");

//     const { contentId, versionNumber, locale } = data;

//     // Get draft document version ID
//     const draftDocVersionId = await findDocumentVersionId({
//       contentId,
//       versionNumber,
//       status: DOCUMENT_VERSION_STATUS.DRAFT,
//     });

//     if (!draftDocVersionId) {
//       throw new Error("Draft document version not found");
//     }

//     // Get the draft translation
//     const draftTranslation =
//       await db.query.documentVersionTranslation.findFirst({
//         where: (table) =>
//           and(
//             eq(table.documentVersionId, draftDocVersionId),
//             eq(table.locale, locale)
//           ),
//       });

//     if (!draftTranslation) {
//       throw new Error("Draft translation not found");
//     }

//     // Get or create published document version ID
//     let publishedDocVersionId = await findDocumentVersionId({
//       contentId,
//       versionNumber,
//       status: DOCUMENT_VERSION_STATUS.PUBLISHED,
//     });

//     if (!publishedDocVersionId) {
//       // Create published version if it doesn't exist
//       const [newPublishedVersion] = await db
//         .insert(documentVersion)
//         .values({
//           contentId,
//           versionNumber,
//           status: DOCUMENT_VERSION_STATUS.PUBLISHED,
//           authorId: context.user!.id,
//           publishedAt: new Date(),
//         })
//         .returning();

//       publishedDocVersionId = newPublishedVersion.id;
//     }

//     // Upsert the published translation
//     const [result] = await db
//       .insert(documentVersionTranslation)
//       .values({
//         documentVersionId: publishedDocVersionId,
//         locale,
//         title: draftTranslation.title,
//         content: draftTranslation.content,
//         translatedBy: context.user!.id,
//         updatedAt: new Date(),
//       })
//       .onConflictDoUpdate({
//         target: [
//           documentVersionTranslation.documentVersionId,
//           documentVersionTranslation.locale,
//         ],
//         set: buildConflictUpdateColumns(documentVersionTranslation, [
//           "title",
//           "content",
//           "updatedAt",
//           "translatedBy",
//         ]),
//       })
//       .returning();

//     return result;
//   });

// /**
//  * Unpublish translation (delete published translation)
//  */
// export const $unpublishDocVersionTranslation = createServerFn({
//   method: "POST",
// })
//   .middleware([hasPermissionMiddleware])
//   .inputValidator(selectDocVersionTranslationSchema)
//   .handler(async ({ data, context }) => {
//     context.checkPermission("documentVersions", "update");

//     const { contentId, versionNumber, locale } = data;

//     const publishedDocVersionId = await findDocumentVersionId({
//       contentId,
//       versionNumber,
//       status: DOCUMENT_VERSION_STATUS.PUBLISHED,
//     });

//     if (!publishedDocVersionId) {
//       throw new Error("Published document version not found");
//     }

//     const [result] = await db
//       .delete(documentVersionTranslation)
//       .where(
//         and(
//           eq(
//             documentVersionTranslation.documentVersionId,
//             publishedDocVersionId
//           ),
//           eq(documentVersionTranslation.locale, locale)
//         )
//       )
//       .returning();

//     return result;
//   });

// /**
//  * Reset draft translation to currently published translation
//  */
// export const $resetDocVersionTranslationDraft = createServerFn({
//   method: "POST",
// })
//   .middleware([hasPermissionMiddleware])
//   .inputValidator(selectDocVersionTranslationSchema)
//   .handler(async ({ data, context }) => {
//     context.checkPermission("documentVersions", "update");

//     const { contentId, versionNumber, locale } = data;

//     // Get published document version ID
//     const publishedDocVersionId = await findDocumentVersionId({
//       contentId,
//       versionNumber,
//       status: DOCUMENT_VERSION_STATUS.PUBLISHED,
//     });

//     if (!publishedDocVersionId) {
//       throw new Error("No published document version found");
//     }

//     // Get published translation
//     const publishedTranslation =
//       await db.query.documentVersionTranslation.findFirst({
//         where: (table) =>
//           and(
//             eq(table.documentVersionId, publishedDocVersionId),
//             eq(table.locale, locale)
//           ),
//       });

//     if (!publishedTranslation) {
//       throw new Error("No published translation found");
//     }

//     // Get draft document version ID
//     const draftDocVersionId = await findDocumentVersionId({
//       contentId,
//       versionNumber,
//       status: DOCUMENT_VERSION_STATUS.DRAFT,
//     });

//     if (!draftDocVersionId) {
//       throw new Error("No draft document version found");
//     }

//     // Update draft translation with published content
//     const [result] = await db
//       .update(documentVersionTranslation)
//       .set({
//         title: publishedTranslation.title,
//         content: publishedTranslation.content,
//         updatedAt: new Date(),
//         translatedBy: context.user!.id,
//       })
//       .where(
//         and(
//           eq(documentVersionTranslation.documentVersionId, draftDocVersionId),
//           eq(documentVersionTranslation.locale, locale)
//         )
//       )
//       .returning();

//     return result;
//   });

// /**
//  * Delete draft translation
//  */
// export const $deleteDocVersionTranslationDraft = createServerFn({
//   method: "POST",
// })
//   .middleware([hasPermissionMiddleware])
//   .inputValidator(selectDocVersionTranslationSchema)
//   .handler(async ({ data, context }) => {
//     context.checkPermission("documentVersions", "update");

//     const { contentId, versionNumber, locale } = data;

//     const draftDocVersionId = await findDocumentVersionId({
//       contentId,
//       versionNumber,
//       status: DOCUMENT_VERSION_STATUS.DRAFT,
//     });

//     if (!draftDocVersionId) {
//       throw new Error("Draft document version not found");
//     }

//     const [result] = await db
//       .delete(documentVersionTranslation)
//       .where(
//         and(
//           eq(documentVersionTranslation.documentVersionId, draftDocVersionId),
//           eq(documentVersionTranslation.locale, locale)
//         )
//       )
//       .returning();

//     return result;
//   });
