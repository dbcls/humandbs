import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/router-core";
import { z } from "zod";

import type {
  CreateDatasetForResearchRequest,
  DatasetCreateResponse,
  DatasetDetailResponse,
  DatasetSearchBody,
  DatasetSearchResponse,
  DatasetUpdateResponse,
  DatasetVersionsListResponse,
  LinkedDatasetsListResponse,
  UpdateDatasetRequest,
} from "@humandbs/backend/types";
import {
  DatasetIdParamsSchema,
  DatasetSearchBodySchema,
  LangQuerySchema,
  LangVersionQuerySchema,
} from "@humandbs/backend/types";

import type { Locale } from "@/config/i18n";
import { requestSignalMiddleware } from "@/middleware/requestSignalMiddleware";
import { api, mapApiError } from "@/services/backend";
import { isApiNotFoundError, throwSerializableApiError } from "@/utils/errors";
import { filterDefined } from "@/utils/filter-defined";
import { $$getJWT } from "@/utils/jwt-helpers";
import { addDatasetRenderedHtml } from "@/utils/renderedHtml/transforms";
import type { RenderedDatasetDetailResponse } from "@/utils/renderedHtml/types";
import { clearSearchSignal, nextSearchSignal } from "@/utils/search-signals";
import type { DeepOmit } from "@/utils/type-utils";

import { makeChunks, mergeBatchResults } from "../utils/batch-utils";

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

export const $getDatasetsPaginated = createServerFn()
  .middleware([requestSignalMiddleware])
  .inputValidator(DatasetSearchBodySchema)
  .handler<Promise<DatasetSearchResponse>>(async ({ data, context }) => {
    const accessToken = $$getJWT();
    const paginated = await api.searchDatasets(
      data,
      accessToken ?? undefined,
      context.requestSignal,
    );

    return paginated;
  });

export function getDatasetsPaginatedQueryOptions(data: Omit<DatasetSearchBody, "includeFacets">) {
  return queryOptions({
    queryKey: ["datasets", "list", data],
    queryFn: async () => {
      const signal = nextSearchSignal("dataset");

      try {
        return await $getDatasetsPaginated({
          data: { ...data, includeFacets: true },
          signal,
        });
      } finally {
        clearSearchSignal("research", signal);
      }
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 60,
  });
}

/**
 * Gets all linked datasets for a given humId, non-paginated
 */
export const $getDatasetsOfResearch = createServerFn()
  .inputValidator(
    z.object({
      humId: z.string(),
    }),
  )
  .handler<Promise<LinkedDatasetsListResponse>>(async ({ data }) => {
    const token = $$getJWT();
    return await api.getResearchDatasets(data, token ?? undefined);
  });

/**
 * Query options getter.
 * Disabled by default (for explicid fetch on add to cart button click)
 */
export function getDatasetsOfResearchQueryOptions(humId: string) {
  return queryOptions({
    queryKey: ["datasets", "ofResearch", humId],
    queryFn: () => $getDatasetsOfResearch({ data: { humId } }),
    staleTime: 1000 * 60 * 60,
    enabled: false,
  });
}

const DatasetQuerySchema = z.object({
  ...DatasetIdParamsSchema.shape,
  ...LangVersionQuerySchema.shape,
});

type DatasetQuery = z.infer<typeof DatasetQuerySchema>;

export const $getDataset = createServerFn({ method: "GET" })
  .inputValidator(DatasetQuerySchema)
  .handler<Promise<RenderedDatasetDetailResponse>>(async ({ data }) => {
    const accessToken = $$getJWT();
    const { datasetId, ...search } = filterDefined(data);

    try {
      const res = await api.getDataset({
        params: { datasetId },
        search: { ...search, includeRawHtml: false },
        accessToken: accessToken ?? undefined,
      });

      // Render each experiment.data.* `text` into a frontend-only `renderedHtml`
      // projection (the currently-broken public path). Legacy `rawHtml` untouched.
      return addDatasetRenderedHtml(res);
    } catch (error) {
      // A missing dataset should render the NotFound component rather than
      // surfacing a raw API error. `notFound()` is a framework signal the
      // router (or the route loader) can pick up to render `notFoundComponent`.
      if (isApiNotFoundError(error)) throw notFound();
      throwSerializableApiError(error);
    }
  });

export function getDatasetQueryOptions(query: DatasetQuery) {
  return queryOptions({
    queryKey: ["dataset", "byId", query],
    queryFn: () => $getDataset({ data: query }),
    staleTime: 1000 * 60 * 60,
  });
}

/**
 * Admin "for edit" read fn — parallels {@link $getResearchForEdit}. Requests
 * `includeRawHtml: true` and runs NO render transform, so the editor receives the
 * untouched legacy `rawHtml` (the side-channel reference admins rewrite from).
 */
export const $getDatasetForEdit = createServerFn({ method: "GET" })
  .inputValidator(DatasetQuerySchema)
  .handler<Promise<DatasetDetailResponse>>(async ({ data }) => {
    const accessToken = $$getJWT();
    const { datasetId, ...search } = filterDefined(data);
    return await api.getDataset({
      params: { datasetId },
      search: { ...search, includeRawHtml: true },
      accessToken: accessToken ?? undefined,
    });
  });

export function getDatasetForEditQueryOptions(query: DatasetQuery) {
  return queryOptions({
    queryKey: ["dataset", "byId", "edit", query],
    queryFn: () => $getDatasetForEdit({ data: query }),
    staleTime: 0,
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

const BatchDatasetsQuerySchema = z.object({
  ids: z.array(z.string()),
  lang: LangQuerySchema.shape.lang,
});

/**
 * Gets list of datasets for the Cart.
 * API is up to 100 ids, so it splits into several requasts if more that 100 ids
 */
export const $getBatchDatasets = createServerFn()
  .inputValidator(BatchDatasetsQuerySchema)
  .handler(async ({ data }) => {
    const chunks = makeChunks(data.ids);
    const results = await Promise.all(
      chunks.map((chunk) => api.getBatchDatasets({ ids: chunk, lang: data.lang })),
    );
    return mergeBatchResults(results);
  });

export function getBatchedDatasetsQueryOptions(ids: string[], lang: Locale) {
  return queryOptions({
    queryKey: ["datasets", "batch", { ids, lang }],
    queryFn: () => $getBatchDatasets({ data: { ids, lang } }),
    staleTime: 1000 * 60 * 60,
    placeholderData: keepPreviousData,
    enabled: ids.length > 0,
  });
}

/**
 * Creates a dataset. Trusts backend validation,
 * because it uses some logic other that just zod schema.
 * The zod schema from the backend cannot simply be put in the input validator:
 * it ignores the rawHtml but it is still required by the zod schema
 */
export const $createDatasetForResearch = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { humId: string; body: DeepOmit<CreateDatasetForResearchRequest, "rawHtml"> }) => data,
  )
  .handler<Promise<CreateDatasetForResearchResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");

    try {
      const created = await api.createDatasetForResearch(data.humId, data.body, accessToken);
      return { ok: true, data: created };
    } catch (error) {
      return mapApiError(error, "Failed to create dataset.");
    }
  });

/**
 * Updates a dataset. Trusts backend validation,
 * because it uses some logic other that just zod schema.
 * The zod schema from the backend cannot simply be put in the input validator:
 * it ignores the rawHtml but it is still required by the zod schema
 */
export const $updateDataset = createServerFn({ method: "POST" })
  .inputValidator((data: { datasetId: string; body: UpdateDatasetRequest }) => data)
  .handler<Promise<UpdateDatasetResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");

    try {
      const updated = await api.updateDataset(data.datasetId, data.body, accessToken);
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
