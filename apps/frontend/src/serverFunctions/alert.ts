import { infiniteQueryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import { localeSchema } from "@/config/i18n";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import {
  alertsRepository,
  createAlertSchema,
  updateAlertSchema,
  type AlertFilters,
  type AlertRecord,
} from "@/repositories/alert";
import { $getAuthUser } from "./authUser";

const alertFiltersSchema = z.object({
  q: z.string().optional(),
  activeFrom: z.string().optional(),
  activeTo: z.string().optional(),
});

const ALERTS_PAGE_SIZE = 20;

/** Get alerts list for CMS */
export const $getAllAlerts = createServerFn({ method: "GET" })
  .inputValidator(
    z
      .object({
        limit: z.number().min(1).max(100).optional().default(ALERTS_PAGE_SIZE),
        offset: z.number().min(0).optional().default(0),
      })
      .merge(alertFiltersSchema),
  )
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }): Promise<AlertRecord[]> => {
    context.checkPermission("alerts", "list");

    return alertsRepository.list({
      limit: data.limit,
      offset: data.offset,
      filters: {
        q: data.q,
        activeFrom: data.activeFrom,
        activeTo: data.activeTo,
      },
    });
  });

export function getAllAlertsInfiniteQueryOptions(filters: AlertFilters = {}) {
  return infiniteQueryOptions({
    queryKey: ["alerts", "items", filters],
    queryFn: ({ pageParam }: { pageParam: number }) =>
      $getAllAlerts({
        data: {
          limit: ALERTS_PAGE_SIZE,
          offset: pageParam,
          ...filters,
        },
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length < ALERTS_PAGE_SIZE
        ? undefined
        : lastPageParam + ALERTS_PAGE_SIZE,
  });
}

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

    const { user } = await $getAuthUser();

    const updated = await alertsRepository.update(data, user?.id!);

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
  id: string;
  content: string;
}

/** Get list of active alerts for the client, based on locale */
export const $getActiveAlerts = createServerFn({ method: "GET" })
  .inputValidator(z.object({ locale: localeSchema }))
  .handler(async ({ data }) => {
    return await alertsRepository.listActive({ lang: data.locale });
  });

/** Cookie key to store hidden alert ids */
const hiddenAlerts = "hiddenAlerts";

//* server function to set hidden alert ids */
export const $saveHiddenAlertIds = createServerFn({ method: "POST" })
  .inputValidator(z.object({ alertId: z.string(), locale: localeSchema }))
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

    ids.add(data.alertId);

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
