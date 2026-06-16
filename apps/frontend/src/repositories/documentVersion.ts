import { notFound } from "@tanstack/router-core";
import { and, desc, eq, exists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Locale } from "@/config/i18n";
import { i18n } from "@/config/i18n";
import type { DB } from "@/db/database";
import type { DocVersionStatus } from "@/db/schema";
import { DOCUMENT_VERSION_STATUS, documentVersion } from "@/db/schema";
import { buildConflictUpdateColumns } from "@/db/utils";
import type { DocVersionResponse } from "@/serverFunctions/documentVersion";

import type { DocumentListItemTranslation, RawDocumentsListItem } from "./document";
import { groupDocumentVersions, sortTranslations } from "./document";

interface BaseDoc {
  contentId: string;
  versionNumber: number;
  title: string | null;
  locale: Locale;
}

export interface DocPublishedVersionListItemResponse extends BaseDoc {
  createdAt: Date;
}

export interface DocumentVersionsResponse {
  contentId: string;
  versionNumber: number;
  translations: DocumentListItemTranslation[];
}

export interface DocPublishedVersionResponseRaw extends BaseDoc {
  content: string | null;
  hideTOC: boolean;
  hideRevisions: boolean;
  updatedAt: Date;
}

export interface DocAnyVersionResponseRaw extends BaseDoc {
  content: string | null;
  hideTOC: boolean;
  hideRevisions: boolean;
  hideFromNav: boolean;
  status: DocVersionStatus;
  createdAt: Date;
  updatedAt: Date;
  author: { name: string | null; email: string } | null;
}

interface DocumentVersionRepo {
  getPublishedListForLocale: (
    contentId: string,
    lang: Locale,
  ) => Promise<DocPublishedVersionListItemResponse[]>;

  getLatestPublishedForLocale: (
    contentId: string,
    locale: Locale,
  ) => Promise<DocPublishedVersionResponseRaw | undefined>;

  getPublishedForVersionNumberAndLocale: (
    contentId: string,
    versionNumber: number,
    locale: Locale,
  ) => Promise<DocPublishedVersionResponseRaw | undefined>;

  getVersionList: (contentId: string) => Promise<DocumentVersionsResponse[]>;

  getVersion: (contentId: string, versionNumber: number) => Promise<DocVersionResponse>;

  saveDraft: (
    contentId: string,
    versionNumber: number,
    lang: Locale,
    data: { title?: string; content?: string },
    userId?: string,
  ) => Promise<{
    createdAt: Date;
    updatedAt: Date;
    author: { name: string | null; email: string } | null;
  }>;

  publish: (contentId: string, versionNumber: number, lang: Locale) => Promise<unknown>;

  resetDraft: (contentId: string, versionNumber: number, lang: Locale) => Promise<unknown>;

  unpublish: (contentId: string, versionNumber: number, lang: Locale) => Promise<unknown>;

  /**
   * Deletes a document version. Does not automatically renumbers. Not used currently.
   */
  delete: (contentId: string, versionNumber: number) => Promise<unknown>;

  /**
   * Creates a new version. Copies content of lase published version and creates new version with incremented versionNumber
   */
  createVersionFromPublished: (
    contentId: string,
    authorId?: string,
  ) => Promise<{ versionNumber: number }>;
}

async function resolveDocumentId(database: DB, contentId: string): Promise<string> {
  const doc = await database.query.document.findFirst({
    where: (table, { eq }) => eq(table.contentId, contentId),
    columns: { id: true },
  });
  if (!doc) throw notFound();
  return doc.id;
}

async function resolveExistingUserId(
  database: DB,
  userId: string | undefined,
): Promise<string | undefined> {
  if (!userId) return undefined;

  const existingUser = await database.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, userId),
    columns: { id: true },
  });

  return existingUser?.id;
}

export function createDocumentVersionRepository(database: DB): DocumentVersionRepo {
  return {
    getPublishedListForLocale: async (contentId, lang) => {
      const documentId = await resolveDocumentId(database, contentId);
      const rows = await database.query.documentVersion.findMany({
        where: (table, { and, eq }) =>
          and(
            eq(table.documentId, documentId),
            eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
            eq(table.locale, lang),
          ),
        columns: {
          title: true,
          versionNumber: true,
          documentId: true,
          locale: true,
          createdAt: true,
        },
        orderBy: [desc(documentVersion.versionNumber)],
      });
      return rows.map((r) => ({ ...r, contentId }));
    },

    getLatestPublishedForLocale: async (contentId, locale) => {
      const documentId = await resolveDocumentId(database, contentId);
      const row = await database.query.documentVersion.findFirst({
        where: (table, { and, eq }) =>
          and(
            eq(table.documentId, documentId),
            eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
            eq(table.locale, locale),
          ),
        with: { document: { columns: { hideTOC: true, hideRevisions: true } } },
        columns: {
          title: true,
          content: true,
          documentId: true,
          versionNumber: true,
          locale: true,
          updatedAt: true,
        },
        orderBy: [desc(documentVersion.versionNumber)],
      });
      if (!row) return undefined;
      return {
        ...row,
        contentId,
        hideTOC: row.document.hideTOC ?? true,
        hideRevisions: row.document.hideRevisions ?? true,
      };
    },

    getPublishedForVersionNumberAndLocale: async (contentId, versionNumber, locale) => {
      const documentId = await resolveDocumentId(database, contentId);
      const row = await database.query.documentVersion.findFirst({
        where: (table, { and, eq }) =>
          and(
            eq(table.documentId, documentId),
            eq(table.versionNumber, versionNumber),
            eq(table.locale, locale),
            eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
          ),
        with: { document: { columns: { hideTOC: true, hideRevisions: true } } },
        columns: {
          title: true,
          content: true,
          documentId: true,
          versionNumber: true,
          locale: true,
          status: true,
          updatedAt: true,
        },
      });
      if (!row) return undefined;
      return {
        ...row,
        contentId,
        hideTOC: row.document.hideTOC ?? true,
        hideRevisions: row.document.hideRevisions ?? true,
      };
    },

    getVersionList: async (contentId) => {
      const documentId = await resolveDocumentId(database, contentId);
      const draft = alias(documentVersion, "draft");

      const rows = await database
        .select({
          documentId: documentVersion.documentId,
          versionNumber: documentVersion.versionNumber,
          lang: documentVersion.locale,
          status: documentVersion.status,
          title: documentVersion.title,
          hasUnpublishedChanges: sql<boolean>`${and(
            eq(documentVersion.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
            exists(
              database
                .select({ _: sql`1` })
                .from(draft)
                .where(
                  and(
                    eq(draft.documentId, documentVersion.documentId),
                    eq(draft.versionNumber, documentVersion.versionNumber),
                    eq(draft.locale, documentVersion.locale),
                    eq(draft.status, DOCUMENT_VERSION_STATUS.DRAFT),
                    or(
                      sql`${draft.title} IS DISTINCT FROM ${documentVersion.title}`,
                      sql`${draft.content} IS DISTINCT FROM ${documentVersion.content}`,
                    ),
                  ),
                ),
            ),
          )}`.as("hasUnpublishedChanges"),
        })
        .from(documentVersion)
        .where(eq(documentVersion.documentId, documentId))
        .orderBy(desc(documentVersion.versionNumber));

      const rawRows: RawDocumentsListItem[] = rows.map((row) => ({
        id: `${row.documentId}:${row.versionNumber}`,
        contentId,
        latestVersionNumber: row.versionNumber,
        lang: row.lang,
        status: row.status,
        title: row.title,
        hasUnpublishedChanges: row.hasUnpublishedChanges,
      }));

      return sortTranslations(groupDocumentVersions(rawRows)).map((version) => {
        if (version.latestVersionNumber === null) {
          throw new Error("Document version list row is missing a version number");
        }

        return {
          contentId: version.contentId,
          versionNumber: version.latestVersionNumber,
          translations: version.translations,
        };
      });
    },

    getVersion: async (contentId, versionNumber) => {
      const documentId = await resolveDocumentId(database, contentId);
      const rows = await database.query.documentVersion.findMany({
        where: (table, { and, eq }) =>
          and(eq(table.documentId, documentId), eq(table.versionNumber, versionNumber)),
        with: {
          document: { columns: { hideTOC: true, hideRevisions: true, hideFromNav: true } },
          author: { columns: { name: true, email: true } },
        },
        columns: {
          title: true,
          content: true,
          documentId: true,
          status: true,
          locale: true,
          versionNumber: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const flatened = rows.map((r) => ({
        ...r,
        contentId,
        hideTOC: r.document.hideTOC ?? true,
        hideRevisions: r.document.hideRevisions ?? true,
        hideFromNav: r.document.hideFromNav ?? true,
        author: r.author
          ? { ...r.author, name: r.author.name ?? "Unknown", email: r.author.email ?? "" }
          : { name: "Unknown", email: "" },
      }));

      const grouped = groupDocVersion(flatened);

      return grouped;
    },

    saveDraft: async (contentId, versionNumber, lang, data, userId) => {
      const documentId = await resolveDocumentId(database, contentId);
      const existingUserId = await resolveExistingUserId(database, userId);
      const conflictUpdateColumns = existingUserId
        ? (["content", "title", "updatedAt", "updatedBy"] as const)
        : (["content", "title", "updatedAt"] as const);
      const [result] = await database
        .insert(documentVersion)
        .values({
          documentId,
          versionNumber,
          status: DOCUMENT_VERSION_STATUS.DRAFT,
          locale: lang,
          ...(existingUserId ? { updatedBy: existingUserId } : {}),
          ...data,
        })
        .onConflictDoUpdate({
          target: [
            documentVersion.documentId,
            documentVersion.versionNumber,
            documentVersion.locale,
            documentVersion.status,
          ],
          set: buildConflictUpdateColumns(documentVersion, [...conflictUpdateColumns]),
        })
        .returning({
          createdAt: documentVersion.createdAt,
          updatedAt: documentVersion.updatedAt,
          updatedBy: documentVersion.updatedBy,
        });

      let author: { name: string | null; email: string } | null = null;
      if (result.updatedBy) {
        const authorRow = await database.query.user.findFirst({
          where: (table, { eq }) => eq(table.id, result.updatedBy!),
          columns: { name: true, email: true },
        });
        if (authorRow?.email) {
          author = { name: authorRow.name ?? null, email: authorRow.email };
        }
      }

      return { createdAt: result.createdAt, updatedAt: result.updatedAt, author };
    },

    publish: (contentId, versionNumber, locale) =>
      database.transaction(async (tx) => {
        const documentId = await resolveDocumentId(tx as unknown as DB, contentId);
        const draft = await tx.query.documentVersion.findFirst({
          where: (table, { and, eq }) =>
            and(
              eq(table.documentId, documentId),
              eq(table.versionNumber, versionNumber),
              eq(table.locale, locale),
              eq(table.status, DOCUMENT_VERSION_STATUS.DRAFT),
            ),
        });
        if (!draft) throw new Error("Draft not found");

        const now = new Date();
        return tx
          .insert(documentVersion)
          .values({
            ...draft,
            status: DOCUMENT_VERSION_STATUS.PUBLISHED,
            updatedAt: now,
            publishedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              documentVersion.documentId,
              documentVersion.versionNumber,
              documentVersion.locale,
              documentVersion.status,
            ],
            set: {
              title: draft.title,
              content: draft.content,
              updatedAt: now,
              publishedAt: now,
            },
          });
      }),

    resetDraft: (contentId, versionNumber, locale) =>
      database.transaction(async (tx) => {
        const documentId = await resolveDocumentId(tx as unknown as DB, contentId);
        const published = await tx.query.documentVersion.findFirst({
          where: (table, { and, eq }) =>
            and(
              eq(table.documentId, documentId),
              eq(table.versionNumber, versionNumber),
              eq(table.locale, locale),
              eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
            ),
        });
        if (!published) throw new Error("Published version not found");

        return tx
          .update(documentVersion)
          .set({
            title: published.title,
            content: published.content,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(documentVersion.documentId, documentId),
              eq(documentVersion.versionNumber, versionNumber),
              eq(documentVersion.locale, locale),
              eq(documentVersion.status, DOCUMENT_VERSION_STATUS.DRAFT),
            ),
          );
      }),

    unpublish: (contentId, versionNumber, locale) =>
      database.transaction(async (tx) => {
        const documentId = await resolveDocumentId(tx as unknown as DB, contentId);
        const published = await tx.query.documentVersion.findFirst({
          where: (table, { and, eq }) =>
            and(
              eq(table.documentId, documentId),
              eq(table.versionNumber, versionNumber),
              eq(table.locale, locale),
              eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
            ),
        });
        if (!published) throw new Error("Published version not found");

        await tx
          .insert(documentVersion)
          .values({
            ...published,
            status: DOCUMENT_VERSION_STATUS.DRAFT,
            updatedAt: new Date(),
            publishedAt: published.publishedAt,
          })
          .onConflictDoNothing();

        return tx
          .delete(documentVersion)
          .where(
            and(
              eq(documentVersion.documentId, documentId),
              eq(documentVersion.versionNumber, versionNumber),
              eq(documentVersion.locale, locale),
              eq(documentVersion.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
            ),
          );
      }),

    delete: async (contentId, versionNumber) => {
      const documentId = await resolveDocumentId(database, contentId);

      return database
        .delete(documentVersion)
        .where(
          and(
            eq(documentVersion.documentId, documentId),
            eq(documentVersion.versionNumber, versionNumber),
          ),
        );
    },

    createVersionFromPublished: (contentId, authorId) =>
      database.transaction(async (tx) => {
        const documentId = await resolveDocumentId(tx as unknown as DB, contentId);

        const latestVersion = await tx.query.documentVersion.findFirst({
          where: (table) => eq(table.documentId, documentId),
          orderBy: (table, { desc }) => [desc(table.versionNumber)],
          columns: { versionNumber: true },
        });

        const newVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

        const allPublishedVersions = await tx.query.documentVersion.findMany({
          where: (table, { and, eq }) =>
            and(
              eq(table.documentId, documentId),
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

        const latestPublishedByLocale = new Map<
          string,
          { locale: Locale; title: string | null; content: string | null }
        >();
        for (const pv of allPublishedVersions) {
          if (!latestPublishedByLocale.has(pv.locale)) {
            latestPublishedByLocale.set(pv.locale, {
              locale: pv.locale,
              title: pv.title,
              content: pv.content,
            });
          }
        }

        const publishedVersions = Array.from(latestPublishedByLocale.values());
        if (publishedVersions.length > 0) {
          await tx.insert(documentVersion).values(
            publishedVersions.map((pv) => ({
              documentId,
              versionNumber: newVersionNumber,
              status: DOCUMENT_VERSION_STATUS.DRAFT,
              locale: pv.locale,
              title: pv.title,
              content: pv.content,
              authorId,
            })),
          );
        } else {
          await tx.insert(documentVersion).values({
            documentId,
            versionNumber: newVersionNumber,
            status: DOCUMENT_VERSION_STATUS.DRAFT,
            locale: i18n.defaultLocale as Locale,
            title: null,
            content: null,
            authorId,
          });
        }

        return { versionNumber: newVersionNumber };
      }),
  };
}

/**
 *
 * @param rawVersion raw version return
 * @returns grouped result
 */
export function groupDocVersion(rawVersion: DocAnyVersionResponseRaw[]): DocVersionResponse {
  if (rawVersion.length === 0) {
    return {
      contentId: "",
      versionNumber: 0,
      translations: {},
    };
  }

  const result: DocVersionResponse = {
    contentId: rawVersion[0].contentId,
    versionNumber: rawVersion[0].versionNumber,
    translations: {},
  };

  for (const verStatusLang of rawVersion) {
    let translation = result.translations[verStatusLang.locale];
    if (!translation) {
      translation = {
        createdAt: verStatusLang.createdAt,
        updatedAt: verStatusLang.updatedAt,
        author: verStatusLang.author,
        [verStatusLang.status]: {
          title: verStatusLang.title ?? "",
          content: verStatusLang.content ?? "",
        },
      };
    } else {
      translation[verStatusLang.status] = {
        title: verStatusLang.title ?? "",
        content: verStatusLang.content ?? "",
      };
      // keep the most recent updatedAt across statuses for this locale
      if (verStatusLang.updatedAt > translation.updatedAt) {
        translation.updatedAt = verStatusLang.updatedAt;
      }
    }

    // copy published content in draft
    if (!translation.draft) {
      translation.draft = {
        content: translation.published?.content ?? "",
        title: translation.published?.title ?? "",
      };
    }

    result.translations[verStatusLang.locale] = translation;
  }
  return result;
}
