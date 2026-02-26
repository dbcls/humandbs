import {
  DatasetIdParamsSchema,
  type DatasetVersionsResponse,
  LangQuerySchema,
  LangVersionQuerySchema,
  type DatasetSearchUnifiedResponse,
  type DatasetDetailResponse,
  DatasetSearchBodySchema,
  type DatasetSearchBody,
} from "@humandbs/backend/types";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { api } from "@/services/backend";
import { filterDefined } from "@/utils/filterDefined";

export const $getDatasetsPaginated = createServerFn({ method: "GET" })
  .inputValidator(DatasetSearchBodySchema)
  .handler<Promise<DatasetSearchUnifiedResponse>>(async ({ data }) => {
    const paginated = await api.searchDatasets(data);

    return paginated;
  });

export function getDatasetsPaginatedQueryOptions(
  data: Omit<DatasetSearchBody, "includeFacets">,
) {
  return queryOptions({
    queryKey: ["datasets", "list", data],
    queryFn: async () => {
      return await $getDatasetsPaginated({
        data: { ...data, includeFacets: true },
      });
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
  .handler<Promise<DatasetDetailResponse>>(async ({ data }) => {
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

const DatasetVersionsQuerySchema = z.object({
  ...DatasetIdParamsSchema.shape,
  ...LangQuerySchema.shape,
});

export type DatasetVersionsQuery = z.infer<typeof DatasetVersionsQuerySchema>;

export const $getDatasetVersions = createServerFn({
  method: "GET",
})
  .inputValidator(DatasetVersionsQuerySchema)
  .handler<Promise<DatasetVersionsResponse>>(({ data }) =>
    api.getDatasetVersions({
      params: { datasetId: data.datasetId },
      search: { lang: data.lang },
    }),
  );

export function getDatasetVersionsQueryOptions(query: DatasetVersionsQuery) {
  return queryOptions({
    queryKey: ["dataset", "versions", query],
    queryFn: () => $getDatasetVersions({ data: query }),
    staleTime: 1000 * 60 * 60,
  });
}
