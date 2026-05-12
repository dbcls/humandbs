import {
  HumIdParamsSchema,
  LangQuerySchema,
  LangVersionQuerySchema,
  ResearchSearchBodySchema,
  type CreateResearchRequest,
  type CreateVersionRequest,
  type ResearchDetailResponse,
  type ResearchSearchBody,
  type ResearchSearchResponse,
  type ResearchWithLockResponse,
  type UpdateResearchRequest,
  type UpdateUidsRequest,
  type VersionCreateResponse,
  type WorkflowResponse,
} from "@humandbs/backend/types";
import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { localeSchema } from "@/config/i18n";
import { api, mapApiError } from "@/services/backend";
import { filterDefined } from "@/utils/filterDefined";
import { $$getJWT } from "@/utils/jwt-helpers";
import { authedResearchesListSearchParamsSchema } from "@/utils/queryParams";
import { requestSignalMiddleware } from "@/middleware/requestSignalMiddleware";
import { throwSerializableApiError } from "@/utils/errors";
import type { DeepOmit } from "@/utils/typeUtils";

export type CreateResearchResult =
  | { ok: true; data: ResearchWithLockResponse }
  | { ok: false; error: string; code?: "HUMID_CONFLICT" };
export type UpdateResearchResult =
  | { ok: true; data: ResearchWithLockResponse }
  | {
      ok: false;
      error: string;
      code: "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED";
    };
export type UpdateResearchUidsResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code: "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED";
    };
export type DeleteResearchResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code: "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED";
    };
export type GetJDSResearchResult =
  | { ok: true; data: DeepOmit<ResearchDetailResponse, "rawHtml"> }
  | {
      ok: false;
      error: string;
      code: "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED";
    };

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
      const result = await api.createResearch(data, accessToken);
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
  .inputValidator(
    (data: { humId: string; body: UpdateResearchRequest }) => data,
  )
  .handler<Promise<UpdateResearchResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");

    try {
      const result = await api.updateResearch(
        data.humId,
        data.body,
        accessToken,
      );

      return { ok: true, data: result };
    } catch (error) {
      return mapApiError(error, "Failed to update research.");
    }
  });

/**
 * Creates a research uids. Trusts backend validation (validator is just an identity function - to provide only type safety),
 * because it uses some logic other that just zod schema.
 * The zod schema from the backend cannot simply be put in the input validator:
 * it ignores the rawHtml but it is still required by the zod schema
 */
export const $updateResearchUids = createServerFn({ method: "POST" })
  .inputValidator((data: { humId: string; body: UpdateUidsRequest }) => data)
  .handler<Promise<UpdateResearchUidsResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");

    try {
      await api.updateResearchUids(data.humId, data.body, accessToken);
      return { ok: true };
    } catch (error) {
      return mapApiError(error, "Failed to update research uids.");
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

    console.log("$deleteResearch", data.humId);
    try {
      await api.deleteResearch(data.humId, accessToken);
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
    try {
      const result = await api.getJDSResearch(data.id);
      return { ok: true, data: result };
    } catch (error) {
      return mapApiError(error, "Failed to get J-DS research.");
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
      const result = await api.submitResearch(data.humId, accessToken);
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
      const result = await api.approveResearch(data.humId, accessToken);
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
      const result = await api.rejectResearch(data.humId, accessToken);
      return { ok: true, data: result };
    } catch (error) {
      return mapApiError(error, "Failed to reject research.");
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
    (data: {
      humId: string;
      releaseNote: CreateVersionRequest["releaseNote"];
    }) => data,
  )
  .handler<Promise<CreateVersionResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");
    try {
      const result = await api.createResearchVersion(
        data.humId,
        { releaseNote: data.releaseNote ?? undefined },
        accessToken,
      );
      return { ok: true, data: result };
    } catch (error) {
      return mapApiError(error, "Failed to create version.");
    }
  });

export const $getResearches = createServerFn()
  .middleware([requestSignalMiddleware])
  .inputValidator(ResearchSearchBodySchema)
  .handler<Promise<ResearchSearchResponse>>(({ data, context }) => {
    const accessToken = $$getJWT();

    return api.searchResearches(
      data,
      accessToken ?? undefined,
      context.requestSignal,
    );
  });

const authedResearchesListSearchParamsInnerSchema =
  authedResearchesListSearchParamsSchema.extend(
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

    // if query is humIdm then use search with humId
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
      console.log("searching by text query ", q);
      return api.searchResearches(
        {
          query: q,
          includeFacets: false,
          sort: "humId",
          ...rest,
        },
        accessToken ?? undefined,
      );
    }
  });

export function getResearchesQueryOptions(
  data: Omit<ResearchSearchBody, "includeFacets">,
) {
  return queryOptions({
    queryKey: ["researches", "list", data],
    queryFn: ({ signal }) =>
      $getResearches({ data: { ...data, includeFacets: true }, signal }),
    staleTime: 1000 * 60 * 5, // 5 minutes,
    placeholderData: keepPreviousData,
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
      lastPage.meta.pagination.hasNext
        ? lastPage.meta.pagination.page + 1
        : undefined,
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
  .handler(({ data }) => {
    const accessToken = $$getJWT();
    return api.getResearchVersions({
      params: { humId: data.humId },
      search: { lang: data.lang, includeRawHtml: false },
      accessToken: accessToken ?? undefined,
    });
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
  .handler(async ({ data }) => {
    const accessToken = $$getJWT();
    // if data.verison is undefined, dont include it
    const { humId, ...search } = filterDefined(data);

    try {
      return await api.getResearchDetail({
        search: { ...search, includeRawHtml: false },
        params: { humId },
        accessToken: accessToken ?? undefined,
      });
    } catch (error) {
      throwSerializableApiError(error);
    }
  });

export function getResearchQueryOptions(
  query: z.infer<typeof ResearchQuerySchema>,
) {
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

export function getResearchForEditQueryOptions(
  query: z.infer<typeof ResearchEditQuerySchema>,
) {
  return queryOptions({
    queryKey: ["researches", "byId", "edit", query],
    queryFn: () => $getResearchForEdit({ data: query }),
  });
}
