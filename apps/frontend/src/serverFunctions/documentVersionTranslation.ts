import {
  document,
  DOCUMENT_VERSION_STATUS,
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
      contentId: z.string(),
      locale: localeSchema,
      versionNumber: z.number(),
    })
  )
  .handler(async ({ data }) => {
    const { locale, versionNumber, contentId } = data;

    const [versionTranslation] = await db
      .select({ documentVersionTranslation })
      .from(documentVersionTranslation)
      .innerJoin(
        documentVersion,
        eq(documentVersionTranslation.documentVersionId, documentVersion.id)
      )
      .innerJoin(document, eq(documentVersion.documentId, document.id))
      .where(
        and(
          eq(document.contentId, contentId),
          eq(documentVersionTranslation.locale, locale),
          eq(documentVersion.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
          eq(documentVersion.versionNumber, versionNumber)
        )
      )
      .limit(1);

    const content = transformMarkdoc({
      rawContent: versionTranslation.documentVersionTranslation.content ?? "",
    });

    return {
      content: JSON.stringify(content.content),
      toc: content.toc,
      title: versionTranslation.documentVersionTranslation.title,
    };
  });

export function getDocumentVersionTranslationQueryOptions({
  versionNumber,
  contentId,
  locale,
}: {
  versionNumber: number;
  contentId: string;
  locale: Locale;
}) {
  return queryOptions({
    queryKey: ["documentVersionTranslation", contentId, locale, versionNumber],
    queryFn: () =>
      $getDocumentVersionTranslation({
        data: {
          contentId,
          locale,
          versionNumber,
        },
      }),

    enabled: !!contentId && !!locale && !!versionNumber,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}

/**
 * Get latest version of document translation
 */
export const $getDocumentLatestPublishedVersionTranslation = createServerFn({
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
          eq(documentVersionTranslation.locale, locale),
          eq(documentVersion.status, DOCUMENT_VERSION_STATUS.PUBLISHED)
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
      rawContent: translation[0]?.documentVersionTranslation.content ?? "",
      includeFrontmatter: true,
      generateTOC: data?.generateTOC ?? false,
    });

    return {
      content: JSON.stringify(content),
      toc,
      title: translation[0]?.documentVersionTranslation.title,
    };
  });

export function getDocumentLatestPublishedVersionTranslationQueryOptions({
  contentId,
  locale,
}: {
  contentId: string;
  locale: Locale;
}) {
  return queryOptions({
    queryKey: ["latestDocumentVersionTranslation", contentId, locale],
    queryFn: () =>
      $getDocumentLatestPublishedVersionTranslation({
        data: { contentId, locale },
      }),
  });
}

export const $getDocumentPublishedVersionsList = createServerFn({
  method: "GET",
})
  .validator(
    z.object({
      contentId: z.string(),
      locale: localeSchema,
    })
  )
  .handler(async ({ context, data }) => {
    const { contentId, locale } = data;

    const versions = await db
      .select({
        documentVersionTranslation,
        versionNumber: documentVersion.versionNumber,
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
          eq(documentVersionTranslation.locale, locale),
          eq(documentVersion.status, DOCUMENT_VERSION_STATUS.PUBLISHED)
        )
      )
      .orderBy(desc(documentVersion.versionNumber));

    return versions.map((v) => ({
      ...v.documentVersionTranslation,
      versionNumber: v.versionNumber,
    }));
  });

export function getDocumentPublishedVersionsListQueryOptions({
  contentId,
  locale,
}: {
  contentId: string;
  locale: Locale;
}) {
  return queryOptions({
    queryKey: ["publishedDocumentVersionsList", contentId, locale],
    queryFn: () =>
      $getDocumentPublishedVersionsList({
        data: { contentId, locale },
      }),
    enabled: !!contentId && !!locale,
    staleTime: 1000 * 60 * 60 * 24,
  });
}
