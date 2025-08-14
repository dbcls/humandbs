import {
  document,
  documentVersion,
  documentVersionTranslation,
} from "@/db/schema";
import { db } from "@/lib/database";
import { Locale, localeSchema } from "@/lib/i18n-config";
import { transformMarkdoc } from "@/markdoc/config";
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
