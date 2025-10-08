import { contentItem, contentTranslation } from "@/db/schema";
import {
  ContentTranslationInsert,
  contentTranslationInsertSchema,
  ContentTranslationSelect,
} from "@/db/types";
import { buildConflictUpdateColumns } from "@/db/utils";
import { db } from "@/lib/database";
import { i18n, Locale, localeSchema } from "@/lib/i18n-config";
import { transformMarkdoc } from "@/markdoc/config";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { User } from "better-auth";
import { eq } from "drizzle-orm";
import z from "zod";

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
type ContentItemResponse = {
  author?: Pick<User, "name" | "email">;
  translations: Partial<Record<Locale, ContentTranslationResponse>>;
};

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
            const { title, content, updatedAt } = curr;
            acc[curr.lang as Locale] = { title, content, updatedAt };
            return acc;
          },
          {} as Record<Locale, ContentTranslationResponse>
        ) || {},
    };
  });

export function getContentTranslationQueryOptions(data: {
  id: string;
  lang: Locale;
}) {
  return queryOptions({
    queryKey: ["contents", data.id, data.lang],
    queryFn: () => $getContentItemTranslation({ data }),
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

export const $getContentItemTranslation = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      id: z.string(),
      lang: localeSchema,
    })
  )
  .handler(async ({ data }) => {
    const { id, lang } = data;
    let translation = await db.query.contentTranslation.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.contentId, id), eq(table.lang, lang)),
      columns: {
        title: true,
        content: true,
      },
    });

    if (!translation) {
      translation = await db.query.contentTranslation.findFirst({
        where: (table, { and, eq }) =>
          and(eq(table.contentId, data.id), eq(table.lang, i18n.defaultLocale)),
        columns: {
          title: true,
          content: true,
        },
      });
    }
    if (!translation) {
      throw new Error(`Content with id "${data.id}" not found`);
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

export const $validateContentId = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data }) => {
    const contentId = data;
    const content = await db.query.contentItem.findFirst({
      where: (content, { eq }) => eq(content.id, contentId),
    });

    return !!content;
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
    contentTranslationInsertSchema.pick({
      title: true,
      content: true,
    })
  ),
  id: z.string(),
});

export const $upsertContentItemTranslation = createServerFn({ method: "POST" })
  .inputValidator(upsertContentItemTranslationSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("contents", "update");

    const dataToUpsert: ContentTranslationInsert[] = Object.entries(
      data.translations
    ).map(([lang, translation]) => ({
      lang,
      contentId: data.id,
      ...translation,
    }));

    const result = await db
      .insert(contentTranslation)
      .values(dataToUpsert)
      .onConflictDoUpdate({
        target: [contentTranslation.contentId, contentTranslation.lang],
        set: buildConflictUpdateColumns(contentTranslation, [
          "content",
          "title",
        ]),
      })
      .returning();

    return result;
  });
