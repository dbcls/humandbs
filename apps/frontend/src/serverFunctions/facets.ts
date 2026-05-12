import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { api } from "@/services/backend";

export const $getFacets = createServerFn().handler(() => api.getAllFacets());

export const getAllFacetsQueryOptions = () =>
  queryOptions({
    queryKey: ["facets", "all"],
    queryFn: () => $getFacets(),
    staleTime: Infinity, // Facets are not changing much. Reload the page to get new values if any
  });
