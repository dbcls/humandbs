import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { navigationFlowchartConfigSchema } from "@/config/navigationFlowchart.schema";
import { NAVIGATION_FLOWCHART_STATUS } from "@/db/schema";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import {
  NavigationFlowchartConflictError,
  navigationFlowchartRepository,
} from "@/repositories/navigationFlowchart";

export const $getNavigationFlowcharts = createServerFn({ method: "GET" })
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context }) => {
    context.checkPermission("admin-panel", "view-cms");
    return navigationFlowchartRepository.getAll();
  });

export function getNavigationFlowchartsQueryOptions() {
  return queryOptions({
    queryKey: ["navigation-flowcharts", "list"],
    queryFn: () => $getNavigationFlowcharts(),
    staleTime: 1000 * 30,
  });
}

export const $getNavigationFlowchartById = createServerFn({ method: "GET" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("admin-panel", "view-cms");
    return navigationFlowchartRepository.getById(data.id);
  });

export function getNavigationFlowchartByIdQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["navigation-flowcharts", "detail", id],
    queryFn: () => $getNavigationFlowchartById({ data: { id } }),
    staleTime: 1000 * 30,
  });
}

const saveInputSchema = z.object({
  id: z.string().uuid(),
  nameEn: z.string().min(1),
  nameJa: z.string().min(1),
  isEntryPoint: z.boolean(),
  status: z.enum([NAVIGATION_FLOWCHART_STATUS.DRAFT, NAVIGATION_FLOWCHART_STATUS.PUBLISHED]),
  config: navigationFlowchartConfigSchema,
  expectedRevision: z.number().int().min(1),
});

export const $saveNavigationFlowchartConfig = createServerFn({ method: "POST" })
  .inputValidator(saveInputSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("admin-panel", "view-cms");

    const userId = context.user?.id === "dev-user-id" ? undefined : context.user?.id;

    try {
      return {
        ok: true as const,
        data: await navigationFlowchartRepository.save(data.id, {
          nameEn: data.nameEn,
          nameJa: data.nameJa,
          isEntryPoint: data.isEntryPoint,
          status: data.status,
          config: data.config,
          expectedRevision: data.expectedRevision,
          userId,
        }),
      };
    } catch (error) {
      if (error instanceof NavigationFlowchartConflictError) {
        return {
          ok: false as const,
          code: "CONFLICT" as const,
          error: error.message,
        };
      }
      throw error;
    }
  });

const createInputSchema = z.object({
  nameEn: z.string().min(1),
  nameJa: z.string().min(1),
});

export const $createNavigationFlowchart = createServerFn({ method: "POST" })
  .inputValidator(createInputSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("admin-panel", "view-cms");

    const userId = context.user?.id === "dev-user-id" ? undefined : context.user?.id;

    return navigationFlowchartRepository.create({
      nameEn: data.nameEn,
      nameJa: data.nameJa,
      isEntryPoint: false,
      config: { steps: [] },
      userId,
    });
  });

export const $deleteNavigationFlowchart = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("admin-panel", "view-cms");

    const deps = await navigationFlowchartRepository.getDependencies(data.id);
    if (deps.length > 0) {
      return { ok: false as const, code: "HAS_DEPENDENTS" as const, deps };
    }

    await navigationFlowchartRepository.delete(data.id);
    return { ok: true as const };
  });
