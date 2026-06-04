import { and, desc, eq } from "drizzle-orm";

import type { Locale } from "@/config/i18n";
import { i18n } from "@/config/i18n";
import type { db } from "@/db/database";
import type { DocVersionStatus } from "@/db/schema";
import { DOCUMENT_VERSION_STATUS, documentVersion } from "@/db/schema";
import { buildConflictUpdateColumns } from "@/db/utils";
import { notFound } from "@tanstack/router-core";

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
  hideRevisions: boolean;
  updatedAt: Date;
}

export interface DocAnyVersionResponseRaw extends BaseDoc {
  content: string | null;
  hideTOC: boolean;
  hideRevisions: boolean;
  status: DocVersionStatus;
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

  getVersionList: (contentId: string) => Promise<DocVersionListItemResponseRaw[]>;

  getVersion: (contentId: string, versionNumber: number) => Promise<DocAnyVersionResponseRaw[]>;

  saveDraft: (
    contentId: string,
    versionNumber: number,
    lang: Locale,
    data: { title?: string; content?: string },
  ) => Promise<unknown>;

  publish: (contentId: string, versionNumber: number, lang: Locale) => Promise<unknown>;

  resetDraft: (contentId: string, versionNumber: number, lang: Locale) => Promise<unknown>;

  unpublish: (contentId: string, versionNumber: number, lang: Locale) => Promise<unknown>;

  delete: (contentId: string, versionNumber: number) => Promise<unknown>;

  createVersionFromPublished: (
    contentId: string,
    translatedBy?: string,
  ) => Promise<{ versionNumber: number }>;
}

async function resolveDocumentId(database: typeof db, contentId: string): Promise<string> {
  const doc = await database.query.document.findFirst({
    where: (table, { eq }) => eq(table.contentId, contentId),
    columns: { id: true },
  });
  if (!doc) throw notFound()
  return doc.id;
}

export function createDocumentVersionRepository(database: typeof db): DocumentVersionRepo {
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
      const rows = await database.query.documentVersion.findMany({
        where: (table, { eq }) => eq(table.documentId, documentId),
        columns: {
          title: true,
          versionNumber: true,
          documentId: true,
          locale: true,
          status: true,
        },
      });
      return rows.map((r) => ({ ...r, contentId }));
    },

    getVersion: async (contentId, versionNumber) => {
      const documentId = await resolveDocumentId(database, contentId);
      const rows = await database.query.documentVersion.findMany({
        where: (table, { and, eq }) =>
          and(eq(table.documentId, documentId), eq(table.versionNumber, versionNumber)),
        with: { document: { columns: { hideTOC: true, hideRevisions: true } } },
        columns: {
          title: true,
          content: true,
          documentId: true,
          status: true,
          locale: true,
          versionNumber: true,
        },
      });
      return rows.map((r) => ({
        ...r,
        contentId,
        hideTOC: r.document.hideTOC ?? true,
        hideRevisions: r.document.hideRevisions ?? true,
      }));
    },

    saveDraft: async (contentId, versionNumber, lang, data) => {
      const documentId = await resolveDocumentId(database, contentId);
      return database
        .insert(documentVersion)
        .values({
          documentId,
          versionNumber,
          status: DOCUMENT_VERSION_STATUS.DRAFT,
          locale: lang,
          ...data,
        })
        .onConflictDoUpdate({
          target: [
            documentVersion.documentId,
            documentVersion.versionNumber,
            documentVersion.locale,
            documentVersion.status,
          ],
          set: buildConflictUpdateColumns(documentVersion, ["content", "title"]),
        });
    },

    publish: (contentId, versionNumber, locale) =>
      database.transaction(async (tx) => {
        const documentId = await resolveDocumentId(tx as unknown as typeof db, contentId);
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

        return tx
          .insert(documentVersion)
          .values({
            ...draft,
            status: DOCUMENT_VERSION_STATUS.PUBLISHED,
            updatedAt: new Date(),
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
              updatedAt: new Date(),
            },
          });
      }),

    resetDraft: (contentId, versionNumber, locale) =>
      database.transaction(async (tx) => {
        const documentId = await resolveDocumentId(tx as unknown as typeof db, contentId);
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
        const documentId = await resolveDocumentId(tx as unknown as typeof db, contentId);
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

    createVersionFromPublished: (contentId, translatedBy) =>
      database.transaction(async (tx) => {
        const documentId = await resolveDocumentId(tx as unknown as typeof db, contentId);

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
              translatedBy,
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
            translatedBy,
          });
        }

        return { versionNumber: newVersionNumber };
      }),
  };
}
