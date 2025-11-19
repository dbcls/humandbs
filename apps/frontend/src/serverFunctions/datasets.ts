import { api } from "@/services/backend";
import { filterDefined } from "@/utils/filterDefined";
import {
  DatasetIdParamsSchema,
  DatasetsQuerySchema,
  LangVersionQuerySchema,
} from "@humandbs/backend/types";
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

const DatasetQuerySchema = z.object({
  ...DatasetIdParamsSchema.shape,
  ...LangVersionQuerySchema.shape,
});

type DatasetQuery = z.infer<typeof DatasetQuerySchema>;

export const $getDataset = createServerFn({ method: "GET" })
  .inputValidator(DatasetQuerySchema)
  .handler(async ({ data }) => {
    const { datasetId, ...search } = filterDefined(data);
    return await api.getDataset({
      params: { datasetId },
      search,
    });
  });

export function getDatasetQueryOptions(query: DatasetQuery) {
  return queryOptions({
    queryKey: ["dataset", "byId", query],
    queryFn: () => $getDataset({ data: query }),
    staleTime: 1000 * 60 * 60,
  });
}
