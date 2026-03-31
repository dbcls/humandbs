import {
  CreateDatasetForResearchRequestSchema,
  DatasetIdParamsSchema,
  type DatasetCreateResponse,
  type DatasetVersionsListResponse,
  LangQuerySchema,
  LangVersionQuerySchema,
  type DatasetSearchResponse,
  type DatasetDetailResponse,
  type DatasetUpdateResponse,
  DatasetSearchBodySchema,
  type DatasetSearchBody,
  UpdateDatasetRequestSchema,
} from "@humandbs/backend/types";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { api, mapApiError } from "@/services/backend";
import { filterDefined } from "@/utils/filterDefined";
import { $$getJWT } from "@/utils/jwt-helpers";

export type CreateDatasetForResearchResult =
  | { ok: true; data: DatasetCreateResponse }
  | {
      ok: false;
      error: string;
      code: "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED";
    };

export type UpdateDatasetResult =
  | { ok: true; data: DatasetUpdateResponse }
  | {
      ok: false;
      error: string;
      code: "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED";
    };

export type DeleteDatasetResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code: "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED";
    };

export const $getDatasetsPaginated = createServerFn({ method: "GET" })
  .inputValidator(DatasetSearchBodySchema)
  .handler<Promise<DatasetSearchResponse>>(async ({ data }) => {
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
    const accessToken = $$getJWT();
    const { datasetId, ...search } = filterDefined(data);
    return await api.getDataset({
      params: { datasetId },
      search,
      accessToken: accessToken ?? undefined,
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
  .handler<Promise<DatasetVersionsListResponse>>(({ data }) =>
    api.getDatasetVersions({
      params: { datasetId: data.datasetId },
      search: { lang: data.lang, includeRawHtml: false },
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
      return mapApiError(error, "Failed to create dataset.");
    }
  });

const UpdateDatasetInputSchema = z.object({
  datasetId: z.string().min(1),
  body: UpdateDatasetRequestSchema,
});

export const $updateDataset = createServerFn({ method: "POST" })
  .inputValidator(UpdateDatasetInputSchema)
  .handler<Promise<UpdateDatasetResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");

    try {
      const updated = await api.updateDataset(
        data.datasetId,
        data.body,
        accessToken,
      );
      return { ok: true, data: updated };
    } catch (error) {
      return mapApiError(error, "Failed to update dataset.");
    }
  });

const DeleteDatasetInputSchema = z.object({
  datasetId: z.string().min(1),
});

export const $deleteDataset = createServerFn({ method: "POST" })
  .inputValidator(DeleteDatasetInputSchema)
  .handler<Promise<DeleteDatasetResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");

    try {
      await api.deleteDataset(data.datasetId, accessToken);
      return { ok: true };
    } catch (error) {
      return mapApiError(error, "Failed to delete dataset.");
    }
  });
