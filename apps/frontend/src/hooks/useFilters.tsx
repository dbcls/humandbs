import {
  getRouteApi,
  type RegisteredRouter,
  type RouteIds,
  type SearchParamOptions,
} from "@tanstack/react-router";

import { cleanEmptyParams } from "@/utils/cleanEmptyParams";

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

  /**
   * Toggle a string value inside a nested array filter.
   *
   * Example: toggleArrayFilter("datasetFilters", "criteria", "WGS", true)
   * adds "WGS" to filters.datasetFilters.criteria, removing it when false.
   * The nested object is stripped when empty; the top-level key is removed
   * when the nested object has no remaining keys.
   */
  const toggleArrayFilter = (
    groupKey: string,
    fieldKey: string,
    value: string,
    checked: boolean,
  ) => {
    const currentFilters = filters as Record<string, unknown>;
    const group = ((currentFilters[groupKey] ?? {}) as Record<string, string[] | undefined>);
    const current = group[fieldKey] ?? [];
    const next = checked
      ? [...current, value]
      : current.filter((v) => v !== value);

    const newGroup = { ...group, [fieldKey]: next.length > 0 ? next : undefined };
    const cleanedGroup = Object.fromEntries(
      Object.entries(newGroup).filter(([, v]) => v !== undefined),
    );

    setFilters({
      [groupKey]: Object.keys(cleanedGroup).length > 0 ? cleanedGroup : undefined,
      page: 1,
    } as unknown as Partial<TSearchParams>);
  };

  return {
    filters,
    setFilters,
    resetFilters,
    toggleArrayFilter,
  };
}
