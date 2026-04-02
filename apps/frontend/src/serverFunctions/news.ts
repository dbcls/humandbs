import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { and, eq } from "drizzle-orm";

import { i18n, type Locale } from "@/config/i18n";
import { db } from "@/db/database";
import { newsTranslation } from "@/db/schema";
import {
  newsItemCreateSchema,
  newsItemUpdateSchema,
  newsTranslationInsertSchema,
  newsTranslationUpdateSchema,
} from "@/db/types";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { newsItemRepository } from "@/repositories/newsItem";

export interface NewsTitleResponse {
  alert: boolean;
  id: string;
  locale: Locale;
  title: string;
  publishedAt: string | null;
}

/**
 * Get paginated list of titles and publication dates
 */
export const $getNewsTitles = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      limit: z.number().min(1).max(100).optional().default(5),
      offset: z.number().min(0).optional().default(0),
      locale: z.string(),
    }),
  )
  .handler(async ({ data }): Promise<NewsTitleResponse[]> => {
    return newsItemRepository.listPublishedTitles({
      limit: data.limit,
      offset: data.offset,
      locale: data.locale,
    });
  });

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
  .inputValidator(z.object({ newsId: z.string(), lang: z.string() }))
  .handler(async ({ data }) => {
    const newsItemId = data.newsId;
    const lang = data.lang;

    let result = await db.query.newsTranslation.findFirst({
      where: and(
        eq(newsTranslation.newsId, newsItemId),
        eq(newsTranslation.lang, lang),
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
      result = await db.query.newsTranslation.findFirst({
        where: and(
          eq(newsTranslation.newsId, newsItemId),
          eq(newsTranslation.lang, i18n.defaultLocale),
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
    }

    if (!result) {
      throw new Error("News translation not found");
    }

    return result;
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
    }),
  )
  .handler(async ({ data, context }) => {
    context.checkPermission("news", "view");
    return newsItemRepository.list({ limit: data.limit, offset: data.offset });
  });

export type NewsItemResponse = Awaited<
  ReturnType<typeof $getNewsItems>
>[number];

export const $updateNewsItem = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(newsItemUpdateSchema)
  .handler(async ({ context, data }) => {
    context.checkPermission("news", "update");
    await newsItemRepository.update({
      id: data.id,
      publishedAt: data.publishedAt,
      translations: data.translations,
      alert: data.alert,
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
    newsTranslationUpdateSchema.pick({ newsId: true, lang: true }).required(),
  )
  .handler(async ({ data, context }) => {
    context.checkPermission("news", "delete");

    const result = await db
      .delete(newsTranslation)
      .where(
        and(
          eq(newsTranslation.newsId, data.newsId),
          eq(newsTranslation.lang, data.lang),
        ),
      )
      .returning();

    return result;
  });

/**
 * Create a new news item with full content in a single transaction.
 */
export const $createNewsItem = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(newsItemCreateSchema)
  .handler(async ({ context, data }) => {
    context.checkPermission("news", "create");
    const user = context.user;
    return newsItemRepository.create({
      authorId: user.id,
      publishedAt: data.publishedAt,
      translations: data.translations,
      alert: data.alert,
    });
  });

/**
 * Delete newsItem by id
 */
export const $deleteNewsItem = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(newsItemUpdateSchema.pick({ id: true }).required())
  .handler(async ({ data, context }) => {
    context.checkPermission("news", "delete");
    await newsItemRepository.delete(data.id);
  });
