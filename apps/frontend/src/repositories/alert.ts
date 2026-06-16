import { and, eq, exists, gte, ilike, isNull, lte, or } from "drizzle-orm";
import z from "zod";

import type { Locale } from "@/config/i18n";
import { localeSchema } from "@/config/i18n";
import type { DB } from "@/db/database";
import { db } from "@/db/database";
import { alert, alertTranslation, user } from "@/db/schema";

export interface AlertTranslationInput {
  lang: Locale;
  content: string;
}

export interface AlertRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  enabled: boolean;
  authorId: string;
  author: {
    name: string | null;
  };
  updatedById: string;
  updatedBy: {
    name: string | null;
  };
  from: string | null;
  to: string | null;
  translations: Partial<Record<Locale, { content: string }>>;
}

export interface ActiveAlertItem {
  id: string;
  content: string;
}

export interface AlertFilters {
  q?: string;
  activeFrom?: string;
  activeTo?: string;
}

export const createAlertSchema = z.object({
  translations: z.array(
    z.object({
      lang: localeSchema,
      content: z.string(),
    }),
  ),
  from: z.string().optional(),
  to: z.string().optional(),
  enabled: z.boolean().optional(),
});

export type CreateAlertPayload = z.infer<typeof createAlertSchema>;

export const updateAlertSchema = z.object({
  id: z.string(),
  translations: z.array(
    z.object({
      lang: localeSchema,
      content: z.string(),
    }),
  ),
  from: z.string().optional(),
  to: z.string().optional(),
  enabled: z.boolean().optional(),
});

export type UpdateAlertPayload = z.infer<typeof updateAlertSchema>;

export interface AlertsRepository {
  /**
   * Public - get all active alerts for locale
   */
  listActive: (options: { lang: Locale }) => Promise<ActiveAlertItem[]>;

  /**
   * Private - get all alerts for CMS
   */
  list: (options?: {
    limit?: number;
    offset?: number;
    filters?: AlertFilters;
  }) => Promise<AlertRecord[]>;

  /**
   * Private - create alert
   */
  create: (data: CreateAlertPayload, authorId: string) => Promise<AlertRecord>;

  /**
   * Private - delete alert
   */
  delete: (id: string) => Promise<void>;

  /**
   * Private - update alert
   */
  update: (data: UpdateAlertPayload, updatedById: string) => Promise<AlertRecord>;
}

function mapAlertRows(
  rows: Array<{
    id: string;
    createdAt: Date;
    updatedAt: Date;
    enabled: boolean | null;
    authorId: string;
    authorName: string | null;
    updatedById: string;
    updatedByName: string | null;
    from: string | null;
    to: string | null;
    locale: Locale;
    content: string;
  }>,
): AlertRecord[] {
  const grouped = new Map<string, AlertRecord>();

  for (const row of rows) {
    let current = grouped.get(row.id);

    if (!current) {
      current = {
        id: row.id,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        enabled: row.enabled ?? true,
        authorId: row.authorId,
        author: {
          name: row.authorName,
        },
        updatedById: row.updatedById,
        updatedBy: {
          name: row.updatedByName,
        },
        from: row.from,
        to: row.to,
        translations: {},
      };
      grouped.set(row.id, current);
    }

    current.translations[row.locale] = {
      content: row.content,
    };
  }

  return [...grouped.values()];
}

export function createAlertsRepository(database: DB): AlertsRepository {
  return {
    listActive: async ({ lang }) => {
      const now = new Date().toISOString().slice(0, 10);
      const alertTranslations = await database
        .select({
          id: alert.id,
          content: alertTranslation.content,
        })
        .from(alertTranslation)
        .innerJoin(alert, eq(alertTranslation.alertId, alert.id))
        .where(
          and(
            eq(alertTranslation.locale, lang),
            eq(alert.enabled, true),
            or(isNull(alert.from), lte(alert.from, now)),
            or(isNull(alert.to), gte(alert.to, now)),
          ),
        );

      return alertTranslations;
    },

    list: async ({ limit = 20, offset = 0, filters = {} } = {}) => {
      const items = await database.query.alert.findMany({
        with: {
          trnanslations: true,
          author: {
            columns: { name: true },
          },
          updatedByUser: {
            columns: { name: true },
          },
        },
        orderBy: (table, { desc }) => [desc(table.createdAt)],
        where: (table, { and }) => {
          const conditions = [];

          if (filters.q) {
            const term = `%${filters.q}%`;
            conditions.push(
              exists(
                database
                  .select({ _: alertTranslation.alertId })
                  .from(alertTranslation)
                  .where(
                    and(
                      eq(alertTranslation.alertId, table.id),
                      ilike(alertTranslation.content, term),
                    ),
                  ),
              ),
            );
          }

          if (filters.activeFrom) {
            conditions.push(or(isNull(table.to), gte(table.to, filters.activeFrom)));
          }

          if (filters.activeTo) {
            conditions.push(or(isNull(table.from), lte(table.from, filters.activeTo)));
          }

          return conditions.length > 0 ? and(...conditions) : undefined;
        },
        limit,
        offset,
      });

      return items.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        enabled: item.enabled ?? true,
        authorId: item.authorId,
        author: {
          name: item.author?.name ?? null,
        },
        updatedById: item.updatedBy,
        updatedBy: {
          name: item.updatedByUser?.name ?? null,
        },
        from: item.from,
        to: item.to,
        translations: item.trnanslations.reduce<Partial<Record<Locale, { content: string }>>>(
          (acc, translation) => {
            acc[translation.locale] = {
              content: translation.content,
            };
            return acc;
          },
          {},
        ),
      }));
    },

    create: async (data, authorId) => {
      return await database.transaction(async (tx) => {
        const [newAlert] = await tx
          .insert(alert)
          .values({
            enabled: data.enabled ?? true,
            from: data.from ?? null,
            to: data.to ?? null,
            authorId,
            updatedBy: authorId,
          })
          .returning();

        const translationsToInsert = data.translations.map((t) => ({
          alertId: newAlert.id,
          content: t.content,
          locale: t.lang,
        }));

        const translations = await tx
          .insert(alertTranslation)
          .values(translationsToInsert)
          .returning();

        const createdAuthor = await tx.query.user.findFirst({
          where: eq(user.id, newAlert.authorId),
          columns: { name: true },
        });

        return mapAlertRows(
          translations.map((translation) => ({
            id: newAlert.id,
            createdAt: newAlert.createdAt,
            updatedAt: newAlert.updatedAt,
            enabled: newAlert.enabled,
            authorId: newAlert.authorId,
            authorName: createdAuthor?.name ?? null,
            updatedById: newAlert.updatedBy,
            updatedByName: createdAuthor?.name ?? null,
            from: newAlert.from,
            to: newAlert.to,
            locale: translation.locale,
            content: translation.content,
          })),
        )[0]!;
      });
    },

    delete: async (id) => {
      await database.delete(alert).where(eq(alert.id, id));
    },

    update: async (updateData, updatedById) => {
      return await database.transaction(async (tx) => {
        await tx
          .update(alert)
          .set({
            from: updateData.from ?? null,
            to: updateData.to ?? null,
            enabled: updateData.enabled,
            updatedAt: new Date(),
            updatedBy: updatedById,
          })
          .where(eq(alert.id, updateData.id));

        await tx.delete(alertTranslation).where(eq(alertTranslation.alertId, updateData.id));

        if (updateData.translations.length > 0) {
          await tx.insert(alertTranslation).values(
            updateData.translations.map((translation) => ({
              alertId: updateData.id,
              locale: translation.lang,
              content: translation.content,
            })),
          );
        }

        const [updatedAlert] = await tx.select().from(alert).where(eq(alert.id, updateData.id));

        const translations = await tx
          .select()
          .from(alertTranslation)
          .where(eq(alertTranslation.alertId, updateData.id));

        const updatedAuthor = await tx.query.user.findFirst({
          where: eq(user.id, updatedAlert.authorId),
          columns: { name: true },
        });
        const updatedByUser = await tx.query.user.findFirst({
          where: eq(user.id, updatedAlert.updatedBy),
          columns: { name: true },
        });

        return mapAlertRows(
          translations.map((translation) => ({
            id: updatedAlert.id,
            createdAt: updatedAlert.createdAt,
            updatedAt: updatedAlert.updatedAt,
            enabled: updatedAlert.enabled,
            authorId: updatedAlert.authorId,
            authorName: updatedAuthor?.name ?? null,
            updatedById: updatedAlert.updatedBy,
            updatedByName: updatedByUser?.name ?? null,
            from: updatedAlert.from,
            to: updatedAlert.to,
            locale: translation.locale,
            content: translation.content,
          })),
        )[0]!;
      });
    },
  };
}

export const alertsRepository = createAlertsRepository(db);
