import { localeSchema, type Locale } from "@/config/i18n";
import { db } from "@/db/database";
import { alert, alertTranslation } from "@/db/schema";
import { and, eq, gte, isNull, like, lte, or } from "drizzle-orm";
import z from "zod";

interface AlertFilter {
  content?: string;
  from?: string;
  to?: string;
}

interface Pagination {
  limit?: number;
  offset?: number;
}

const paginationSchema = z.object({
  limit: z.number().optional(),
  offset: z.number().optional(),
});

const alertFilterSchema = z.object({
  content: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const listOptionsSchema = paginationSchema.extend(alertFilterSchema.shape);

export type ListOptions = z.infer<typeof listOptionsSchema>;

interface AlertItem {
  alertId: string;
  lang: string;
  content: string;
  from?: string;
  to?: string;
}

export const createAlertSchema = z.object({
  tranlations: z.array(
    z.object({
      lang: localeSchema,
      content: z.string(),
    }),
  ),
  from: z.string().optional(),
  to: z.string().optional(),
  enabled: z.boolean().optional(),
  authorId: z.string(),
});

export type CreateAlertPayload = z.infer<typeof createAlertSchema>;

export type AlertWithTranslations = CreateAlertPayload;

export const updateAlertSchema = z.object({
  id: z.string(),
  tranlations: z.array(
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
  listActive: (options: { lang: Locale }) => Promise<AlertItem[]>;

  /**
   * Private - get alerts according to filters
   */
  list: (options: ListOptions) => Promise<AlertItem[]>;

  /**
   * Private - create alert
   */
  create: (
    data: CreateAlertPayload,
    authorId: string,
  ) => Promise<AlertWithTranslations>;

  /**
   * Private - delete alert
   */
  delete: (id: string) => Promise<void>;

  /**
   * Private - update alert
   */
  update: (data: UpdateAlertPayload) => Promise<AlertWithTranslations>;
}

export function createAlertsRepository(database: typeof db): AlertsRepository {
  return {
    listActive: async ({ lang }) => {
      const now = new Date().toISOString().slice(0, 10);
      const alertTranslations = await database
        .select({
          alertId: alertTranslation.alertId,
          lang: alertTranslation.locale,
          content: alertTranslation.content,
          from: alert.from,
          to: alert.to,
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

      const clean = alertTranslations.map((t) => ({
        ...t,
        from: t.from ?? undefined,
        to: t.to ?? undefined,
      }));

      return clean;
    },

    list: async (options) => {
      const conditions = [];

      if (options.content !== undefined) {
        conditions.push(like(alertTranslation.content, `%${options.content}%`));
      }

      let query = database
        .select({
          alertId: alertTranslation.alertId,
          lang: alertTranslation.locale,
          content: alertTranslation.content,
          from: alert.from,
          to: alert.to,
        })
        .from(alertTranslation)
        .innerJoin(alert, eq(alertTranslation.alertId, alert.id))
        .where(and(...conditions))
        .$dynamic();

      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.offset(options.offset);
      }

      const alertTranslations = await query;

      const clean = alertTranslations.map((t) => ({
        ...t,
        from: t.from ?? undefined,
        to: t.to ?? undefined,
      }));

      return clean;
    },

    create: async (data, authorId) => {
      return await database.transaction(async (tx) => {
        const [newAlert] = await tx
          .insert(alert)
          .values({
            enabled: data.enabled ?? true,
            from: data.from ?? null,
            to: data.to ?? null,
            authorId: data.authorId,
          })
          .returning();

        const translationsToInsert = data.tranlations.map((t) => ({
          alertId: newAlert.id,
          content: t.content,
          locale: t.lang,
        }));

        const translations = await tx
          .insert(alertTranslation)
          .values(translationsToInsert)
          .returning();

        return {
          tranlations: translations.map((t) => ({
            lang: t.locale,
            content: t.content,
          })),
          from: newAlert.from ?? undefined,
          to: newAlert.to ?? undefined,
          enabled: newAlert.enabled ?? true,
          id: newAlert.id,
          authorId: authorId,
        };
      });
    },

    delete: async (id) => {
      await database.delete(alert).where(eq(alert.id, id));
    },

    update: async (updateData) => {
      return await database.transaction(async (tx) => {
        await tx
          .update(alert)
          .set({
            from: updateData.from ?? null,
            to: updateData.to ?? null,
            enabled: updateData.enabled,
          })
          .where(eq(alert.id, updateData.id));

        for (const trn of updateData.tranlations) {
          await tx
            .update(alertTranslation)
            .set({ content: trn.content })
            .where(
              and(
                eq(alertTranslation.alertId, updateData.id),
                eq(alertTranslation.locale, trn.lang),
              ),
            );
        }

        const [updatedAlert] = await tx
          .select()
          .from(alert)
          .where(eq(alert.id, updateData.id));

        const translations = await tx
          .select()
          .from(alertTranslation)
          .where(eq(alertTranslation.alertId, updateData.id));

        return {
          tranlations: translations.map((t) => ({
            lang: t.locale,
            content: t.content,
          })),
          from: updatedAlert.from ?? undefined,
          to: updatedAlert.to ?? undefined,
          enabled: updatedAlert.enabled ?? true,
          id: updatedAlert.id,
          authorId: updatedAlert.authorId,
        };
      });
    },
  };
}

export const alertsRepository = createAlertsRepository(db);
