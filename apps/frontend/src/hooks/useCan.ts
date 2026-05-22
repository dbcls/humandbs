import { useRouteContext } from "@tanstack/react-router";

import type { AccessResources, CanParams, CanResult } from "@/config/permissions";
import { can } from "@/config/permissions";

export function useCan<R extends keyof AccessResources>(params: CanParams<R>): CanResult {
  const { user } = useRouteContext({ from: "__root__" });
  return can(user, params);
}
