import { and, desc, eq, sql } from "drizzle-orm";

import { i18n, type Locale } from "@/config/i18n";
import { db } from "@/db/database";
import {
  DOCUMENT_VERSION_STATUS,
  documentVersion,
  type DocVersionStatus,
} from "@/db/schema";
import { buildConflictUpdateColumns } from "@/db/utils";

interface BaseDoc {
  contentId: string;
  versionNumber: number;
  title: string | null;
  locale: Locale;
}

export interface DocPublishedVersionListItemResponse extends BaseDoc {
  createdAt: Date;
}

export interface DocVersionListItemResponseRaw extends BaseDoc {
  status: DocVersionStatus;
}

export interface DocPublishedVersionResponseRaw extends BaseDoc {
  content: string | null;
  hideTOC: boolean;
  updatedAt: Date;
}

export interface DocAnyVersionResponseRaw extends BaseDoc {
  content: string | null;
  hideTOC: boolean;
  status: DocVersionStatus;
}

interface DocumentVersionRepo {
  /**
   * Public
   * Get list of published versions for given `contentId` and `lang`.
   * Use on page with list of published versions
   * @param contentId id of the document (`about`, `home`, etc)
   * @param lang Locale to fetch (`en`, `ja`)
   */
  getPublishedListForLocale: (
    contentId: string,
    lang: Locale,
  ) => Promise<DocPublishedVersionListItemResponse[]>;

  /**
   * Public
   * Get latest published document version to given locale
   */
  getLatestPublishedForLocale: (
    contentId: string,
    locale: Locale,
  ) => Promise<DocPublishedVersionResponseRaw | undefined>;

  /**
   * Public
   * Get a published version of document, given locale
   */
  getPublishedForVersionNumberAndLocale: (
    contentId: string,
    versionNumber: number,
    locale: Locale,
  ) => Promise<DocPublishedVersionResponseRaw | undefined>;
  /**
   * Private
   * Get list of all versions and langs for given `contentId`.
   * Use on CMS: list of versions
   * @param contentId id of the document (`about`, `home`, etc)
   */
  getVersionList: (
    contentId: string,
  ) => Promise<DocVersionListItemResponseRaw[]>;

  /**
   * Private
   * Get document version details.
   * Use on CMS: details card, with lang and status tabs
   * @param contentId
   * @param versionNumber
   * @returns
   */
  getVersion: (
    contentId: string,
    versionNumber: number,
  ) => Promise<DocAnyVersionResponseRaw[]>;

  /**
   * Private
   * Save version draft
   * Use on CMS: autosave
   */
  saveDraft: (
    contentId: string,
    versionNumber: number,
    lang: Locale,
    data: {
      title?: string;
      content?: string;
    },
  ) => Promise<unknown>;

  /**
   * Private
   * Publish draft
   * Use on CMS: publish button
   */
  publish: (
    contentId: string,
    versionNumber: number,
    lang: Locale,
  ) => Promise<unknown>;

  /**
   * Private
   * Reset draft
   * Use on CMS: reset draft button
   */
  resetDraft: (
    contentId: string,
    versionNumber: number,
    lang: Locale,
  ) => Promise<unknown>;

  /**
   * Private
   * Unpublish draft
   * Use on CMS: unpublish button
   */
  unpublish: (
    contentId: string,
    versionNumber: number,
    lang: Locale,
  ) => Promise<unknown>;

  /** Private
   * Delete version
   * Use on CMS: delete version button on
   */
  delete: (contentId: string, versionNumber: number) => Promise<unknown>;

  /**
   * Private
   * Create new version from latest published version
   * Copies all published locale content as drafts
   * Use on CMS: create new version button
   */
  createVersionFromPublished: (
    contentId: string,
    translatedBy?: string,
  ) => Promise<{ versionNumber: number }>;
}

const contentIdPlaceholder = sql.placeholder("contentId");
const versionNumberPlaceholder = sql.placeholder("versionNumber");
const langPlaceholder = sql.placeholder("lang");

export function createDocumentVersionRepository(
  database: typeof db,
): DocumentVersionRepo {
  const publishedListForLocaleQuery = database.query.documentVersion
    .findMany({
      where: (table, { and, eq }) =>
        and(
          eq(table.contentId, contentIdPlaceholder),
          eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
          eq(table.locale, langPlaceholder),
        ),
      columns: {
        title: true,
        versionNumber: true,
        contentId: true,
        locale: true,
        createdAt: true,
      },
      orderBy: [desc(documentVersion.versionNumber)],
    })
    .prepare("publishedListForLocale");

  const latestPublishedForLocaleQuery = database.query.documentVersion
    .findFirst({
      where: (table, { and, eq }) =>
        and(
          eq(table.contentId, contentIdPlaceholder),
          eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
          eq(table.locale, langPlaceholder),
        ),
      with: {
        document: {
          columns: {
            hideTOC: true,
          },
        },
      },
      columns: {
        title: true,
        content: true,
        contentId: true,
        versionNumber: true,
        locale: true,
        updatedAt: true,
      },
      orderBy: [desc(documentVersion.versionNumber)],
    })
    .prepare("latestPublishedForLocale");

  const versionListQuery = database.query.documentVersion
    .findMany({
      where: (table, { eq }) => eq(table.contentId, contentIdPlaceholder),
      columns: {
        title: true,
        versionNumber: true,
        contentId: true,
        locale: true,
        status: true,
      },
    })
    .prepare("versionList");

  const publishedForVersionNumberAndLocaleQuery = database.query.documentVersion
    .findFirst({
      where: (table, { and, eq }) =>
        and(
          eq(table.contentId, contentIdPlaceholder),
          eq(table.versionNumber, versionNumberPlaceholder),
          eq(table.locale, langPlaceholder),
          eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
        ),
      with: {
        document: {
          columns: {
            hideTOC: true,
          },
        },
      },
      columns: {
        title: true,
        content: true,
        contentId: true,
        versionNumber: true,
        locale: true,
        status: true,
        updatedAt: true,
      },
    })
    .prepare("publishedForVersionNumberAndLocale");

  const getVersionQuery = database.query.documentVersion
    .findMany({
      where: (table, { and, eq }) =>
        and(
          eq(table.contentId, contentIdPlaceholder),
          eq(table.versionNumber, versionNumberPlaceholder),
        ),
      with: {
        document: {
          columns: {
            hideTOC: true,
          },
        },
      },
      columns: {
        title: true,
        content: true,
        contentId: true,
        status: true,
        locale: true,
        versionNumber: true,
      },
    })
    .prepare("getVersion");

  return {
    getPublishedListForLocale: (contentId, lang) =>
      publishedListForLocaleQuery.execute({ contentId, lang }),
    getLatestPublishedForLocale: async (contentId, lang) => {
      const row = await latestPublishedForLocaleQuery.execute({
        contentId,
        lang,
      });

      if (!row) return undefined;
      return { ...row, hideTOC: row.document.hideTOC ?? false };
    },

    getVersionList: (contentId) => versionListQuery.execute({ contentId }),

    getPublishedForVersionNumberAndLocale: async (
      contentId,
      versionNumber,
      lang,
    ) => {
      const row = await publishedForVersionNumberAndLocaleQuery.execute({
        contentId,
        versionNumber,
        lang,
      });

      if (!row) return undefined;

      return { ...row, hideTOC: row.document.hideTOC ?? false };
    },

    getVersion: async (contentId, versionNumber) => {
      const rows = await getVersionQuery.execute({
        contentId,
        versionNumber,
      });

      return rows.map((row) => ({
        ...row,
        hideTOC: row.document.hideTOC ?? false,
      }));
    },

    saveDraft: (contentId, versionNumber, lang, data) =>
      database
        .insert(documentVersion)
        .values({
          contentId,
          versionNumber,
          status: DOCUMENT_VERSION_STATUS.DRAFT,
          locale: lang,
          ...data,
        })
        .onConflictDoUpdate({
          target: [
            documentVersion.contentId,
            documentVersion.versionNumber,
            documentVersion.locale,
            documentVersion.status,
          ],
          set: buildConflictUpdateColumns(documentVersion, [
            "content",
            "title",
          ]),
        }),

    publish: (contentId, versionNumber, locale) =>
      database.transaction(async (tx) => {
        const draft = await tx.query.documentVersion.findFirst({
          where: (table, { and, eq }) =>
            and(
              eq(table.contentId, contentId),
              eq(table.versionNumber, versionNumber),
              eq(table.locale, locale),
              eq(table.status, DOCUMENT_VERSION_STATUS.DRAFT),
            ),
        });
        if (!draft) {
          throw new Error("Draft not found");
        }

        return tx
          .insert(documentVersion)
          .values({
            ...draft,
            status: DOCUMENT_VERSION_STATUS.PUBLISHED,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              documentVersion.contentId,
              documentVersion.versionNumber,
              documentVersion.locale,
              documentVersion.status,
            ],
            set: {
              title: draft.title,
              content: draft.content,
              updatedAt: new Date(),
            },
          });
      }),
    resetDraft: (contentId, versionNumber, locale) =>
      database.transaction(async (tx) => {
        const published = await tx.query.documentVersion.findFirst({
          where: (table, { and, eq }) =>
            and(
              eq(table.contentId, contentId),
              eq(table.versionNumber, versionNumber),
              eq(table.locale, locale),
              eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
            ),
        });
        if (!published) {
          throw new Error("Published version not found");
        }

        return tx
          .update(documentVersion)
          .set({
            title: published.title,
            content: published.content,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(documentVersion.contentId, contentId),
              eq(documentVersion.versionNumber, versionNumber),
              eq(documentVersion.locale, locale),
              eq(documentVersion.status, DOCUMENT_VERSION_STATUS.DRAFT),
            ),
          );
      }),
    unpublish: (contentId, versionNumber, locale) =>
      database.transaction(async (tx) => {
        const published = await tx.query.documentVersion.findFirst({
          where: (table, { and, eq }) =>
            and(
              eq(table.contentId, contentId),
              eq(table.versionNumber, versionNumber),
              eq(table.locale, locale),
              eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
            ),
        });
        if (!published) {
          throw new Error("Published version not found");
        }

        // If no draft exists, copy published content into draft
        await tx
          .insert(documentVersion)
          .values({
            ...published,
            status: DOCUMENT_VERSION_STATUS.DRAFT,
            updatedAt: new Date(),
          })
          .onConflictDoNothing();

        return tx
          .delete(documentVersion)
          .where(
            and(
              eq(documentVersion.contentId, contentId),
              eq(documentVersion.versionNumber, versionNumber),
              eq(documentVersion.locale, locale),
              eq(documentVersion.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
            ),
          );
      }),
    delete: (contentId, versionNumber) =>
      database
        .delete(documentVersion)
        .where(
          and(
            eq(documentVersion.contentId, contentId),
            eq(documentVersion.versionNumber, versionNumber),
          ),
        ),
    createVersionFromPublished: (contentId, translatedBy) =>
      database.transaction(async (tx) => {
        // 1. Find latest version number (to determine new version number)
        const latestVersion = await tx.query.documentVersion.findFirst({
          where: (table) => eq(table.contentId, contentId),
          orderBy: (table, { desc }) => [desc(table.versionNumber)],
          columns: { versionNumber: true },
        });

        const newVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

        // 2. Get all published versions (across all version numbers)
        const allPublishedVersions = await tx.query.documentVersion.findMany({
          where: (table, { and, eq }) =>
            and(
              eq(table.contentId, contentId),
              eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
            ),
          columns: {
            locale: true,
            title: true,
            content: true,
            versionNumber: true,
          },
          orderBy: (table, { desc }) => [desc(table.versionNumber)],
        });

        // 3. For each locale, find the latest published version
        const latestPublishedByLocale = new Map<
          string,
          { locale: Locale; title: string | null; content: string | null }
        >();
        for (const pv of allPublishedVersions) {
          // Since results are ordered by versionNumber desc, first occurrence per locale is the latest
          if (!latestPublishedByLocale.has(pv.locale)) {
            latestPublishedByLocale.set(pv.locale, {
              locale: pv.locale,
              title: pv.title,
              content: pv.content,
            });
          }
        }

        // 4. Create new draft versions
        const publishedVersions = Array.from(latestPublishedByLocale.values());
        if (publishedVersions.length > 0) {
          // Copy content from latest published version for each locale
          await tx.insert(documentVersion).values(
            publishedVersions.map((pv) => ({
              contentId,
              versionNumber: newVersionNumber,
              status: DOCUMENT_VERSION_STATUS.DRAFT,
              locale: pv.locale,
              title: pv.title,
              content: pv.content,
              translatedBy,
            })),
          );
        } else {
          // First version - create empty draft for default locale
          await tx.insert(documentVersion).values({
            contentId,
            versionNumber: newVersionNumber,
            status: DOCUMENT_VERSION_STATUS.DRAFT,
            locale: i18n.defaultLocale as Locale,
            title: null,
            content: null,
            translatedBy,
          });
        }

        return { versionNumber: newVersionNumber };
      }),
  };
}
