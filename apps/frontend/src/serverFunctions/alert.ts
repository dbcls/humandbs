import { alert, newsItem, newsTranslation } from "@/db/schema";
import { createAlertSchema, updateAlertSchema } from "@/db/types";
import { db } from "@/db/database";
import { localeSchema } from "@/config/i18n-config";
import { toDateString } from "@/lib/utils";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { Locale } from "use-intl";
import { z } from "zod";

/** Alerts list for CMS */
interface AlertListItemResponse {
  newsId: string;
  from: string | null;
  to: string | null;
  translations: {
    title: string;
    lang: Locale;
  }[];
}

/** Get alerts list for CMS */
export const $getAllAlerts = createServerFn({ method: "GET" })
  .inputValidator(z.object({ limit: z.number().optional() }).optional())
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("alerts", "list");

    const alerts = await db.query.alert.findMany({
      with: {
        newsItem: {
          columns: {},
          with: {
            translations: {
              columns: {
                title: true,
                lang: true,
              },
            },
          },
        },
      },
      orderBy: [desc(alert.from)],
      limit: data?.limit || 100,
    });

    const response: AlertListItemResponse[] = alerts.map((alert) => ({
      newsId: alert.newsId,
      from: alert.from,
      to: alert.to,
      translations: alert.newsItem.translations.map((translation) => ({
        title: translation.title,
        lang: translation.lang as Locale,
      })),
    }));

    return response;
  });

// Query options
export const getAllAlertsQueryOptions = (params?: { limit?: number }) =>
  queryOptions({
    queryKey: ["alerts", params],
    queryFn: () => $getAllAlerts({ data: params }),
  });

export const $createAlert = createServerFn({ method: "POST" })
  .inputValidator(createAlertSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("alerts", "create");

    const created = await db.insert(alert).values(data).returning();

    return created[0];
  });

export const $updateAlert = createServerFn({ method: "POST" })
  .inputValidator(updateAlertSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("alerts", "update");

    const [updatedAlert] = await db
      .update(alert)
      .set(data)
      .where(eq(alert.newsId, data.newsId))
      .returning();

    return updatedAlert;
  });

export const $deleteAlert = createServerFn({ method: "POST" })
  .inputValidator(z.object({ newsId: z.string() }))
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("alerts", "delete");

    const [deletedAlert] = await db
      .delete(alert)
      .where(eq(alert.newsId, data.newsId))
      .returning();

    return deletedAlert;
  });

/** Active alerts list for clients */
export interface ActiveAlertsItemResponse {
  newsId: string;
  title: string;
}

/** Get list of active alerts for the client, based on locale */
export const $getActiveAlerts = createServerFn({ method: "GET" })
  .inputValidator(z.object({ locale: localeSchema }))
  .handler(async ({ data }) => {
    const now = new Date();
    const nowStr = toDateString(now);
    const alerts = await db
      .select({
        newsId: alert.newsId,
        title: newsTranslation.title,
      })
      .from(alert)
      .innerJoin(newsItem, eq(alert.newsId, newsItem.id))
      .innerJoin(
        newsTranslation,
        and(
          eq(newsTranslation.newsId, newsItem.id),
          eq(newsTranslation.lang, data.locale)
        )
      )
      .where(
        and(
          or(isNull(alert.from), lte(alert.from, nowStr)),
          or(isNull(alert.to), gte(alert.to, nowStr))
        )
      );

    const response: ActiveAlertsItemResponse[] = alerts.map((alert) => ({
      newsId: alert.newsId,
      title: alert.title,
    }));

    return response;
  });

export function getActiveAlertsQueryOptions({ locale }: { locale: Locale }) {
  return queryOptions({
    queryKey: ["activeAlerts", locale],
    queryFn: () => $getActiveAlerts({ data: { locale } }),
    enabled: !!locale,
    staleTime: 1000 * 60 * 60 * 24,
  });
}

/** Cookie key to store hidden alert ids (newsIds) */
const hiddenAlerts = "hiddenAlerts";

//* server function to set hidden alert ids (newsIds) */
export const $saveHiddenAlertIds = createServerFn({ method: "POST" })
  .inputValidator(z.object({ newsId: z.string(), locale: localeSchema }))
  .handler(async ({ data }) => {
    // secretly reset the cookie to empty array if there are no active alerts
    const activeAlerts = await $getActiveAlerts({
      data: { locale: data.locale },
    });

    const existingAlertIdsCookie = getCookie(hiddenAlerts);

    let existingIds: string[] = [];

    if (activeAlerts.length > 0 && existingAlertIdsCookie) {
      existingIds = JSON.parse(existingAlertIdsCookie);
    }

    const newIds = new Set(existingIds);
    newIds.add(data.newsId);

    setCookie(hiddenAlerts, JSON.stringify([...newIds]), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  });

export const $getHiddenAlertIds = createServerFn({ method: "GET" }).handler(
  () => {
    const alertIdsCookie = getCookie(hiddenAlerts);
    const alertIds = alertIdsCookie ? JSON.parse(alertIdsCookie) : [];
    return alertIds as string[];
  }
);
