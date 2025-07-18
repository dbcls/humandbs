import { newsItem, newsTranslation } from "@/db/schema";
import {
  newsItemInsertSchema,
  newsItemUpdateSchema,
  newsTranslationInsertSchema,
  newsTranslationUpdateSchema,
} from "@/db/types";
import { db } from "@/lib/database";
import { Locale } from "@/lib/i18n-config";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { z } from "zod";
import { getLocaleFn } from "./locale";

export const $getLatestNews = createServerFn({ method: "GET" })
  .validator(
    z.object({
      limit: z.number().min(1).max(100).optional().default(5),
    })
  )
  .handler(async ({ data }) => {
    const locale = await getLocaleFn();

    const news = await db
      .select(getTableColumns(newsTranslation))
      .from(newsTranslation)
      .where(eq(newsTranslation.lang, locale))
      .leftJoin(newsItem, eq(newsItem.id, newsTranslation.newsId))
      .orderBy(desc(newsItem.createdAt))
      .limit(data.limit);

    return news;
  });

export function getLatestNewsQueryOptions({ locale }: { locale: Locale }) {
  return queryOptions({
    queryKey: ["news", "latest", locale],
    queryFn: () => $getLatestNews({ data: {} }),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
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

export function getNewsItemsQueryOptions({
  limit,
  offset,
}: {
  limit: number;
  offset: number;
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
  .validator(newsItemInsertSchema)
  .handler(async ({ data, context }) => {
    context.checkPermission("news", "create");

    const result = await db.insert(newsItem).values(data).returning();

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
