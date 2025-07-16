import {
  document,
  documentVersion,
  documentVersionTranslation,
} from "@/db/schema";
import {
  insertDocumentVersionTranslationSchema,
  updateDocumentVersionTranslationSchema,
} from "@/db/types";
import { db } from "@/lib/database";
import { Locale, localeSchema } from "@/lib/i18n-config";
import { collectHeadings, transformMarkdoc } from "@/markdoc/config";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

/** Get document version translation */
export const $getDocumentVersionTranslation = createServerFn({
  method: "GET",
  response: "data",
})
  .validator(
    z.object({
      locale: localeSchema,
      documentVersionId: z.string(),
    })
  )
  .handler(async ({ data }) => {
    const { locale, documentVersionId } = data;

    const translation = await db.query.documentVersionTranslation.findFirst({
      where: (table) =>
        and(
          eq(table.documentVersionId, documentVersionId),
          eq(table.locale, locale)
        ),
      with: {
        translator: true,
        version: true,
      },
    });

    return translation || null;
  });

export function getDocumentVersionTranslationQueryOptions({
  locale,
  documentVersionId,
}: {
  locale: Locale;
  documentVersionId: string;
}) {
  return queryOptions({
    queryKey: ["document", "locale", locale, "versionId", documentVersionId],
    queryFn: () => {
      if (!documentVersionId) {
        return Promise.resolve(null);
      }

      return $getDocumentVersionTranslation({
        data: { locale, documentVersionId },
      });
    },
    staleTime: 1000 * 60 * 10,
  });
}

/** Create document version translation */
export const $createDocumentVersionTranslation = createServerFn({
  method: "POST",
})
  .validator(insertDocumentVersionTranslationSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("documentVersionTranslations", "create");

    const user = context.user!;

    return await db
      .insert(documentVersionTranslation)
      .values({ ...data, translatedBy: user.id })
      .returning();
  });

/** Update Translation by versionId and locale */
export const $updateDocumentVersionTranslation = createServerFn({
  method: "POST",
})
  .validator(updateDocumentVersionTranslationSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("documentVersionTranslations", "update");

    return await db
      .update(documentVersionTranslation)
      .set({ content: data.content, updatedAt: new Date() })
      .where(
        and(
          eq(
            documentVersionTranslation.documentVersionId,
            data.documentVersionId
          ),
          eq(documentVersionTranslation.locale, data.locale)
        )
      )
      .returning();
  });

/** Delete document version translation */

export const $deleteDocumentVersionTranslation = createServerFn({
  method: "POST",
})
  .validator(updateDocumentVersionTranslationSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("documentVersionTranslations", "update");

    return await db
      .delete(documentVersionTranslation)
      .where(
        and(
          eq(
            documentVersionTranslation.documentVersionId,
            data.documentVersionId
          ),
          eq(documentVersionTranslation.locale, data.locale)
        )
      );
  });

/**
 * Get latest version of document translation
 */
export const $getDocumentLatestVersionTranslation = createServerFn({
  method: "GET",
  response: "data",
})
  .validator(
    z.object({
      contentId: z.string(),
      locale: localeSchema,
      generateTOC: z.boolean().default(false),
    })
  )
  .handler(async ({ data }) => {
    const { contentId, locale } = data;

    const translation = await db
      .select({
        documentVersionTranslation,
      })
      .from(documentVersionTranslation)
      .innerJoin(
        documentVersion,
        eq(documentVersionTranslation.documentVersionId, documentVersion.id)
      )
      .innerJoin(document, eq(documentVersion.documentId, document.id))
      .where(
        and(
          eq(document.contentId, contentId),
          eq(documentVersionTranslation.locale, locale)
        )
      )
      .orderBy(desc(documentVersion.versionNumber))
      .limit(1);

    if (!translation || !translation[0]) {
      throw new Error(
        `Document ${contentId}'s ${locale} translation not found`
      );
    }

    const { content, toc } = transformMarkdoc({
      rawContent: translation[0]?.documentVersionTranslation.content,
      includeFrontmatter: true,
      generateTOC: data?.generateTOC ?? false,
    });

    return { content: JSON.stringify(content), toc };
  });

export function getDocumentLatestVersionTranslationQueryOptions({
  contentId,
  locale,
}: {
  contentId: string;
  locale: Locale;
}) {
  return queryOptions({
    queryKey: ["latestDocumentVersionTranslation", contentId, locale],
    queryFn: () =>
      $getDocumentLatestVersionTranslation({ data: { contentId, locale } }),
  });
}
