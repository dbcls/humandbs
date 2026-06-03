import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Locale } from "@/config/i18n";
import { localeSchema } from "@/config/i18n";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import type { AlertFilters, AlertRecord } from "@/repositories/alert";
import { alertsRepository, createAlertSchema, updateAlertSchema } from "@/repositories/alert";

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
      lastPage.length < ALERTS_PAGE_SIZE ? undefined : lastPageParam + ALERTS_PAGE_SIZE,
  });
}

export const $createAlert = createServerFn({ method: "POST" })
  .inputValidator(createAlertSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("alerts", "create");

    // user?.id should be defined because context.checkPermission here passed
    const created = await alertsRepository.create(data, context.user?.id);

    return created;
  });

export const $updateAlert = createServerFn({ method: "POST" })
  .inputValidator(updateAlertSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    context.checkPermission("alerts", "update");

    const updated = await alertsRepository.update(data, context.user.id);

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

export function getActiveAlertsQueryOptions({ locale }: { locale: Locale }) {
  return queryOptions({
    queryKey: ["activeAlerts", locale],
    queryFn: () => $getActiveAlerts({ data: { locale } }),
    enabled: !!locale,
    staleTime: 1000 * 60 * 60 * 24,
  });
}
