import { and, desc, eq, lte, sql } from "drizzle-orm";

import { i18n, type Locale } from "@/config/i18n";
import { db } from "@/db/database";
import { alert, newsItem, newsItemTag, newsTag, newsTranslation } from "@/db/schema";
import type { NewsTranslationUpsert } from "@/db/types";
import { toDateString } from "@/utils/dates";

export interface NewsTitleItem {
  alert: boolean;
  id: string;
  locale: Locale;
  title: string;
  publishedAt: string | null;
}

export interface NewsItemAuthor {
  name: string | null;
  email: string | null;
}

export interface NewsItemAlert {
  from: string | null;
  to: string | null;
}

export interface NewsItemTranslation {
  title: string;
  content: string;
  updatedAt: Date | null;
}

export interface NewsTag {
  id: string;
  name: string;
  color: string | null;
}

export interface NewsItemRecord {
  id: string;
  createdAt: Date;
  publishedAt: string | null;
  author: NewsItemAuthor;
  alert: NewsItemAlert | null;
  translations: Partial<Record<Locale, NewsItemTranslation>>;
  tags: NewsTag[];
}

export interface NewsItemCreateInput {
  authorId: string;
  publishedAt?: string | null;
  translations: NewsTranslationUpsert;
  alert?: { from?: string | null; to?: string | null } | null;
  tags?: string[];
}

export interface NewsItemUpdateInput {
  id: string;
  publishedAt?: string | null;
  translations: NewsTranslationUpsert;
  alert?: { from?: string | null; to?: string | null } | null;
  tags?: string[];
}

export interface NewsItemRepository {
  /**
   * Private
   * Get paginated list of news items with translations, alert, author, and tags.
   */
  list: (options: { limit?: number; offset?: number }) => Promise<NewsItemRecord[]>;

  /**
   * Public
   * Get paginated list of published news titles for a given locale.
   */
  listPublishedTitles: (options: {
    limit?: number;
    offset?: number;
    locale: string;
  }) => Promise<NewsTitleItem[]>;

  /**
   * Private
   * Create a new news item with translations, optional alert, and tags in one transaction.
   */
  create: (input: NewsItemCreateInput) => Promise<NewsItemRecord>;

  /**
   * Private
   * Update an existing news item's publishedAt, translations, alert, and tags in one transaction.
   */
  update: (input: NewsItemUpdateInput) => Promise<void>;

  /**
   * Private
   * Delete a news item by id.
   */
  delete: (id: string) => Promise<void>;
}

function mapTags(
  rawTags: { tag: { id: string; name: string; color: string | null } }[],
): NewsTag[] {
  return rawTags.map((t) => t.tag);
}

async function syncTags(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  itemId: string,
  tagIds: string[],
) {
  await tx.delete(newsItemTag).where(eq(newsItemTag.newsId, itemId));
  if (tagIds.length > 0) {
    await tx
      .insert(newsItemTag)
      .values(tagIds.map((tagId) => ({ newsId: itemId, tagId })));
  }
}

export function createNewsItemRepository(
  database: typeof db,
): NewsItemRepository {
  return {
    async listPublishedTitles({ limit = 5, offset = 0, locale }) {
      const nowStr = toDateString(new Date())!;

      const news = await database
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
            lte(newsItem.publishedAt, nowStr),
          ),
        )
        .leftJoin(alert, eq(alert.newsId, newsItem.id))
        .orderBy(desc(newsItem.publishedAt))
        .limit(limit)
        .offset(offset);

      return news.map((n) => ({
        ...n,
        locale: n.locale as Locale,
        alert: !!n.alert,
      }));
    },

    async list({ limit = 5, offset = 0 }) {
      const news = await database.query.newsItem.findMany({
        with: {
          translations: true,
          alert: {
            columns: { from: true, to: true },
          },
          author: {
            columns: { name: true, email: true },
          },
          tags: {
            with: {
              tag: {
                columns: { id: true, name: true, color: true },
              },
            },
          },
        },
        columns: { authorId: false },
        orderBy: (table, { desc }) => [desc(table.createdAt)],
        limit,
        offset,
      });

      return news.map((item) => ({
        ...item,
        alert: item.alert ?? null,
        tags: mapTags(item.tags),
        translations: item.translations.reduce<
          Partial<Record<Locale, NewsItemTranslation>>
        >((acc, curr) => {
          acc[curr.lang as Locale] = {
            content: curr.content,
            title: curr.title,
            updatedAt: curr.updatedAt,
          };
          return acc;
        }, {}),
      }));
    },

    async create({ authorId, publishedAt, translations, alert: alertInput, tags = [] }) {
      return database.transaction(async (tx) => {
        const [created] = await tx
          .insert(newsItem)
          .values({ authorId, publishedAt })
          .returning();

        const translationEntries = Object.entries(translations).filter(
          ([, tr]) => !!tr,
        );

        if (translationEntries.length > 0) {
          await tx
            .insert(newsTranslation)
            .values(
              translationEntries.map(([locale, tr]) => ({
                newsId: created.id,
                lang: locale,
                title: tr!.title!,
                content: tr!.content!,
              })),
            )
            .onConflictDoUpdate({
              target: [newsTranslation.newsId, newsTranslation.lang],
              set: {
                title: sql.raw(`excluded.${newsTranslation.title.name}`),
                content: sql.raw(`excluded.${newsTranslation.content.name}`),
                updatedAt: new Date(),
              },
            });
        }

        if (alertInput) {
          await tx
            .insert(alert)
            .values({ newsId: created.id, ...alertInput })
            .onConflictDoUpdate({
              target: [alert.newsId],
              set: alertInput,
            });
        }

        await syncTags(tx, created.id, tags);

        const result = await tx.query.newsItem.findFirst({
          where: eq(newsItem.id, created.id),
          with: {
            translations: true,
            alert: { columns: { from: true, to: true } },
            author: { columns: { name: true, email: true } },
            tags: {
              with: {
                tag: { columns: { id: true, name: true, color: true } },
              },
            },
          },
          columns: { authorId: false },
        });

        if (!result) throw new Error("Failed to fetch created news item");

        return {
          ...result,
          alert: result.alert ?? null,
          tags: mapTags(result.tags),
          translations: result.translations.reduce<
            Partial<Record<Locale, NewsItemTranslation>>
          >((acc, curr) => {
            acc[curr.lang as Locale] = {
              content: curr.content,
              title: curr.title,
              updatedAt: curr.updatedAt,
            };
            return acc;
          }, {}),
        };
      });
    },

    async update({ id, publishedAt, translations, alert: alertInput, tags = [] }) {
      await database.transaction(async (tx) => {
        await tx
          .update(newsItem)
          .set({ publishedAt })
          .where(eq(newsItem.id, id));

        const translationEntries = Object.entries(translations).filter(
          ([, tr]) => !!tr,
        );

        if (translationEntries.length > 0) {
          await tx
            .insert(newsTranslation)
            .values(
              translationEntries.map(([locale, tr]) => ({
                newsId: id,
                lang: locale,
                title: tr!.title!,
                content: tr!.content!,
              })),
            )
            .onConflictDoUpdate({
              target: [newsTranslation.newsId, newsTranslation.lang],
              set: {
                title: sql.raw(`excluded.${newsTranslation.title.name}`),
                content: sql.raw(`excluded.${newsTranslation.content.name}`),
                updatedAt: new Date(),
              },
            });
        }

        if (alertInput) {
          await tx
            .insert(alert)
            .values({ newsId: id, ...alertInput })
            .onConflictDoUpdate({
              target: [alert.newsId],
              set: alertInput,
            });
        } else {
          await tx.delete(alert).where(eq(alert.newsId, id));
        }

        await syncTags(tx, id, tags);
      });
    },

    async delete(id) {
      await database.delete(newsItem).where(eq(newsItem.id, id));
    },
  };
}

export const newsItemRepository = createNewsItemRepository(db);
