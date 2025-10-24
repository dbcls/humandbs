import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  document,
  DOCUMENT_VERSION_STATUS,
  documentVersion,
  DocumentVersionTranslation,
  documentVersionTranslation,
} from "@/db/schema";
import { db } from "@/lib/database";
import { i18n, Locale, localeSchema } from "@/lib/i18n-config";
import { transformMarkdoc } from "@/markdoc/config";

/** Get document version translation */
export const $getDocumentVersionTranslation = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      contentId: z.string(),
      locale: localeSchema,
      versionNumber: z.number(),
      generateTOC: z.boolean().default(false),
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
      .innerJoin(document, eq(documentVersion.contentId, document.contentId))
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
      generateTOC: data.generateTOC,
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
  generateTOC = false,
}: {
  versionNumber: number;
  contentId: string;
  locale: Locale;
  generateTOC?: boolean;
}) {
  return queryOptions({
    queryKey: ["documentVersionTranslation", contentId, locale, versionNumber],
    queryFn: () =>
      $getDocumentVersionTranslation({
        data: {
          contentId,
          locale,
          versionNumber,
          generateTOC,
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
})
  .inputValidator(
    z.object({
      contentId: z.string(),
      locale: localeSchema,
      generateTOC: z.boolean().default(false),
    })
  )
  .handler(async ({ data }) => {
    const { contentId, locale } = data;

    const translationQuery = db
      .select({
        title: documentVersionTranslation.title,
        documentVersionId: documentVersionTranslation.documentVersionId,
        locale: documentVersionTranslation.locale,
        content: documentVersionTranslation.content,
        translatedBy: documentVersionTranslation.translatedBy,
        createdAt: documentVersionTranslation.createdAt,
        updatedAt: documentVersionTranslation.updatedAt,
        versionNumber: documentVersion.versionNumber,
      })
      .from(documentVersionTranslation)
      .innerJoin(
        documentVersion,
        eq(documentVersionTranslation.documentVersionId, documentVersion.id)
      )
      .where(
        and(
          eq(documentVersion.contentId, contentId),
          eq(documentVersionTranslation.locale, sql.placeholder("locale")),
          eq(documentVersion.status, DOCUMENT_VERSION_STATUS.PUBLISHED)
        )
      )
      .orderBy(desc(documentVersion.versionNumber))
      .limit(1)
      .prepare("q1");

    let translation = await translationQuery.execute({ locale });

    if (!translation || !translation[0]) {
      translation = await translationQuery.execute({
        locale: i18n.defaultLocale,
      });
    }

    if (!translation || !translation[0]) {
      throw new Error(
        `Document ${contentId}'s ${locale} translation not found`
      );
    }

    const { content, toc } = transformMarkdoc({
      rawContent: translation[0]?.content ?? "",
      includeFrontmatter: true,
      generateTOC: data?.generateTOC ?? false,
    });

    return {
      content: JSON.stringify(content),
      toc,
      title: translation[0]?.title,
    };
  });

export function getDocumentLatestPublishedVersionTranslationQueryOptions({
  contentId,
  locale,
  generateTOC,
}: {
  contentId: string;
  locale: Locale;
  generateTOC?: boolean;
}) {
  return queryOptions({
    queryKey: ["latestDocumentVersionTranslation", contentId, locale],
    queryFn: () =>
      $getDocumentLatestPublishedVersionTranslation({
        data: { contentId, locale, generateTOC },
      }),
  });
}

export type DocumentPublishedVersionsListItemResponse =
  DocumentVersionTranslation & {
    versionNumber: number;
  };

export const $getDocumentPublishedVersionsList = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      contentId: z.string(),
      locale: localeSchema,
    })
  )
  .handler(async ({ data }) => {
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
      .innerJoin(document, eq(documentVersion.contentId, document.contentId))
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
    })) satisfies DocumentPublishedVersionsListItemResponse[];
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
