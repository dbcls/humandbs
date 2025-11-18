import { api } from "@/services/backend";
import { DatasetsQuerySchema } from "@humandbs/backend/types";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

export const $getDatasetsPaginated = createServerFn({ method: "GET" })
  .inputValidator(DatasetsQuerySchema)
  .handler(async ({ data }) => {
    const paginated = await api.getDatasetsPaginated({ search: data });

    return paginated;
  });

export function getDatasetsPaginatedQueryOptions(
  query: z.infer<typeof DatasetsQuerySchema>
) {
  return queryOptions({
    queryKey: ["datasets", "list", query],
    queryFn: async () => {
      return await $getDatasetsPaginated({ data: query });
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 60,
  });
}
