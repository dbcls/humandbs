import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/router-core";
import { z } from "zod";

import type {
  CreateResearchRequest,
  CreateVersionRequest,
  ResearchDetailResponse,
  ResearchSearchBody,
  ResearchWithLockResponse,
  UpdateResearchRequest,
  VersionCreateResponse,
  WorkflowResponse,
} from "@humandbs/backend/types";
import {
  HumIdParamsSchema,
  LangQuerySchema,
  LangVersionQuerySchema,
  ResearchSearchBodySchema,
} from "@humandbs/backend/types";

import { localeSchema } from "@/config/i18n";
import type { ResearchSearchResponseWithTypedCriteria } from "@/lib/types";
import { requestSignalMiddleware } from "@/middleware/requestSignalMiddleware";
import { auditMutation } from "@/observability/server";
import type { ApiErrorResult } from "@/services/backend";
import { api, mapApiError } from "@/services/backend";
import { isApiNotFoundError, throwSerializableApiError } from "@/utils/errors";
import { filterDefined } from "@/utils/filter-defined";
import { $$getJWT } from "@/utils/jwt-helpers";
import { authedResearchesListSearchParamsSchema } from "@/utils/query-params";
import {
  addResearchRenderedHtml,
  addResearchVersionsRenderedHtml,
} from "@/utils/renderedHtml/transforms";
import type {
  RenderedResearchDetailResponse,
  RenderedResearchVersionsListResponse,
} from "@/utils/renderedHtml/types";
import { clearSearchSignal, nextSearchSignal } from "@/utils/search-signals";

import type { DsApplicationListResponse, OwnersData } from "../../../backend/src/api/types";
import type {
  DatasetTemplateData,
  ResearchTemplateData,
} from "../../../backend/src/api/types/templates";

export type CreateResearchResult =
  | { ok: true; data: ResearchWithLockResponse }
  | ApiErrorResult<"HUMID_CONFLICT">;

export type UpdateResearchResult = { ok: true; data: ResearchWithLockResponse } | ApiErrorResult;
export type DeleteResearchResult = { ok: true } | ApiErrorResult;
export type GetJDSResearchResult = { ok: true; data: ResearchTemplateData } | ApiErrorResult;

export type GetDatasetTemplateResult = { ok: true; data: DatasetTemplateData } | ApiErrorResult;

/**
 * Creates a research. Trusts backend validation (validator is just an identity function - to provide only type safety),
 * because it uses some logic other that just zod schema.
 * The zod schema from the backend cannot simply be put in the input validator:
 * it ignores the rawHtml but it is still required by the zod schema
 */
export const $createResearch = createServerFn({ method: "POST" })
  .inputValidator((data: CreateResearchRequest) => data)
  .handler<Promise<CreateResearchResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");

    try {
      const result = await auditMutation("create", "research", undefined, () =>
        api.createResearch(data, accessToken),
      );
      return { ok: true, data: result };
    } catch (error) {
      return mapApiError(error, "A research with this humId already exists.", {
        409: "HUMID_CONFLICT" as const,
      });
    }
  });

/**
 * Updates a research. Trusts backend validation (validator is just an identity function - to provide only type safety),
 * because it uses some logic other that just zod schema.
 * The zod schema from the backend cannot simply be put in the input validator:
 * it ignores the rawHtml but it is still required by the zod schema
 */
export const $updateResearch = createServerFn({ method: "POST" })
  .inputValidator((data: { humId: string; body: UpdateResearchRequest }) => data)
  .handler<Promise<UpdateResearchResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");

    try {
      const result = await auditMutation("update", "research", data.humId, () =>
        api.updateResearch(data.humId, data.body, accessToken),
      );

      return { ok: true, data: result };
    } catch (error) {
      return mapApiError(error, "Failed to update research.");
    }
  });

const DeleteResearchInputSchema = z.object({
  humId: HumIdParamsSchema.shape.humId,
});

export const $deleteResearch = createServerFn({ method: "POST" })
  .inputValidator(DeleteResearchInputSchema)
  .handler<Promise<DeleteResearchResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");

    try {
      await auditMutation("delete", "research", data.humId, () =>
        api.deleteResearch(data.humId, accessToken),
      );
      return { ok: true };
    } catch (error) {
      return mapApiError(error, "Failed to delete research.");
    }
  });

const GetJDSResearchInputSchema = z.object({
  id: z.string().trim().min(1),
});

export const $getJDSResearch = createServerFn({ method: "POST" })
  .inputValidator(GetJDSResearchInputSchema)
  .handler<Promise<GetJDSResearchResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");
    try {
      const result = await api.getResearchTemplate(data.id, accessToken);
      return { ok: true, data: result.data };
    } catch (error) {
      return mapApiError(error, "Failed to get J-DS research.");
    }
  });

const GetDatasetTemplateInputSchema = z.object({
  externalId: z.string().trim().min(1),
});

export const $getDatasetTemplate = createServerFn({ method: "POST" })
  .inputValidator(GetDatasetTemplateInputSchema)
  .handler<Promise<GetDatasetTemplateResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");
    try {
      const result = await api.getDatasetTemplate(data.externalId, accessToken);
      return { ok: true, data: result.data };
    } catch (error) {
      return mapApiError(error, "Failed to get dataset template.");
    }
  });

export type WorkflowActionResult =
  | { ok: true; data: WorkflowResponse }
  | {
      ok: false;
      error: string;
      code: "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED" | "CONFLICT";
    };

const WorkflowActionInputSchema = z.object({
  humId: HumIdParamsSchema.shape.humId,
});

export const $submitResearch = createServerFn({ method: "POST" })
  .inputValidator(WorkflowActionInputSchema)
  .handler<Promise<WorkflowActionResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");
    try {
      const result = await auditMutation("submit", "research", data.humId, () =>
        api.submitResearch(data.humId, accessToken),
      );
      return { ok: true, data: result };
    } catch (error) {
      return mapApiError(error, "Failed to submit research.");
    }
  });

export const $approveResearch = createServerFn({ method: "POST" })
  .inputValidator(WorkflowActionInputSchema)
  .handler<Promise<WorkflowActionResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");
    try {
      const result = await auditMutation("approve", "research", data.humId, () =>
        api.approveResearch(data.humId, accessToken),
      );
      return { ok: true, data: result };
    } catch (error) {
      return mapApiError(error, "Failed to approve research.");
    }
  });

export const $rejectResearch = createServerFn({ method: "POST" })
  .inputValidator(WorkflowActionInputSchema)
  .handler<Promise<WorkflowActionResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");
    try {
      const result = await auditMutation("reject", "research", data.humId, () =>
        api.rejectResearch(data.humId, accessToken),
      );
      return { ok: true, data: result };
    } catch (error) {
      return mapApiError(error, "Failed to reject research.");
    }
  });

export const $unpublishResearch = createServerFn({ method: "POST" })
  .inputValidator(WorkflowActionInputSchema)
  .handler<Promise<WorkflowActionResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");
    try {
      const result = await auditMutation("unpublish", "research", data.humId, () =>
        api.unpublishResearch(data.humId, accessToken),
      );
      return { ok: true, data: result };
    } catch (error) {
      return mapApiError(error, "Failed to unpublish research.");
    }
  });

export type CreateVersionResult =
  | { ok: true; data: VersionCreateResponse }
  | {
      ok: false;
      error: string;
      code: "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED" | "CONFLICT";
    };

/**
 * Creates research version. Trusts backend validator.
 * Uses identity function as inputValidator in order to get type safety.
 * The zod schema from the backend cannot simply be put in the input validator:
 * it ignores the rawHtml but it is still required by the zod schema
 */
export const $createResearchVersion = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { humId: string; releaseNote: CreateVersionRequest["releaseNote"] }) => data,
  )
  .handler<Promise<CreateVersionResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");
    try {
      const result = await auditMutation("create", "research_version", data.humId, () =>
        api.createResearchVersion(
          data.humId,
          { releaseNote: data.releaseNote ?? undefined },
          accessToken,
        ),
      );
      return { ok: true, data: result };
    } catch (error) {
      return mapApiError(error, "Failed to create version.");
    }
  });

export const $getResearches = createServerFn()
  .middleware([requestSignalMiddleware])
  .inputValidator(ResearchSearchBodySchema)
  .handler<Promise<ResearchSearchResponseWithTypedCriteria>>(({ data, context }) => {
    const accessToken = $$getJWT();

    return api.searchResearches(data, accessToken ?? undefined, context.requestSignal);
  });

const authedResearchesListSearchParamsInnerSchema = authedResearchesListSearchParamsSchema.extend(
  z.object({
    lang: localeSchema,
  }).shape,
);

type AuthedResearchesListSearchParamsInner = z.infer<
  typeof authedResearchesListSearchParamsInnerSchema
>;

/** Authed get list of researches with filters
 * If q begins with hum... , uses endpoint that supports searching with humId,
 * Uses the free text search endpoint otherwise
 */
export const $listResearches = createServerFn()
  .inputValidator(authedResearchesListSearchParamsInnerSchema)
  .handler(async ({ data }) => {
    const accessToken = $$getJWT();

    const { q, ...rest } = data;

    // if query is humId, then use search with humId
    if (q && /^hum\d+/i.test(q)) {
      return api.getResearchListPaginated(
        {
          search: {
            ...rest,
            humId: q,
            includeRawHtml: false,
            sort: "humId",
          },
        },
        accessToken ?? undefined,
      );
    } else {
      return api.searchResearches(
        {
          ...rest,
          query: q,
          includeFacets: false,
          sort: "humId",
        },
        accessToken ?? undefined,
      );
    }
  });

export function getResearchesQueryOptions(data: Omit<ResearchSearchBody, "includeFacets">) {
  return queryOptions({
    queryKey: ["researches", "list", data],
    queryFn: async () => {
      const signal = nextSearchSignal("research");

      try {
        return await $getResearches({
          data: { ...data, includeFacets: true },
          signal,
        });
      } finally {
        clearSearchSignal("research", signal);
      }
    },
    staleTime: 1000 * 60 * 5,
    // placeholderData: keepPreviousData,
  });
}

export function getAuthedResearchesInfiniteQueryOptions(
  data: AuthedResearchesListSearchParamsInner,
) {
  return infiniteQueryOptions({
    queryKey: ["researches", "list", "infinite", data] as const,
    queryFn: ({ pageParam }) =>
      $listResearches({
        data: {
          ...data,
          page: pageParam,
          limit: 20,
          order: data.order ?? "asc",
        },
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.pagination.hasNext ? lastPage.meta.pagination.page + 1 : undefined,
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });
}

export const ResearchVersionsQuerySchema = z.object({
  ...HumIdParamsSchema.shape,
  ...LangQuerySchema.shape,
});

export const $getResearchVersions = createServerFn()
  .inputValidator(ResearchVersionsQuerySchema)
  .handler<Promise<RenderedResearchVersionsListResponse>>(async ({ data }) => {
    const accessToken = $$getJWT();

    const res = await api.getResearchVersions({
      params: { humId: data.humId },
      search: { lang: data.lang, includeRawHtml: false },
      accessToken: accessToken ?? undefined,
    });

    // Render each version's releaseNote `text` into a frontend-only `renderedHtml`
    // projection. Legacy `rawHtml` is left untouched.
    return addResearchVersionsRenderedHtml(res);
  });

export function getResearchVersionsQueryOptions(
  query: z.infer<typeof ResearchVersionsQuerySchema>,
) {
  return queryOptions({
    queryKey: ["researches", "versions", query],
    queryFn: () => $getResearchVersions({ data: query }),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export const ResearchQuerySchema = z.object({
  ...HumIdParamsSchema.shape,
  ...LangVersionQuerySchema.omit({
    includeRawHtml: true,
  }).shape,
});

export const $getResearch = createServerFn()
  .inputValidator(ResearchQuerySchema)
  .handler<Promise<RenderedResearchDetailResponse>>(async ({ data }) => {
    const accessToken = $$getJWT();
    // if data.verison is undefined, dont include it
    const { humId, ...search } = filterDefined(data);

    try {
      const res = await api.getResearchDetail({
        search: { ...search, includeRawHtml: false },
        params: { humId },
        accessToken: accessToken ?? undefined,
      });

      // Render aims/methods/targets + releaseNote `text` into a frontend-only
      // `renderedHtml` projection. Legacy `rawHtml` is left untouched.
      return addResearchRenderedHtml(res);
    } catch (error) {
      // A missing research should render the NotFound component rather than
      // surfacing a raw API error. `notFound()` is a framework signal the
      // router (or the route loader) can pick up to render `notFoundComponent`.
      if (isApiNotFoundError(error)) throw notFound();
      throwSerializableApiError(error);
    }
  });

export function getResearchQueryOptions(query: z.infer<typeof ResearchQuerySchema>) {
  return queryOptions({
    queryKey: ["researches", "byId", query],
    queryFn: () => $getResearch({ data: query }),
  });
}

const ResearchEditQuerySchema = z.object({
  ...HumIdParamsSchema.shape,
  ...LangVersionQuerySchema.shape,
});

export const $getResearchForEdit = createServerFn()
  .inputValidator(ResearchEditQuerySchema)
  .handler<Promise<ResearchDetailResponse>>(({ data }) => {
    const accessToken = $$getJWT();
    const { humId, ...search } = filterDefined(data);

    return api.getResearchDetail({
      search: { ...search, includeRawHtml: true },
      params: { humId },
      accessToken: accessToken ?? undefined,
    });
  });

const ListDsApplicationsInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const $listDsApplications = createServerFn({ method: "POST" })
  .inputValidator(ListDsApplicationsInputSchema)
  .handler<Promise<DsApplicationListResponse>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");
    return api.listDsApplications({ page: data.page, limit: data.limit }, accessToken);
  });

export function getDsApplicationsQueryOptions(page: number, limit = 20) {
  return queryOptions({
    queryKey: ["jga-shinsei", "ds", { page, limit }],
    queryFn: () => $listDsApplications({ data: { page, limit } }),
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });
}

export function getResearchForEditQueryOptions(query: z.infer<typeof ResearchEditQuerySchema>) {
  return queryOptions({
    queryKey: ["researches", "byId", "edit", query],
    queryFn: () => $getResearchForEdit({ data: query }),
  });
}

export type GetResearchOwnersResult = { ok: true; data: OwnersData } | ApiErrorResult;

/**
 * Fetches the research owners, resolved server-side from the JGA DB
 * (GET /research/{humId}/owners, admin only). `owners` are Keycloak
 * `preferred_username` values; empty when no matching J-DS exists.
 */
export const $getResearchOwners = createServerFn({ method: "POST" })
  .inputValidator(z.object({ humId: HumIdParamsSchema.shape.humId }))
  .handler<Promise<GetResearchOwnersResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");
    try {
      const result = await api.getResearchOwners(data.humId, accessToken);
      return { ok: true, data: result.data };
    } catch (error) {
      return mapApiError(error, "Failed to get research owners.");
    }
  });

export function getResearchOwnersQueryOptions(humId: string) {
  return queryOptions({
    queryKey: ["researches", "owners", humId],
    queryFn: () => $getResearchOwners({ data: { humId } }),
    staleTime: 1000 * 60 * 5,
  });
}
