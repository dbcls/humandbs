import { and, desc, eq } from "drizzle-orm";

import { Locale } from "@/config/i18n-config";
import { db } from "@/db/database";
import {
  DOCUMENT_VERSION_STATUS,
  documentVersion,
  DocVersionStatus,
} from "@/db/schema";
import { buildConflictUpdateColumns } from "@/db/utils";

export interface DocPublishedVersionListItemResponse {
  title: string | null;
  versionNumber: number;
  contentId: string;
  locale: Locale;
  createdAt: Date;
}

export interface DocPublishedResponseRaw {
  contentId: string;
  versionNumber: number;
  locale: Locale;
  title: string | null;
  content: string | null;
}

export interface DocPublishedVersionResponseRaw {
  contentId: string;
  versionNumber: number;
  locale: Locale;
  title: string | null;
  content: string | null;
  updatedAt: Date;
}

export interface DocVersionListItemResponseRaw {
  title: string | null;
  versionNumber: number;
  contentId: string;
  locale: Locale;
  status: DocVersionStatus;
}

export interface DocVersionResponseRaw {
  versionNumber: number;
  contentId: string;
  locale: Locale;
  status: DocVersionStatus;
  content: string | null;
  title: string | null;
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
    lang: Locale
  ) => Promise<DocPublishedVersionListItemResponse[]>;

  /**
   * Public
   * Get latest published document version to given locale
   */
  getLatestPublishedForLocale: (
    contentId: string,
    locale: Locale
  ) => Promise<DocPublishedResponseRaw | undefined>;

  /**
   * Public
   * Get a published version of document, given locale
   */
  getPublishedForVersionNumberAndLocale: (
    contentId: string,
    versionNumber: number,
    locale: Locale
  ) => Promise<DocPublishedVersionResponseRaw | undefined>;
  /**
   * Private
   * Get list of all versions and langs for given `contentId`.
   * Use on CMS: list of versions
   * @param contentId id of the document (`about`, `home`, etc)
   */
  getVersionList: (
    contentId: string
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
    versionNumber: number
  ) => Promise<DocVersionResponseRaw[]>;

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
    }
  ) => Promise<unknown>;

  /**
   * Private
   * Publish draft
   * Use on CMS: publish button
   */
  publish: (
    contentId: string,
    versionNumber: number,
    lang: Locale
  ) => Promise<unknown>;

  /**
   * Private
   * Reset draft
   * Use on CMS: reset draft button
   */
  resetDraft: (
    contentId: string,
    versionNumber: number,
    lang: Locale
  ) => Promise<unknown>;

  /**
   * Private
   * Unpublish draft
   * Use on CMS: unpublish button
   */
  unpublish: (
    contentId: string,
    versionNumber: number,
    lang: Locale
  ) => Promise<unknown>;

  /** Private
   * Delete version
   * Use on CMS: delete version button on
   */
  delete: (contentId: string, versionNumber: number) => Promise<unknown>;
}

export function createDocumentVersionRepository(
  database: typeof db
): DocumentVersionRepo {
  return {
    getPublishedListForLocale: (contentId, lang) =>
      database.query.documentVersion.findMany({
        where: (table, { and, eq }) =>
          and(
            eq(table.contentId, contentId),
            eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED),
            eq(table.locale, lang)
          ),
        columns: {
          title: true,
          versionNumber: true,
          contentId: true,
          locale: true,
          createdAt: true,
        },
        orderBy: [desc(documentVersion.versionNumber)],
      }),
    getLatestPublishedForLocale: (contentId, locale) =>
      database.query.documentVersion.findFirst({
        where: (table, { and, eq }) =>
          and(
            eq(table.contentId, contentId),
            eq(table.locale, locale),
            eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED)
          ),
        orderBy: (t, { desc }) => desc(t.versionNumber),
        columns: {
          contentId: true,
          versionNumber: true,
          locale: true,
          title: true,
          content: true,
        },
      }),
    getVersionList: (contentId) =>
      database.query.documentVersion.findMany({
        where: (table, { eq }) => eq(table.contentId, contentId),
        columns: {
          title: true,
          versionNumber: true,
          contentId: true,
          locale: true,
          status: true,
        },
      }),
    getPublishedForVersionNumberAndLocale: (contentId, versionNumber, locale) =>
      database.query.documentVersion.findFirst({
        where: (t, { and, eq }) =>
          and(
            eq(t.contentId, contentId),
            eq(t.versionNumber, versionNumber),
            eq(t.locale, locale),
            eq(t.status, DOCUMENT_VERSION_STATUS.PUBLISHED)
          ),
        columns: {
          title: true,
          content: true,
          contentId: true,
          versionNumber: true,
          locale: true,
          status: true,
          updatedAt: true,
        },
      }),
    getVersion: (contentId, versionNumber) =>
      database.query.documentVersion.findMany({
        where: (table, { and, eq }) =>
          and(
            eq(table.contentId, contentId),
            eq(table.versionNumber, versionNumber)
          ),
        columns: {
          title: true,
          content: true,
          contentId: true,
          status: true,
          locale: true,
          versionNumber: true,
        },
      }),
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
              eq(table.status, DOCUMENT_VERSION_STATUS.DRAFT)
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
              eq(table.status, DOCUMENT_VERSION_STATUS.PUBLISHED)
            ),
        });
        if (!published) {
          throw new Error("Published version not found");
        }

        return tx
          .update(documentVersion)
          .set(published)
          .where(
            and(
              eq(documentVersion.contentId, contentId),
              eq(documentVersion.versionNumber, versionNumber),
              eq(documentVersion.locale, locale),
              eq(documentVersion.status, DOCUMENT_VERSION_STATUS.DRAFT)
            )
          );
      }),
    unpublish: (contentId, versionNumber, locale) =>
      database
        .delete(documentVersion)
        .where(
          and(
            eq(documentVersion.contentId, contentId),
            eq(documentVersion.versionNumber, versionNumber),
            eq(documentVersion.locale, locale),
            eq(documentVersion.status, DOCUMENT_VERSION_STATUS.PUBLISHED)
          )
        ),
    delete: (contentId, versionNumber) =>
      database
        .delete(documentVersion)
        .where(
          and(
            eq(documentVersion.contentId, contentId),
            eq(documentVersion.versionNumber, versionNumber)
          )
        ),
  };
}
