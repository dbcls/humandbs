import { and, desc, eq, exists, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";

import type { Locale } from "@/config/i18n";
import type { DB } from "@/db/database";
import { db } from "@/db/database";
import { newsItem, newsItemTag, newsTranslation } from "@/db/schema";
import type { NewsTranslationSelect, NewsTranslationUpsert } from "@/db/types";

export interface NewsTitleItem {
  id: string;
  locale: Locale;
  title: string;
  publishedAt: Date | null;
}

export interface PublishedTitlesFilters {
  titleOrContent?: string;
  publishedFrom?: Date;
  publishedTo?: Date;
  tagIds?: string[];
}

export interface NewsItemAuthor {
  name: string | null;
  email: string | null;
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
  publishedAt: Date | null;
  author: NewsItemAuthor;
  translations: Partial<Record<Locale, NewsItemTranslation>>;
  tags: NewsTag[];
}

export interface NewsItemCreateInput {
  authorId: string;
  publishedAt?: Date | null;
  translations: NewsTranslationUpsert;
  tags?: string[];
}

export interface NewsItemUpdateInput {
  id: string;
  publishedAt?: Date | null;
  translations: NewsTranslationUpsert;
  tags?: string[];
}

export interface NewsItemFilters {
  titleOrContent?: string;
  publishedFrom?: Date;
  publishedTo?: Date;
  tagIds?: string[];
}

export interface NewsItemRepository {
  /**
   * Private
   * Get paginated list of news items with translations, alert, author, and tags.
   */
  list: (options: {
    limit?: number;
    offset?: number;
    filters?: NewsItemFilters;
  }) => Promise<NewsItemRecord[]>;

  /**
   * Public
   * Get a news item by id
   */
  get: (options: { id: string }) => Promise<NewsItemRecord | undefined>;

  /**
   * Public
   * Get paginated list of published news titles for a given locale.
   */
  listPublishedTitles: (options: {
    limit?: number;
    offset?: number;
    locale: string;
    filters?: PublishedTitlesFilters;
  }) => Promise<NewsTitleItem[]>;

  /**
   * Private
   * Create a new news item with translations and tags in one transaction.
   */
  create: (input: NewsItemCreateInput) => Promise<NewsItemRecord>;

  /**
   * Private
   * Update an existing news item's publishedAt, translations, and tags in one transaction.
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

function mapTranslations(
  translation: NewsTranslationSelect[],
): Partial<Record<Locale, NewsItemTranslation>> {
  return translation.reduce<Partial<Record<Locale, NewsItemTranslation>>>((acc, curr) => {
    acc[curr.lang as Locale] = {
      content: curr.content,
      title: curr.title,
      updatedAt: curr.updatedAt,
    };
    return acc;
  }, {});
}

async function syncTags(
  tx: Parameters<Parameters<DB["transaction"]>[0]>[0],
  itemId: string,
  tagIds: string[],
) {
  await tx.delete(newsItemTag).where(eq(newsItemTag.newsId, itemId));
  if (tagIds.length > 0) {
    await tx.insert(newsItemTag).values(tagIds.map((tagId) => ({ newsId: itemId, tagId })));
  }
}

export function createNewsItemRepository(database: DB): NewsItemRepository {
  return {
    async listPublishedTitles({ limit = 5, offset = 0, locale, filters = {} }) {
      const conditions = [eq(newsTranslation.lang, locale), lte(newsItem.publishedAt, new Date())];

      if (filters.publishedFrom) {
        conditions.push(gte(newsItem.publishedAt, filters.publishedFrom));
      }

      if (filters.publishedTo) {
        conditions.push(lte(newsItem.publishedAt, filters.publishedTo));
      }

      if (filters.titleOrContent) {
        const term = `%${filters.titleOrContent}%`;
        // Search across all locales, not just the current one
        conditions.push(
          exists(
            database
              .select({ _: newsTranslation.newsId })
              .from(newsTranslation)
              .where(
                and(
                  eq(newsTranslation.newsId, newsItem.id),
                  or(ilike(newsTranslation.title, term), ilike(newsTranslation.content, term)),
                ),
              ),
          ),
        );
      }

      if (filters.tagIds && filters.tagIds.length > 0) {
        conditions.push(
          exists(
            database
              .select({ _: newsItemTag.newsId })
              .from(newsItemTag)
              .where(
                and(
                  eq(newsItemTag.newsId, newsItem.id),
                  inArray(newsItemTag.tagId, filters.tagIds),
                ),
              ),
          ),
        );
      }

      const news = await database
        .select({
          id: newsItem.id,
          locale: newsTranslation.lang,
          title: newsTranslation.title,
          publishedAt: newsItem.publishedAt,
        })
        .from(newsTranslation)
        .innerJoin(newsItem, eq(newsTranslation.newsId, newsItem.id))
        .where(and(...conditions))
        .orderBy(desc(newsItem.publishedAt))
        .limit(limit)
        .offset(offset);

      return news.map((n) => ({
        ...n,
        locale: n.locale as Locale,
      }));
    },

    async list({ limit = 5, offset = 0, filters = {} }) {
      const news = await database.query.newsItem.findMany({
        with: {
          translations: true,

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
        where: (table, { and, or, exists, notExists }) => {
          const conditions = [];

          if (filters.titleOrContent) {
            const term = `%${filters.titleOrContent}%`;
            conditions.push(
              exists(
                database
                  .select({ _: newsTranslation.newsId })
                  .from(newsTranslation)
                  .where(
                    and(
                      eq(newsTranslation.newsId, table.id),
                      or(ilike(newsTranslation.title, term), ilike(newsTranslation.content, term)),
                    ),
                  ),
              ),
            );
          }

          if (filters.publishedFrom) {
            conditions.push(gte(table.publishedAt, filters.publishedFrom));
          }

          if (filters.publishedTo) {
            conditions.push(lte(table.publishedAt, filters.publishedTo));
          }

          if (filters.tagIds && filters.tagIds.length > 0) {
            conditions.push(
              exists(
                database
                  .select({ _: newsItemTag.newsId })
                  .from(newsItemTag)
                  .where(
                    and(
                      eq(newsItemTag.newsId, table.id),
                      inArray(newsItemTag.tagId, filters.tagIds),
                    ),
                  ),
              ),
            );
          }

          return conditions.length > 0 ? and(...conditions) : undefined;
        },
        limit,
        offset,
      });

      return news.map((item) => ({
        ...item,

        tags: mapTags(item.tags),
        translations: mapTranslations(item.translations),
      }));
    },

    async get({ id }) {
      const item = await database.query.newsItem.findFirst({
        where: (table, { eq }) => eq(table.id, id),
        with: {
          translations: true,

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
      });

      if (!item) return undefined;

      return {
        ...item,
        tags: mapTags(item.tags),

        translations: mapTranslations(item.translations),
      };
    },
    async create({ authorId, publishedAt, translations, tags = [] }) {
      return database.transaction(async (tx) => {
        const [created] = await tx.insert(newsItem).values({ authorId, publishedAt }).returning();

        const translationEntries = Object.entries(translations).filter(([, tr]) => !!tr);

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

        await syncTags(tx, created.id, tags);

        const result = await tx.query.newsItem.findFirst({
          where: eq(newsItem.id, created.id),
          with: {
            translations: true,

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

          tags: mapTags(result.tags),
          translations: result.translations.reduce<Partial<Record<Locale, NewsItemTranslation>>>(
            (acc, curr) => {
              acc[curr.lang as Locale] = {
                content: curr.content,
                title: curr.title,
                updatedAt: curr.updatedAt,
              };
              return acc;
            },
            {},
          ),
        };
      });
    },

    async update({ id, publishedAt, translations, tags = [] }) {
      await database.transaction(async (tx) => {
        await tx.update(newsItem).set({ publishedAt }).where(eq(newsItem.id, id));

        const translationEntries = Object.entries(translations).filter(([, tr]) => !!tr);

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

        await syncTags(tx, id, tags);
      });
    },

    async delete(id) {
      await database.delete(newsItem).where(eq(newsItem.id, id));
    },
  };
}

export const newsItemRepository = createNewsItemRepository(db);
