import { newsItem, newsTranslation } from "@/db/schema";
import {
  newsItemUpdateSchema,
  newsTranslationInsertSchema,
  newsTranslationSelectSchema,
  newsTranslationUpdateSchema,
} from "@/db/types";
import { db } from "@/lib/database";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, getTableColumns, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { getLocaleFn } from "./locale";
import { Locale } from "@/lib/i18n-config";
import { transformMarkdoc } from "@/markdoc/config";

/**
 * Get paginated list of titles and publication dates
 */
export const $getNewsTitles = createServerFn({ method: "GET" })
  .validator(
    z.object({
      limit: z.number().min(1).max(100).optional().default(5),
      offset: z.number().min(0).optional().default(0),
      locale: z.string(),
    })
  )
  .handler(async ({ data }) => {
    const locale = data.locale;

    const news = await db
      .select({
        id: newsItem.id,
        locale: newsTranslation.lang,
        title: newsTranslation.title,
        publishedAt: newsItem.publishedAt,
      })
      .from(newsTranslation)
      .where(eq(newsTranslation.lang, locale))
      .innerJoin(
        newsItem,
        and(
          eq(newsItem.id, newsTranslation.newsId),
          isNotNull(newsItem.publishedAt)
        )
      )
      .orderBy(desc(newsItem.publishedAt))
      .limit(data.limit)
      .offset(data.offset);

    return news;
  });

export type NewsTitleResponse = Awaited<
  ReturnType<typeof $getNewsTitles>
>[number];

export function getNewsTitlesQueryOptions({
  limit,
  offset,
  locale,
}: {
  limit?: number;
  offset?: number;
  locale: Locale;
}) {
  return queryOptions({
    queryKey: ["news", { limit, offset, locale }],
    queryFn: () => $getNewsTitles({ data: { limit, offset, locale } }),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}

/**
 * Get specific news translation by newsItemId and lang, for public-facing
 */
export const $getNewsTranslation = createServerFn({ method: "GET" })
  .validator(newsTranslationSelectSchema.pick({ lang: true, newsId: true }))
  .handler(async ({ data }) => {
    const newsItemId = data.newsId;

    const lang = data.lang;

    const result = await db.query.newsTranslation.findFirst({
      where: and(
        eq(newsTranslation.newsId, newsItemId),
        eq(newsTranslation.lang, lang)
      ),
      columns: {
        title: true,
        content: true,
        newsId: true,
        lang: true,
      },
      with: {
        newsItem: {
          columns: { publishedAt: true },
        },
      },
    });

    return {
      ...result,
      content: JSON.stringify(
        transformMarkdoc({ rawContent: result?.content ?? "" }).content
      ),
    };
  });

export function getNewsTranslationQueryOptions({
  newsItemId,
  lang,
}: {
  newsItemId: string;
  lang: Locale;
}) {
  return queryOptions({
    queryKey: ["news", { newsItemId, lang }],
    queryFn: () => $getNewsTranslation({ data: { newsId: newsItemId, lang } }),
  });
}

export const $getNewsItems = createServerFn({ method: "GET" })
  .middleware([hasPermissionMiddleware])
  .validator(
    z.object({
      limit: z.number().min(1).max(100).optional().default(5),
      offset: z.number().min(0).optional().default(0),
    })
  )
  .handler(async ({ data, context }) => {
    context.checkPermission("news", "view");

    const newsItems = await db
      .select({ ...getTableColumns(newsItem), newsTranslation })
      .from(newsItem)
      .leftJoin(newsTranslation, eq(newsItem.id, newsTranslation.newsId))
      .limit(data.limit)
      .offset(data.offset);

    const indexMap = new Map<string, number>();

    const groupedNews = [];

    for (let i = 0; i < newsItems.length; i++) {
      const item = newsItems[i];
      if (!item.id) continue;
      const index = indexMap.get(item.id);
      const { newsTranslation, ...restItem } = item;
      if (index === undefined) {
        groupedNews.push({ ...restItem, translations: [item.newsTranslation] });
        indexMap.set(item.id, groupedNews.length - 1);
      } else {
        groupedNews[index].translations.push(item.newsTranslation);
      }
    }

    return groupedNews;
  });

export type GetNewsItemsResponse = Awaited<ReturnType<typeof $getNewsItems>>;

export const $updateNewsItem = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .validator(newsItemUpdateSchema)
  .handler(async ({ context, data }) => {
    context.checkPermission("news", "update");

    const { id, ...restItem } = data;

    await db.update(newsItem).set(data).where(eq(newsItem.id, id));
  });

export function getNewsItemsQueryOptions({
  limit,
  offset,
}: {
  limit?: number;
  offset?: number;
}) {
  return queryOptions({
    queryKey: ["news", "items", limit, offset],
    queryFn: () => $getNewsItems({ data: { limit, offset } }),
  });
}

/**
 * Update news translation by newsItemId and locale. If existing, updates the existing item
 */
export const $upsertNewsTranslation = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .validator(newsTranslationInsertSchema)
  .handler(async ({ data, context }) => {
    context.checkPermission("news", "update");

    const result = await db
      .insert(newsTranslation)
      .values(data)
      .onConflictDoUpdate({
        target: [newsTranslation.newsId, newsTranslation.lang],
        set: {
          title: data.title,
          content: data.content,
        },
      })
      .returning();

    return result;
  });

/**
 * Delete news translation by newsItemId and locale
 */
export const $deleteNewsTranslation = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .validator(
    newsTranslationUpdateSchema.pick({ newsId: true, lang: true }).required()
  )
  .handler(async ({ data, context }) => {
    context.checkPermission("news", "delete");

    const result = await db
      .delete(newsTranslation)
      .where(
        and(
          eq(newsTranslation.newsId, data.newsId),
          eq(newsTranslation.lang, data.lang)
        )
      )
      .returning();

    return result;
  });

/**
 * Create newsItem
 */
export const $createNewsItem = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])

  .handler(async ({ context }) => {
    context.checkPermission("news", "create");

    const user = context.user!;

    const [result] = await db
      .insert(newsItem)
      .values({ authorId: user.id })
      .returning();

    return result;
  });

/**
 * Delete newsItem by id
 */
export const $deleteNewsItem = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .validator(newsItemUpdateSchema.pick({ id: true }).required())
  .handler(async ({ data, context }) => {
    context.checkPermission("news", "delete");

    const result = await db
      .delete(newsItem)
      .where(eq(newsItem.id, data.id))
      .returning();

    return result;
  });
