import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { User } from "better-auth";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { i18n, Locale, localeSchema } from "@/config/i18n-config";
import { getNavConfig } from "@/config/navbar-config";
import { db } from "@/db/database";
import {
  contentItem,
  contentTranslation,
  DOCUMENT_VERSION_STATUS,
} from "@/db/schema";
import {
  contentTranslationInsertSchema,
  ContentTranslationSelect,
  DocumentVersionStatus,
  statusSchema,
} from "@/db/types";
import { buildConflictUpdateColumns } from "@/db/utils";
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

export type ContentItemsListItem = {
  id: string;
  translations: Pick<ContentTranslationSelect, "title" | "lang" | "status">[];
};

const $getContentItems = createServerFn({ method: "GET" })
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context }): Promise<ContentItemsListItem[]> => {
    context.checkPermission("contents", "list");

    const contentItems = await db.query.contentItem.findMany({
      with: {
        translations: {
          columns: {
            title: true,
            lang: true,
            status: true,
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

export type ContentTranslationResponse = Omit<
  ContentTranslationSelect,
  "lang" | "contentId"
>;

export interface ContentItemResponse {
  author?: Pick<User, "name" | "email">;
  translations: Partial<
    Record<
      Locale,
      Partial<Record<DocumentVersionStatus, ContentTranslationResponse>>
    >
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

    console.log("translation", translation);

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
    console.log("checking permissions...");
    context.checkPermission("contents", "create");

    console.log("done!");
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

// Save/Create draft
const upsertContentItemDataSchema = contentTranslationInsertSchema.pick({
  title: true,
  content: true,
});

export type UpsertContentItemData = z.infer<typeof upsertContentItemDataSchema>;

const selectContentItemSchema = z.object({
  id: z.string(),
  lang: localeSchema,
});

export type UpcertContentItemData = z.infer<typeof upsertContentItemDataSchema>;

const upsertContentItemTranslationDraftSchema = z.object({
  translation: upsertContentItemDataSchema,
  ...selectContentItemSchema.shape,
});

export type UpsertContentItemDraftTranslationParams = z.infer<
  typeof upsertContentItemTranslationDraftSchema
>;

export const $saveContentItemTranslationDraft = createServerFn({
  method: "POST",
})
  .middleware([hasPermissionMiddleware])
  .inputValidator(upsertContentItemTranslationDraftSchema)
  .handler(async ({ data }) => {
    const result = await db
      .insert(contentTranslation)
      .values({
        lang: data.lang,
        contentId: data.id,
        status: DOCUMENT_VERSION_STATUS.DRAFT,
        content: data.translation.content,
        title: data.translation.title,
      })
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

export type SelectContentItemParams = z.infer<typeof selectContentItemSchema>;

// Publish draft
export type PublishContentItemResponse = ContentTranslationSelect & {
  status: typeof DOCUMENT_VERSION_STATUS.PUBLISHED;
};

export const $publishContentItemDraftTranslation = createServerFn({
  method: "POST",
})
  .inputValidator(selectContentItemSchema)
  .handler(async ({ data }): Promise<PublishContentItemResponse> => {
    const draftTranslation = await db.query.contentTranslation.findFirst({
      where: (table, { and, eq }) =>
        and(
          eq(table.contentId, data.id),
          eq(table.lang, data.lang),
          eq(table.status, DOCUMENT_VERSION_STATUS.DRAFT)
        ),
    });

    if (!draftTranslation) {
      throw new Error("Draft translation not found");
    }

    // Create or update the published version while keeping the draft
    const [result] = await db
      .insert(contentTranslation)
      .values({
        contentId: data.id,
        lang: data.lang,
        status: DOCUMENT_VERSION_STATUS.PUBLISHED,
        title: draftTranslation.title,
        content: draftTranslation.content,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          contentTranslation.contentId,
          contentTranslation.lang,
          contentTranslation.status,
        ],
        set: buildConflictUpdateColumns(contentTranslation, [
          "title",
          "content",
          "updatedAt",
        ]),
      })
      .returning();

    return result as PublishContentItemResponse;
  });

// Unpublish - delete published
export const $unpublishContentItemTranslation = createServerFn({
  method: "POST",
})
  .inputValidator(selectContentItemSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("contents", "update");

    const [result] = await db
      .delete(contentTranslation)
      .where(
        and(
          eq(contentTranslation.contentId, data.id),
          eq(contentTranslation.lang, data.lang),
          eq(contentTranslation.status, DOCUMENT_VERSION_STATUS.PUBLISHED)
        )
      )
      .returning();

    return result;
  });
