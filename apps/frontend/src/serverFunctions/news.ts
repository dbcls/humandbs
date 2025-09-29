import { alert, newsItem, newsTranslation } from "@/db/schema";
import {
  newsItemUpdateSchema,
  newsTranslationInsertSchema,
  NewsTranslationSelect,
  newsTranslationSelectSchema,
  newsTranslationUpdateSchema,
  NewsTranslationUpsert,
} from "@/db/types";
import { db } from "@/lib/database";
import { Locale } from "@/lib/i18n-config";
import { transformMarkdoc } from "@/markdoc/config";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getLocaleFn } from "./locale";
import { toDateString } from "@/lib/utils";

/**
 * Get paginated list of titles and publication dates
 */
export const $getNewsTitles = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      limit: z.number().min(1).max(100).optional().default(5),
      offset: z.number().min(0).optional().default(0),
      locale: z.string(),
    })
  )
  .handler(async ({ data }) => {
    const locale = data.locale;

    const nowStr = toDateString(new Date()) as string;

    const news = await db
      .select({
        id: newsItem.id,
        locale: newsTranslation.lang,
        title: newsTranslation.title,
        publishedAt: newsItem.publishedAt,
        alert: alert.newsId,
      })
      .from(newsTranslation)
      .where(eq(newsTranslation.lang, locale))
      .innerJoin(
        newsItem,
        and(
          eq(newsTranslation.newsId, newsItem.id),
          lte(newsItem.publishedAt, nowStr)
        )
      )
      .leftJoin(alert, eq(alert.newsId, newsItem.id))
      .orderBy(desc(newsItem.publishedAt))
      .limit(data.limit)
      .offset(data.offset);

    return news.map((n) => ({
      ...n,
      alert: !!n.alert,
    }));
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
  .inputValidator(
    newsTranslationSelectSchema.pick({ lang: true, newsId: true })
  )
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

    if (!result) {
      throw new Error("News translation not found");
    }

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
  .inputValidator(
    z.object({
      limit: z.number().min(1).max(100).optional().default(5),
      offset: z.number().min(0).optional().default(0),
    })
  )
  .handler(async ({ data, context }) => {
    context.checkPermission("news", "view");

    const news = await db.query.newsItem.findMany({
      with: {
        translations: true,
        alert: {
          columns: {
            from: true,
            to: true,
          },
        },
        author: {
          columns: {
            name: true,
            email: true,
          },
        },
      },
      columns: {
        authorId: false,
      },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: data.limit,
      offset: data.offset,
    });

    type T = typeof news;

    type News = (Omit<T[number], "alert"> & {
      alert: Pick<T[number], "alert">["alert"] | null;
    })[];

    const response = news.map((item) => ({
      ...(item as Omit<News[number], "translations">),
      translations: item.translations.reduce(
        (acc, curr) => {
          acc[curr.lang as Locale] = {
            content: curr.content,
            title: curr.title,
            updatedAt: curr.updatedAt,
          };
          return acc;
        },
        {} as Partial<
          Record<
            Locale,
            Pick<NewsTranslationSelect, "content" | "title" | "updatedAt">
          >
        >
      ),
    }));

    return response;
  });

export type NewsItemResponse = Awaited<
  ReturnType<typeof $getNewsItems>
>[number];

export const $updateNewsItem = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(newsItemUpdateSchema)
  .handler(async ({ context, data }) => {
    context.checkPermission("news", "update");

    const { id, ...restItem } = data;

    await db.transaction(async (tx) => {
      // update publication date
      await tx
        .update(newsItem)
        .set({ publishedAt: restItem.publishedAt })
        .where(eq(newsItem.id, id));

      const translations = Object.entries(data.translations) as [
        Locale,
        NewsTranslationUpsert[keyof NewsTranslationUpsert],
      ][];

      const translationsToInsert = translations.map(
        ([locale, translation]) => ({
          newsId: id,
          lang: locale,
          title: translation?.title!,
          content: translation?.content!,
        })
      );
      //upsert translations
      await tx
        .insert(newsTranslation)
        .values(translationsToInsert)
        .onConflictDoUpdate({
          target: [newsTranslation.newsId, newsTranslation.lang],
          set: {
            title: sql.raw(`excluded.${newsTranslation.title.name}`),
            content: sql.raw(`excluded.${newsTranslation.content.name}`),
            updatedAt: new Date(),
          },
        });
      if (data.alert) {
        await tx
          .insert(alert)
          .values({ newsId: id, ...data.alert })
          .onConflictDoUpdate({
            target: [alert.newsId],
            set: data.alert,
          });
      } else {
        await tx.delete(alert).where(eq(alert.newsId, id));
      }
    });
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
  .inputValidator(newsTranslationInsertSchema)
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
          updatedAt: new Date(),
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
  .inputValidator(
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
 * Create empty newsItem
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
  .inputValidator(newsItemUpdateSchema.pick({ id: true }).required())
  .handler(async ({ data, context }) => {
    context.checkPermission("news", "delete");

    const result = await db
      .delete(newsItem)
      .where(eq(newsItem.id, data.id))
      .returning();

    return result;
  });
