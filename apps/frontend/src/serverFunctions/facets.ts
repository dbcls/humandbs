import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { api } from "@/services/backend";

export const $getFacets = createServerFn().handler(() => api.getAllFacets());

export const getAllFacetsQueryOptions = () =>
  queryOptions({
    queryKey: ["facets", "all"],
    queryFn: () => $getFacets(),
    staleTime: 1000 * 60 * 60, // 1 hour
  });
