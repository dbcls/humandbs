import {
  getRouteApi,
  type RegisteredRouter,
  type RouteIds,
  type SearchParamOptions,
} from "@tanstack/react-router";
import { useRef } from "react";

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

  // Tracks the latest intended filter state. Written synchronously in toggleArrayFilter
  // so successive calls within the same tick accumulate correctly, ahead of URL updates.
  const filtersRef = useRef<TSearchParams>(filters);

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
   *
   * Uses filtersRef to accumulate state across successive calls within the same
   * render cycle, avoiding the stale-closure problem when clicking multiple
   * checkboxes before the URL (and filters) has updated.
   */
  const toggleArrayFilter = (
    groupKey: string,
    fieldKey: string,
    value: string,
    checked: boolean,
  ) => {
    const currentFilters = filtersRef.current as Record<string, unknown>;
    const group = (currentFilters[groupKey] ?? {}) as Record<string, string[] | undefined>;
    const current = group[fieldKey] ?? [];
    const next = checked
      ? [...current, value]
      : current.filter((v) => v !== value);

    const newGroup = { ...group, [fieldKey]: next.length > 0 ? next : undefined };
    const cleanedGroup = Object.fromEntries(
      Object.entries(newGroup).filter(([, v]) => v !== undefined),
    );
    const newGroupValue = Object.keys(cleanedGroup).length > 0 ? cleanedGroup : undefined;

    // Write accumulated state synchronously so the next call reads the correct base
    filtersRef.current = {
      ...filtersRef.current,
      [groupKey]: newGroupValue,
    } as TSearchParams;

    setFilters({
      [groupKey]: newGroupValue,
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
