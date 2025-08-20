import { alert, Alert, alertTranslation, AlertTranslation } from "@/db/schema";
import { db } from "@/lib/database";
import { localeSchema } from "@/lib/i18n-config";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { desc, eq } from "drizzle-orm";
import { Locale } from "use-intl";
import { z } from "zod";

// Types
export type GetAlertsResponse = (Alert & {
  translations: AlertTranslation[];
})[];

export type GetActiveAlertsResponse = AlertTranslation[];

export type AlertWithTranslations = Alert & {
  translations: AlertTranslation[];
};

// Query options
export const getAlertsQueryOptions = (params?: { limit?: number }) =>
  queryOptions({
    queryKey: ["alerts", params],
    queryFn: () => $getAlerts({ data: params }),
  });

export const getActiveAlertsQueryOptions = ({ locale }: { locale: Locale }) =>
  queryOptions({
    queryKey: ["activeAlerts", locale],
    queryFn: () => $getActiveAlerts({ data: { locale } }),
  });

export const getAlertByIdQueryOptions = (alertId: string) =>
  queryOptions({
    queryKey: ["alert", alertId],
    queryFn: () => $getAlertById({ data: { alertId } }),
  });

// Server functions
export const $getAlerts = createServerFn({ method: "GET" })
  .validator(z.object({ limit: z.number().optional() }).optional())
  .handler(async ({ data }) => {
    const alerts = await db.query.alert.findMany({
      with: {
        translations: true,
        author: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [desc(alert.createdAt)],
      limit: data?.limit || 100,
    });

    return alerts as GetAlertsResponse;
  });

export const $getAlertById = createServerFn({ method: "GET" })
  .validator(z.object({ alertId: z.string() }))
  .handler(async ({ data }) => {
    const alertData = await db.query.alert.findFirst({
      where: eq(alert.id, data.alertId),
      with: {
        translations: true,
        author: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return alertData as AlertWithTranslations | undefined;
  });

export const $getActiveAlerts = createServerFn({ method: "GET" })
  .validator(z.object({ locale: localeSchema }))
  .handler(async ({ data }) => {
    const activeAlerts = await db.query.alert.findMany({
      where: eq(alert.isActive, true),
      with: {
        translations: true,
      },
      orderBy: [desc(alert.activatedAt)],
    });

    const activeAlertsTranslations = activeAlerts.flatMap((al) =>
      al.translations.filter((t) => t.locale === data.locale)
    );

    return activeAlertsTranslations as GetActiveAlertsResponse;
  });

export const $createAlert = createServerFn({ method: "POST" })
  .validator(
    z.object({
      authorId: z.string(),
      translations: z.array(
        z.object({
          locale: z.string(),
          title: z.string(),
          message: z.string(),
        })
      ),
    })
  )
  .handler(async ({ data }) => {
    const [newAlert] = await db
      .insert(alert)
      .values({
        authorId: data.authorId,
        isActive: false,
      })
      .returning();

    if (data.translations.length > 0) {
      await db.insert(alertTranslation).values(
        data.translations.map((translation) => ({
          alertId: newAlert.id,
          locale: translation.locale,
          title: translation.title,
          message: translation.message,
        }))
      );
    }

    return newAlert;
  });

export const $updateAlert = createServerFn({ method: "POST" })
  .validator(
    z.object({
      alertId: z.string(),
      isActive: z.boolean().optional(),
      translations: z
        .array(
          z.object({
            locale: z.string(),
            title: z.string(),
            message: z.string(),
          })
        )
        .optional(),
    })
  )
  .handler(async ({ data }) => {
    const updateData: Partial<Alert> = {};

    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
      if (data.isActive) {
        updateData.activatedAt = new Date();
      } else {
        updateData.deactivatedAt = new Date();
      }
    }

    updateData.updatedAt = new Date();

    const [updatedAlert] = await db
      .update(alert)
      .set(updateData)
      .where(eq(alert.id, data.alertId))
      .returning();

    if (data.translations && data.translations.length > 0) {
      // Delete existing translations
      await db
        .delete(alertTranslation)
        .where(eq(alertTranslation.alertId, data.alertId));

      // Insert new translations
      await db.insert(alertTranslation).values(
        data.translations.map((translation) => ({
          alertId: data.alertId,
          locale: translation.locale,
          title: translation.title,
          message: translation.message,
        }))
      );
    }

    return updatedAlert;
  });

export const $deleteAlert = createServerFn({ method: "POST" })
  .validator(z.object({ alertId: z.string() }))
  .handler(async ({ data }) => {
    const [deletedAlert] = await db
      .delete(alert)
      .where(eq(alert.id, data.alertId))
      .returning();

    return deletedAlert;
  });

export const $toggleAlertStatus = createServerFn({ method: "POST" })
  .validator(z.object({ alertId: z.string(), isActive: z.boolean() }))
  .handler(async ({ data }) => {
    const updateData: Partial<Alert> = {
      isActive: data.isActive,
      updatedAt: new Date(),
    };

    if (data.isActive) {
      updateData.activatedAt = new Date();
    } else {
      updateData.deactivatedAt = new Date();
    }

    const [updatedAlert] = await db
      .update(alert)
      .set(updateData)
      .where(eq(alert.id, data.alertId))
      .returning();

    return updatedAlert;
  });

const hiddenAlerts = "hiddenAlerts";
//* server function to set hidden alert ids */
export const $saveHiddenAlertIds = createServerFn({ method: "POST" })
  .validator(z.object({ alertId: z.string(), locale: localeSchema }))
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
    newIds.add(data.alertId);

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
