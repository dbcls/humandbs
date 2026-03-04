import {
  CreateDatasetForResearchRequestSchema,
  DatasetIdParamsSchema,
  type DatasetCreateResponse,
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

import { api, APIError } from "@/services/backend";
import { filterDefined } from "@/utils/filterDefined";
import { $$getJWT } from "@/utils/jwt-helpers";

export type CreateDatasetForResearchResult =
  | { ok: true; data: DatasetCreateResponse }
  | {
      ok: false;
      error: string;
      code: "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED";
    };

export const $getDatasetsPaginated = createServerFn({ method: "GET" })
  .inputValidator(DatasetSearchBodySchema)
  .handler<Promise<DatasetSearchUnifiedResponse>>(async ({ data }) => {
    const accessToken = $$getJWT();
    const paginated = await api.searchDatasets(data, accessToken ?? undefined);

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

const CreateDatasetForResearchInputSchema = z.object({
  humId: z.string().min(1),
  body: CreateDatasetForResearchRequestSchema,
});

export const $createDatasetForResearch = createServerFn({ method: "POST" })
  .inputValidator(CreateDatasetForResearchInputSchema)
  .handler<Promise<CreateDatasetForResearchResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");

    try {
      const created = await api.createDatasetForResearch(
        data.humId,
        data.body,
        accessToken,
      );
      return { ok: true, data: created };
    } catch (error) {
      if (error instanceof APIError) {
        const detail =
          (error.data as { detail?: string } | undefined)?.detail ??
          "Failed to create dataset.";
        if (error.status === 409) {
          return { ok: false, error: detail, code: "CONFLICT" };
        }
        if (error.status === 403) {
          return { ok: false, error: detail, code: "FORBIDDEN" };
        }
        if (error.status === 404) {
          return { ok: false, error: detail, code: "NOT_FOUND" };
        }
        if (error.status === 401) {
          return { ok: false, error: detail, code: "UNAUTHORIZED" };
        }
      }
      throw error;
    }
  });
