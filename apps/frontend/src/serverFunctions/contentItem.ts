import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { User } from "better-auth";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getNavConfig } from "@/config/navbar-config";
import {
  contentItem,
  contentTranslation,
  DOCUMENT_VERSION_STATUS,
} from "@/db/schema";
import {
  ContentTranslationInsert,
  contentTranslationInsertSchema,
  ContentTranslationSelect,
  DocumentVersionStatus,
  statusSchema,
} from "@/db/types";
import { buildConflictUpdateColumns } from "@/db/utils";
import { db } from "@/db/database";
import { i18n, Locale, localeSchema } from "@/lib/i18n-config";
import { transformMarkdoc } from "@/markdoc/config";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";

export function getContentsListQueryOptions() {
  return queryOptions({
    queryKey: ["contents"],
    queryFn: $getContentItems,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function getContentQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["contents", id],
    queryFn: () => $getContentItem({ data: id }),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

const $getContentItems = createServerFn({ method: "GET" })
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context }) => {
    context.checkPermission("contents", "list");

    const contentItems = await db.query.contentItem.findMany({
      with: {
        translations: {
          columns: {
            title: true,
            lang: true,
          },
        },
      },
      columns: {
        createdAt: false,
        publishedAt: false,
        authorId: false,
      },
    });

    return contentItems;
  });

type ContentTranslationResponse = Omit<
  ContentTranslationSelect,
  "lang" | "contentId"
>;

interface ContentItemResponse {
  author?: Pick<User, "name" | "email">;
  translations: Record<
    Locale,
    Record<DocumentVersionStatus, ContentTranslationResponse>
  >;
}

export const $getContentItem = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data }): Promise<ContentItemResponse> => {
    const contentId = data;
    const content = await db.query.contentItem.findFirst({
      where: (content, { eq }) => eq(content.id, contentId),
      with: {
        author: {
          columns: {
            name: true,
            email: true,
          },
        },
        translations: {
          columns: {
            title: true,
            content: true,
            lang: true,
            updatedAt: true,
            status: true,
          },
        },
      },
      columns: {
        authorId: false,
      },
    });

    return {
      author: content?.author,
      translations:
        content?.translations.reduce(
          (acc, curr) => {
            const { title, content, updatedAt, status } = curr;
            const locale = curr.lang as Locale;
            if (!acc[locale]) acc[locale] = {};

            acc[locale]![status] = {
              title,
              content,
              updatedAt,
              status,
            };
            return acc;
          },
          {} as ContentItemResponse["translations"]
        ) || ({} as ContentItemResponse["translations"]),
    };
  });

export function getContentTranslationQueryOptions(data: {
  id: string;
  lang: Locale;
  status?: DocumentVersionStatus;
}) {
  return queryOptions({
    queryKey: [
      "contents",
      data.id,
      data.lang,
      data.status || DOCUMENT_VERSION_STATUS.PUBLISHED,
    ],
    queryFn: () =>
      $getContentItemTranslation({
        data: {
          id: data.id,
          lang: data.lang,
          status: data.status || DOCUMENT_VERSION_STATUS.PUBLISHED,
        },
      }),
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

const getContentItemTranslationParamsSchema = z.object({
  id: z.string(),
  lang: localeSchema,
  status: statusSchema,
});

export type GetContentItemTranslationParams = z.infer<
  typeof getContentItemTranslationParamsSchema
>;

/**
 * Get content published translation
 */
export const $getContentItemTranslation = createServerFn({
  method: "GET",
})
  .inputValidator(getContentItemTranslationParamsSchema)
  .handler(async ({ data }) => {
    const { id, lang, status } = data;
    const translation = await db.query.contentTranslation.findFirst({
      where: (table, { and, eq }) =>
        and(
          eq(table.contentId, id),
          eq(table.lang, lang),
          eq(table.status, status)
        ),
      columns: {
        title: true,
        content: true,
      },
    });

    if (!translation) {
      throw new Error(
        `${status.replace(/^./g, (m) => m.toUpperCase())} content with id "${data.id}" not found`
      );
    }

    const { content, toc } = transformMarkdoc({
      rawContent: translation?.content || "",
      generateTOC: true,
    });

    return {
      content: JSON.stringify(content),
      toc,
      title: translation?.title,
    };
  });

export const $isExistingContentItemSplat = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data }) => {
    const contentId = data;
    const content = await db.query.contentItem.findFirst({
      where: (content, { eq }) => eq(content.id, contentId),
    });

    return !!content;
  });

// interface ContentIdValidationResponse {
//   error: boolean;
//   message?: string;
// }

export const $validateContentId = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data }): Promise<boolean> => {
    const contentId = data;

    const reservedPathPrefixes = getNavConfig(i18n.defaultLocale).map(
      (c) => c.id
    ) as string[];

    const content = await db.query.contentItem.findFirst({
      where: (content, { eq }) => eq(content.id, contentId),
    });

    return !content && !reservedPathPrefixes.includes(contentId.split("/")[0]);
  });

export const $createContentItem = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
    })
  )
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("contents", "create");

    const id = data.id;

    const user = context.user!;

    const newContentItem = await db
      .insert(contentItem)
      .values({
        id,
        authorId: user.id,
      })
      .returning();

    return newContentItem[0];
  });

export const $deleteContentItem = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
    })
  )
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("contents", "delete");

    const id = data.id;

    const deletedContentItem = await db
      .delete(contentItem)
      .where(eq(contentItem.id, id))
      .returning();

    return deletedContentItem[0];
  });

const upsertContentItemTranslationSchema = z.object({
  translations: z.partialRecord(
    localeSchema,
    z.partialRecord(
      statusSchema,
      contentTranslationInsertSchema.pick({
        title: true,
        content: true,
      })
    )
  ),
  id: z.string(),
});

type UpsertContentTranslationParams = z.infer<
  typeof upsertContentItemTranslationSchema
>;

export const $upsertContentItemTranslation = createServerFn({ method: "POST" })
  .inputValidator(upsertContentItemTranslationSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("contents", "update");

    const dataToUpsert: ContentTranslationInsert[] = Object.entries(
      data.translations
    ).flatMap(([lang, translationStatuses]) =>
      Object.entries(translationStatuses).map(([status, translation]) => ({
        ...translation,
        status: status as DocumentVersionStatus,
        lang,
        contentId: data.id,
      }))
    );

    const result = await db
      .insert(contentTranslation)
      .values(dataToUpsert)
      .onConflictDoUpdate({
        target: [
          contentTranslation.contentId,
          contentTranslation.lang,
          contentTranslation.status,
        ],
        set: buildConflictUpdateColumns(contentTranslation, [
          "content",
          "title",
        ]),
      })
      .returning();

    return result;
  });
