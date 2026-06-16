import { and, eq, exists, ilike, inArray, max, or, sql } from "drizzle-orm";
import type { Locale } from "use-intl";

import { i18n } from "@/config/i18n";
import type { DB } from "@/db/database";
import type { DOCUMENT_VERSION_STATUS, Document } from "@/db/schema";
import { document, documentVersion } from "@/db/schema";
import { filterDefined } from "@/utils/filter-defined";

/**
 * List item of the documents list.
 *
 */
export interface DocumentsListItemResponse {
  id: string;
  contentId: string;
  /** Latest version number, even if there are only drafts in that version */
  latestVersionNumber: number | null;

  /** Latest version's translations, max N-element array, where N=number of locales supported
   * If both published and draft present, shows published title. If draft content is different, hasUnpublishedChanges=true.
   * If only published present - show published title, hasUnpublishedChanges=false
   * If only draft  present - show draft title
   * Sorted so that i18n.defaultLocale comes first
   */
  translations: DocumentListItemTranslation[];
}

export type DocumentListItemTranslation =
  | {
      status: typeof DOCUMENT_VERSION_STATUS.DRAFT;
      lang: Locale;
      title: string | undefined;
    }
  | {
      status: typeof DOCUMENT_VERSION_STATUS.PUBLISHED;
      lang: Locale;
      title: string | undefined;
      hasUnpublishedChanges: boolean;
    };

/** Need to prevent creating new version if no published yet */
/**
 * Show latest version's published title, or draft title. In case of draft, show it in grey color and italic
 */

interface DocumentRepo {
  /**
   * Get document list based on query string. Default sort: child segments come after parent:
   *  `e`, `a`, `a/b`, `a/c/d`, `f` ...
   */
  getList: (q: string | undefined) => Promise<DocumentsListItemResponse[]>;

  /**
   * Get document by contentId
   */
  getByContentId: (contentId: string) => Promise<Document | undefined>;

  /**
   * Create new document with path (contentId). Draft versions are automatically appended
   */
  create: (id: string, userId: string) => Promise<DocumentsListItemResponse>;

  /**
   * Update document settings like hideTOC, etc
   */
  updateSettings: (
    contentId: string,
    settings: { hideTOC?: boolean; hideFromNav?: boolean; hideRevisions?: boolean },
  ) => Promise<void>;

  /**
   * Change contentId
   */
  changeContentId: (oldContentId: string, newContentId: string) => Promise<void>;

  /**
   * Delete document
   */
  delete: (contentId: string) => Promise<Document>;
}

export function createDocumentRepository(db: DB): DocumentRepo {
  const p = sql.placeholder("q");

  const likePattern = sql`'%' || ${p} || '%'`;

  const matched = db.$with("matched").as(
    db
      .select({ id: document.id })
      .from(document)
      .where(
        or(
          sql`${p}::text IS NULL`,
          or(
            ilike(document.contentId, likePattern),
            exists(
              db
                .select({ _: documentVersion.documentId })
                .from(documentVersion)
                .where(
                  and(
                    eq(documentVersion.documentId, document.id),
                    or(
                      ilike(documentVersion.title, likePattern),
                      ilike(documentVersion.content, likePattern),
                    ),
                  ),
                ),
            ),
          ),
        ),
      ),
  );

  const latest = db.$with("latest").as(
    db
      .select({
        id: documentVersion.documentId,
        max: max(documentVersion.versionNumber).as("latestVersionNumber"),
      })
      .from(documentVersion)
      .where(inArray(documentVersion.documentId, db.select({ id: matched.id }).from(matched)))
      .groupBy(documentVersion.documentId),
  );

  /**
   * Premared search statement
   */
  const searchStatement = db
    .with(matched, latest)
    .select({
      id: document.id,
      contentId: document.contentId,
      latestVersionNumber: latest.max,
      lang: documentVersion.locale,
      status: documentVersion.status,
      title: documentVersion.title,
      hasUnpublishedChanges: sql<boolean>`
      ${documentVersion.status} = 'published'
      AND EXISTS (
        SELECT 1 FROM ${documentVersion} draft
        WHERE draft.document_id = ${documentVersion.documentId}
          AND draft.version_number = ${latest.max}
          AND draft.locale = ${documentVersion.locale}
          AND draft.status = 'draft'
          AND (draft.name IS DISTINCT FROM ${documentVersion.title}
            OR draft.content IS DISTINCT FROM ${documentVersion.content})
      )
      `.as("hasUnpublishedChanges"),
    })
    .from(matched)
    .innerJoin(document, eq(document.id, matched.id))
    .leftJoin(latest, eq(latest.id, document.id))
    .leftJoin(
      documentVersion,
      and(
        eq(documentVersion.documentId, document.id),
        eq(documentVersion.versionNumber, latest.max),
      ),
    )
    .orderBy(document.contentId)
    .prepare("search_docs");

  return {
    create: async (newContentId, userId) => {
      return await db.transaction(async (tx) => {
        const [newDoc] = await tx.insert(document).values({ contentId: newContentId }).returning();

        const [newVersion] = await tx
          .insert(documentVersion)
          .values({
            documentId: newDoc.id,
            status: "draft",
            locale: i18n.defaultLocale,
            authorId: userId,
            versionNumber: 1,
          })
          .returning();

        return {
          id: newDoc.id,
          contentId: newContentId,
          latestVersionNumber: newVersion.versionNumber,
          translations: [
            {
              status: "draft",
              lang: newVersion.locale,
              title: newVersion.title ?? undefined,
              hasUnpublishedChanges: false,
            },
          ],
        };
      });
    },

    getList: async (q) => {
      const rawResult = await searchStatement.execute({ q: q?.trim() ?? null });

      return sortDocumentsByPath(sortTranslations(groupDocumentVersions(rawResult)));
    },
    getByContentId: async (contentId) => {
      const doc = await db.query.document.findFirst({
        where: (table, { eq }) => eq(table.contentId, contentId),
      });

      return doc;
    },

    updateSettings: async (contentId, settings) => {
      const definedSettings = filterDefined(settings);

      await db.update(document).set(definedSettings).where(eq(document.contentId, contentId));
    },

    changeContentId: async (oldContentId, newContentId) => {
      await db
        .update(document)
        .set({ contentId: newContentId })
        .where(eq(document.contentId, oldContentId));
    },

    delete: async (contentId) => {
      const [deleted] = await db
        .delete(document)
        .where(eq(document.contentId, contentId))
        .returning();

      return deleted;
    },
  };
}

export interface RawDocumentsListItem {
  id: string;
  contentId: string;
  latestVersionNumber: number | null;
  lang: "ja" | "en" | null;
  status: "draft" | "published" | null;
  title: string | null;
  hasUnpublishedChanges: boolean;
}

export function groupDocumentVersions(
  rawDocuments: RawDocumentsListItem[],
): DocumentsListItemResponse[] {
  const byId = rawDocuments.reduce(
    (acc, curr) => {
      if (acc[curr.id]) {
        const translation = mapTranslation(curr);

        const existingTranslation = acc[curr.id].translations.find((t) => t.lang === curr.lang);

        // If both draft and published exist, leave only the published row and preserve
        // the SQL-computed diff result from whichever row order the database returns.
        if (existingTranslation) {
          const hasUnpublishedChanges =
            translation.status === "published"
              ? translation.hasUnpublishedChanges
              : "hasUnpublishedChanges" in existingTranslation
                ? existingTranslation.hasUnpublishedChanges
                : true;

          acc[curr.id].translations = acc[curr.id].translations
            .filter((t) => t.lang !== translation.lang)
            .concat({
              lang: translation.lang,
              title:
                translation.status === "published" ? translation.title : existingTranslation.title,
              status: "published",
              hasUnpublishedChanges,
            });
        } else {
          acc[curr.id].translations.push(mapTranslation(curr));
        }
      } else {
        acc[curr.id] = {
          id: curr.id,
          contentId: curr.contentId,
          latestVersionNumber: curr.latestVersionNumber,
          translations: [mapTranslation(curr)],
        };
      }
      return acc;
    },
    {} as Record<string, DocumentsListItemResponse>,
  );

  return Object.values(byId);
}

/**
 * Sorts tramnslartions in each document `translations` arraym so i18n.defaultLocale comes first
 */
export function sortTranslations(
  documents: DocumentsListItemResponse[],
): DocumentsListItemResponse[] {
  return documents.map((doc) => ({
    ...doc,
    translations: doc.translations.sort((a, b) => {
      if (a.lang === i18n.defaultLocale) return -1;
      if (b.lang === i18n.defaultLocale) return 1;
      return 0;
    }),
  }));
}

export function mapTranslation(row: RawDocumentsListItem): DocumentListItemTranslation {
  if (row.status === "draft") {
    return {
      status: row.status,
      lang: row.lang as Locale,
      title: row.title ?? undefined,
    };
  } else {
    return {
      status: row.status!,
      lang: row.lang as Locale,
      title: row.title ?? undefined,
      hasUnpublishedChanges: row.hasUnpublishedChanges,
    };
  }
}

export function sortDocumentsByPath(documents: DocumentsListItemResponse[]) {
  return [...documents].sort(compareDocumentPaths);
}

function compareDocumentPaths(a: DocumentsListItemResponse, b: DocumentsListItemResponse) {
  const aSegments = a.contentId.split("/");
  const bSegments = b.contentId.split("/");

  for (let i = 0; i < Math.min(aSegments.length, bSegments.length); i++) {
    const result = aSegments[i]!.localeCompare(bSegments[i]!);
    if (result !== 0) return result;
  }

  return aSegments.length - bSegments.length;
}
