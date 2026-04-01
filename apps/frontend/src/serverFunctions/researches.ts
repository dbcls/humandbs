import {
  FrontendCreateResearchRequestSchema,
  FrontendUpdateResearchRequestSchema,
} from "@/utils/researchSchemas";
import {
  HumIdParamsSchema,
  LangQuerySchema,
  LangVersionQuerySchema,
  ResearchSearchBodySchema,
  UpdateUidsRequestSchema,
  type ResearchDetailResponse,
  type ResearchSearchBody,
  type ResearchSearchResponse,
  type ResearchWithLockResponse,
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

export const $createResearch = createServerFn({ method: "POST" })
  .inputValidator(FrontendCreateResearchRequestSchema)
  .handler<Promise<CreateResearchResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");

    try {
      const result = await api.createResearch(data, accessToken);
      return { ok: true, data: result };
    } catch (error) {
      return mapApiError(error, "A research with this humId already exists.", { 409: "HUMID_CONFLICT" as const });
    }
  });

const UpdateResearchInputSchema = z.object({
  humId: HumIdParamsSchema.shape.humId,
  body: FrontendUpdateResearchRequestSchema,
});

export const $updateResearch = createServerFn({ method: "POST" })
  .inputValidator(UpdateResearchInputSchema)
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

const UpdateResearchUidsInputSchema = z.object({
  humId: HumIdParamsSchema.shape.humId,
  body: UpdateUidsRequestSchema,
});

export const $updateResearchUids = createServerFn({ method: "POST" })
  .inputValidator(UpdateResearchUidsInputSchema)
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

    try {
      await api.deleteResearch(data.humId, accessToken);
      return { ok: true };
    } catch (error) {
      return mapApiError(error, "Failed to delete research.");
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

const CreateVersionInputSchema = z.object({
  humId: HumIdParamsSchema.shape.humId,
  releaseNote: z
    .object({
      en: z.object({ text: z.string(), rawHtml: z.string() }).nullable(),
      ja: z.object({ text: z.string(), rawHtml: z.string() }).nullable(),
    })
    .optional(),
});

export const $createResearchVersion = createServerFn({ method: "POST" })
  .inputValidator(CreateVersionInputSchema)
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
  .inputValidator(ResearchSearchBodySchema)
  .handler<Promise<ResearchSearchResponse>>(({ data }) => {
    const accessToken = $$getJWT();

    console.log("$getResearches calling api with ", data);
    return api.searchResearches(data, accessToken ?? undefined);
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
      console.log("searching by humId ", q);
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
    queryFn: () => $getResearches({ data: { ...data, includeFacets: true } }),
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
  .handler(({ data }) => {
    const accessToken = $$getJWT();
    // if data.verison is undefined, dont include it
    const { humId, ...search } = filterDefined(data);

    return api.getResearchDetail({
      search: { ...search, includeRawHtml: false },
      params: { humId },
      accessToken: accessToken ?? undefined,
    });
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
