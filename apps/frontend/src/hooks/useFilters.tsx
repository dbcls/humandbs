import {
  getRouteApi,
  type RegisteredRouter,
  type RouteIds,
} from "@tanstack/react-router";

import { cleanEmptyParams } from "@/utils/cleanEmptyParams";

const preservedKeys = ["sort", "limit", "order"];
export function useFilters<
  TId extends RouteIds<RegisteredRouter["routeTree"]>,
>(routeId: TId) {
  const routeApi = getRouteApi<TId>(routeId);

  const navigate = routeApi.useNavigate();
  const filters = routeApi.useSearch();

  const setFilters = (partialFilters: Record<string, unknown>) =>
    navigate({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search: cleanEmptyParams({ ...filters, ...partialFilters }) as any,
      resetScroll: false,
    });

  const preservedSearch = Object.entries(filters).reduce<
    Record<string, unknown>
  >((acc, [key, value]) => {
    if (preservedKeys.includes(key)) {
      acc[key] = value;
    }
    return acc;
  }, {});
  const resetFilters = () => {
    navigate({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search: cleanEmptyParams({ ...preservedSearch, page: 1 }) as any,
      resetScroll: false,
    });
  };

  return {
    filters,
    setFilters,
    resetFilters,
  };
}
