import { cleanEmptyParams } from "@/utils/cleanEmptyParams";
import {
  getRouteApi,
  RegisteredRouter,
  RouteIds,
  SearchParamOptions,
} from "@tanstack/react-router";

export function useFilters<
  TId extends RouteIds<RegisteredRouter["routeTree"]>,
  TSearchParams extends SearchParamOptions<
    RegisteredRouter,
    TId,
    TId
  >["search"],
>(routeId: TId) {
  const routeApi = getRouteApi<TId>(routeId);

  const navigate = routeApi.useNavigate();
  const filters = routeApi.useSearch();

  const setFilters = (partialFilters: Partial<TSearchParams>) =>
    navigate({
      search: cleanEmptyParams({
        ...filters,
        ...partialFilters,
      }) as TSearchParams,
      resetScroll: false,
    });

  const resetFilters = () =>
    navigate({ search: {} as TSearchParams, resetScroll: false });

  return {
    filters,
    setFilters,
    resetFilters,
  };
}
