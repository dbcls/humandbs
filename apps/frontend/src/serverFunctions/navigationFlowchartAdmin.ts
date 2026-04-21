import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { navigationFlowchartRepository } from "@/repositories/navigationFlowchart";

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
