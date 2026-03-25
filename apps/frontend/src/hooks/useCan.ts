import { useRouteContext } from "@tanstack/react-router";

import {
  can,
  type AccessResources,
  type CanParams,
  type CanResult,
} from "@/config/permissions";

export function useCan<R extends keyof AccessResources>(
  params: CanParams<R>,
): CanResult {
  const { user } = useRouteContext({ from: "__root__" });
  return can(user, params);
}
