import { api } from "@/services/backend";
import { DatasetsQuerySchema } from "@humandbs/backend/types";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

export const $getDatasetsPaginated = createServerFn({ method: "GET" })
  .inputValidator(DatasetsQuerySchema)
  .handler(({ data }) => api.getDatasetsPaginated({ search: data }));

export function getDatasetsPaginatedQueryOptions(
  query: z.infer<typeof DatasetsQuerySchema>
) {
  return queryOptions({
    queryKey: ["datasets", "list", query],
    queryFn: async () => {
      return await $getDatasetsPaginated({ data: query });
    },
    staleTime: 1000 * 60 * 60,
  });
}
