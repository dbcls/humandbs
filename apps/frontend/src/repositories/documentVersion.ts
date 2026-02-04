import { desc } from "drizzle-orm";

import { Locale } from "@/config/i18n-config";
import { db } from "@/db/database";
import {
  DOCUMENT_VERSION_STATUS,
  documentVersion,
  DocVersionStatus,
} from "@/db/schema";

export interface DocPublishedVersionListItemResponse {
  title: string | null;
  versionNumber: number;
  contentId: string;
  locale: Locale;
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
  getPublishedVersionListForLocale: (
    contentId: string,
    lang: Locale
  ) => Promise<DocPublishedVersionListItemResponse[]>;
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
   * Get docuemnt version details.
   * Use on CMS: details card, with lang and status tabs
   * @param contentId
   * @param versionNumber
   * @returns
   */
  getVersion: (
    contentId: string,
    versionNumber: number
  ) => Promise<DocVersionResponseRaw[]>;
}

export function createDocumentVersionRepository(
  database: typeof db
): DocumentVersionRepo {
  return {
    getPublishedVersionListForLocale: (contentId, lang) =>
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
        },
        orderBy: [desc(documentVersion.versionNumber)],
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
  };
}
