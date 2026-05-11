import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import { localeSchema } from "@/config/i18n";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import {
  alertsRepository,
  createAlertSchema,
  updateAlertSchema,
} from "@/repositories/alert";
import { $getAuthUser } from "./authUser";

/** Get alerts list for CMS */
export const $getAllAlerts = createServerFn({ method: "GET" })
  .inputValidator(
    z
      .object({ limit: z.number().optional(), offset: z.number().optional() })
      .optional(),
  )
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("alerts", "list");

    const alerts = await alertsRepository.list(data ?? {});

    return alerts;
  });

// Query options
export const getAllAlertsQueryOptions = (params?: {
  limit?: number;
  offset?: number;
}) =>
  queryOptions({
    queryKey: ["alerts", params],
    queryFn: () => $getAllAlerts({ data: params }),
  });

export const $createAlert = createServerFn({ method: "POST" })
  .inputValidator(createAlertSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("alerts", "create");

    const { user } = await $getAuthUser();

    // user?.id should be defined because context.checkPermission here passed
    const created = await alertsRepository.create(data, user?.id!);

    return created;
  });

export const $updateAlert = createServerFn({ method: "POST" })
  .inputValidator(updateAlertSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("alerts", "update");

    const updated = await alertsRepository.update(data);

    return updated;
  });

export const $deleteAlert = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("alerts", "delete");

    await alertsRepository.delete(data.id);
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
    return await alertsRepository.listActive({ lang: data.locale });
  });

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

    const ids = new Set(existingIds);

    ids.add(data.newsId);

    setCookie(hiddenAlerts, JSON.stringify([...ids]), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  });

export const $getHiddenAlertIds = createServerFn({ method: "GET" }).handler(
  () => {
    const alertIdsCookie = getCookie(hiddenAlerts);
    const alertIds = alertIdsCookie ? JSON.parse(alertIdsCookie) : [];
    return alertIds as string[];
  },
);
