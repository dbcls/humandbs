import type { RegisteredRouter, RouteIds } from "@tanstack/react-router";
import { useNavigate, useSearch } from "@tanstack/react-router";
// import { startTransition } from "react";

import { cleanEmptyParams } from "@/utils/clean-empty-params";

const preservedKeys = ["sort", "limit", "order"];

export function useFilters<TId extends RouteIds<RegisteredRouter["routeTree"]>>(routeId: TId) {
  const navigate = useNavigate();
  const filters = useSearch({ from: routeId });

  const setFilters = (partialFilters: Record<string, unknown>) =>
    navigate({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search: cleanEmptyParams({ ...filters, ...partialFilters }) as any,
      resetScroll: false,
    });

  const preservedSearch = Object.entries(filters).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      if (preservedKeys.includes(key)) {
        acc[key] = value;
      }
      return acc;
    },
    {},
  );

  const resetFilters = () => {
    navigate({
      to: ".",
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
