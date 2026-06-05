import { and, eq, exists, like, or } from "drizzle-orm";

import type { Locale } from "@/config/i18n";
import { i18n } from "@/config/i18n";
import type { DB } from "@/db/database";
import type { DocVersionStatus } from "@/db/schema";
import { contentItem, contentTranslation, DOCUMENT_VERSION_STATUS } from "@/db/schema";
import type {
  ContentItem,
  ContentTranslationSelect,
  DocumentVersionStatus,
  User,
} from "@/db/types";
import { buildConflictUpdateColumns } from "@/db/utils";
import type { ContentTranslationResponse } from "@/serverFunctions/contentItem";

export interface ContentItemsListItemRaw {
  id: string;
  translations: {
    lang: Locale;
    statuses: Partial<Record<DocVersionStatus, string>>;
  }[];
}

export interface ContentItemRaw {
  author?: Pick<User, "name" | "email">;
  hideTOC: boolean;
  translations: Partial<
    Record<Locale, Partial<Record<DocumentVersionStatus, ContentTranslationResponse>>>
  >;
}

export interface ContentItemSearchQuery {
  q?: string;
}

export interface ContentItemTranslation {
  content: string;
  title: string;
  lang: string;
  hideTOC: boolean | null;
}

export interface CreatedContentItem {
  id: string;
  createdAt: Date;
  authorId: string;
  publishedAt: string | null;
  hideTOC: boolean | null;
}

export type PublishContentItemResponse = ContentTranslationSelect & {
  status: typeof DOCUMENT_VERSION_STATUS.PUBLISHED;
};

interface ContentItemRepo {
  /**
   * Private
   * Gets ContentItems from CMS
   */
  getItems: (data: ContentItemSearchQuery) => Promise<ContentItemsListItemRaw[]>;

  /**
   * Public
   * Get ContentItem by contentId
   */
  getItem: (id: string) => Promise<ContentItemRaw | null>;

  /**
   * Private
   * Update contentItem's hideTOC setting
   */
  updateItemHideTOC: (id: string, hideTOC: boolean) => Promise<void>;

  /**
   * Private & Public (use server functions to check permission)
   * Get content item's translation by id, lang and status. If no statis provided return only "published"
   */
  getItemTranslation: (
    id: string,
    lang: Locale,
    status?: DocumentVersionStatus,
  ) => Promise<ContentItemTranslation | null>;

  isExists: (id: string) => Promise<boolean>;

  create: (newId: string, authorId: string) => Promise<ContentItem>;
  delete: (id: string) => Promise<void>;

  saveTranslationDraft: (
    id: string,
    lang: Locale,
    data: { title: string; content: string },
  ) => Promise<ContentTranslationSelect>;

  publishTranslationDraft: (id: string, lang: Locale) => Promise<PublishContentItemResponse>;

  unpublishTranslation: (id: string, lang: Locale) => Promise<void>;
  resetDraft: (id: string, lang: Locale) => Promise<ContentTranslationSelect>;
}

export const createContentRepo = (db: DB): ContentItemRepo => ({
  getItems: async (data) => {
    const contentItems = await db.query.contentItem.findMany({
      where: data.q
        ? (table) =>
            or(
              like(table.id, `%${data.q}%`),
              exists(
                db
                  .select({ _: contentTranslation.contentId })
                  .from(contentTranslation)
                  .where(
                    and(
                      eq(contentTranslation.contentId, table.id),
                      or(
                        like(contentTranslation.title, `%${data.q}%`),
                        like(contentTranslation.content, `%${data.q}%`),
                      ),
                    ),
                  ),
              ),
            )
        : undefined,
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

    return contentItems.map((item) => {
      const translations = item.translations.reduce<
        {
          lang: Locale;
          statuses: Partial<Record<DocVersionStatus, string>>;
        }[]
      >((acc, curr) => {
        const existingLang = acc.find((l) => l.lang === curr.lang);

        if (existingLang) {
          existingLang.statuses[curr.status] = curr.title;
          acc.sort((a, b) => a.lang.localeCompare(b.lang));
        } else {
          acc.push({
            lang: curr.lang as Locale,
            statuses: { [curr.status]: curr.title },
          });
        }

        return acc;
      }, []);

      return {
        id: item.id,
        translations,
      };
    });
  },
  getItem: async (contentId) => {
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
        hideTOC: true,
        id: true,
        createdAt: false,
        publishedAt: false,
      },
    });

    const translations =
      content?.translations.reduce(
        (acc, curr) => {
          const { title, content, updatedAt, status } = curr;
          const locale = curr.lang as Locale;
          if (!acc[locale]) acc[locale] = {};

          acc[locale][status] = {
            title,
            content,
            updatedAt,
            status,
          };
          return acc;
        },
        {} as ContentItemRaw["translations"],
      ) || ({} as ContentItemRaw["translations"]);

    const presentLocales = Object.keys(translations) as Locale[];

    // copy published content into draft if no draft present
    for (const locale of presentLocales) {
      if (!translations[locale]?.draft && translations[locale]?.published) {
        translations[locale].draft = { ...translations[locale].published };
      }
    }

    return {
      author: content?.author,
      hideTOC: content?.hideTOC ?? true,
      translations,
    };
  },
  updateItemHideTOC: async (id, hideTOC) => {
    await db.update(contentItem).set({ hideTOC }).where(eq(contentItem.id, id));
  },
  getItemTranslation: async (id, lang, status) => {
    const translation = await db.query.contentTranslation.findFirst({
      where: (table, { and, eq }) =>
        and(
          eq(table.contentId, id),
          eq(table.lang, lang),
          eq(table.status, status ?? DOCUMENT_VERSION_STATUS.PUBLISHED),
        ),
      with: {
        contentItem: {
          columns: {
            hideTOC: true,
          },
        },
      },
      columns: {
        title: true,
        content: true,
        lang: true,
      },
    });

    if (!translation) {
      return null;
    }

    const { contentItem, ...rest } = translation;

    return { ...rest, hideTOC: translation.contentItem.hideTOC };
  },
  isExists: async (id) => {
    const content = await db.query.contentItem.findFirst({
      where: (table, { eq }) => eq(table.id, id),
      columns: {
        id: true,
      },
    });

    return !!content;
  },
  create: async (id, authorId) => {
    const newContentItem = await db.transaction(async (tx) => {
      const newContentItem = await tx
        .insert(contentItem)
        .values({
          id,
          authorId,
        })
        .returning();

      // add empty contents
      for (const locale of i18n.locales) {
        await tx.insert(contentTranslation).values({
          contentId: newContentItem[0].id,
          lang: locale,
          status: DOCUMENT_VERSION_STATUS.DRAFT,
          title: "",
          content: "",
        });
      }

      return newContentItem;
    });

    return newContentItem[0];
  },
  delete: async (id) => {
    await db.delete(contentItem).where(eq(contentItem.id, id)).returning();
  },
  saveTranslationDraft: async (id, lang, data) => {
    const result = await db
      .insert(contentTranslation)
      .values({
        lang,
        contentId: id,
        status: DOCUMENT_VERSION_STATUS.DRAFT,
        content: data.content,
        title: data.title,
      })
      .onConflictDoUpdate({
        target: [contentTranslation.contentId, contentTranslation.lang, contentTranslation.status],
        set: buildConflictUpdateColumns(contentTranslation, ["content", "title"]),
      })
      .returning();
    return result[0];
  },
  publishTranslationDraft: async (id, lang) => {
    const draftTranslation = await db.query.contentTranslation.findFirst({
      where: (table, { and, eq }) =>
        and(
          eq(table.contentId, id),
          eq(table.lang, lang),
          eq(table.status, DOCUMENT_VERSION_STATUS.DRAFT),
        ),
    });

    if (!draftTranslation) {
      throw new Error("Draft translation not found");
    }

    // Create or update the published version while keeping the draft
    const [result] = await db
      .insert(contentTranslation)
      .values({
        contentId: id,
        lang,
        status: DOCUMENT_VERSION_STATUS.PUBLISHED,
        title: draftTranslation.title,
        content: draftTranslation.content,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [contentTranslation.contentId, contentTranslation.lang, contentTranslation.status],
        set: buildConflictUpdateColumns(contentTranslation, ["title", "content", "updatedAt"]),
      })
      .returning();

    return result as PublishContentItemResponse;
  },
  unpublishTranslation: async (id, lang) => {
    await db
      .delete(contentTranslation)
      .where(
        and(
          eq(contentTranslation.contentId, id),
          eq(contentTranslation.lang, lang),
          eq(contentTranslation.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
        ),
      );
  },
  resetDraft: async (id, lang) => {
    const publishedTranslation = await db.query.contentTranslation.findFirst({
      where: (table, { eq, and }) =>
        and(
          eq(table.contentId, id),
          eq(table.lang, lang),
          eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
        ),
    });

    if (!publishedTranslation) {
      throw new Error("No published translation found");
    }

    const [result] = await db
      .update(contentTranslation)
      .set({
        content: publishedTranslation.content,
        title: publishedTranslation.title,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contentTranslation.contentId, id),
          eq(contentTranslation.lang, lang),
          eq(contentTranslation.status, DOCUMENT_VERSION_STATUS.DRAFT),
        ),
      )
      .returning();

    return result;
  },
});
