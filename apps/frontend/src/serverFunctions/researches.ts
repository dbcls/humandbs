import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  CreateResearchRequest,
  CreateVersionRequest,
  ResearchDetailResponse,
  ResearchSearchBody,
  ResearchWithLockResponse,
  UpdateResearchRequest,
  UpdateUidsRequest,
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
import { api, mapApiError } from "@/services/backend";
import { throwSerializableApiError } from "@/utils/errors";
import { filterDefined } from "@/utils/filter-defined";
import { $$getJWT } from "@/utils/jwt-helpers";
import { renderMarkdown } from "@/utils/markdown";
import { authedResearchesListSearchParamsSchema } from "@/utils/query-params";
import { clearSearchSignal, nextSearchSignal } from "@/utils/search-signals";

import type { DsApplicationListResponse } from "../../../backend/src/api/types";
import type {
  DatasetTemplateData,
  ResearchTemplateData,
} from "../../../backend/src/api/types/templates";
import { $renderMarkdown } from "./markdown";

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
  | { ok: true; data: ResearchTemplateData }
  | {
      ok: false;
      error: string;
      code: "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED";
    };

export type GetDatasetTemplateResult =
  | { ok: true; data: DatasetTemplateData }
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
  .inputValidator((data: { humId: string; body: UpdateResearchRequest }) => data)
  .handler<Promise<UpdateResearchResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");

    try {
      const result = await api.updateResearch(data.humId, data.body, accessToken);

      return { ok: true, data: result };
    } catch (error) {
      return mapApiError(error, "Failed to update research.");
    }
  });

/**
 * Patches a published research in place (no version bump). Mirrors $updateResearch
 * — same body and lock-bearing response — differing only in the backend endpoint
 * (`/patch` vs `/update`). Trusts backend validation (validator is an identity
 * function, for type safety only); the backend rejects a patch unless the research
 * status is `published`, surfaced here as a CONFLICT.
 */
export const $patchResearch = createServerFn({ method: "POST" })
  .inputValidator((data: { humId: string; body: UpdateResearchRequest }) => data)
  .handler<Promise<UpdateResearchResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");

    try {
      const result = await api.patchResearch(data.humId, data.body, accessToken);

      return { ok: true, data: result };
    } catch (error) {
      return mapApiError(error, "Failed to patch research.");
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
    (data: { humId: string; releaseNote: CreateVersionRequest["releaseNote"] }) => data,
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
  .handler(async ({ data }) => {
    const accessToken = $$getJWT();

    const res = await api.getResearchVersions({
      params: { humId: data.humId },
      search: { lang: data.lang, includeRawHtml: false },
      accessToken: accessToken ?? undefined,
    });

    for (const version of res.data) {
      if (version.releaseNote.en) {
        version.releaseNote.en.rawHtml = await $renderMarkdown({
          data: { raw: version.releaseNote.en.text },
        });
      }

      if (version.releaseNote.ja) {
        version.releaseNote.ja.rawHtml = await $renderMarkdown({
          data: { raw: version.releaseNote.ja.text },
        });
      }
    }

    return res;
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
      const res = await api.getResearchDetail({
        search: { ...search, includeRawHtml: false },
        params: { humId },
        accessToken: accessToken ?? undefined,
      });

      if (res.data.summary.targets.en) {
        res.data.summary.targets.en.rawHtml = await $renderMarkdown({
          data: { raw: res.data.summary.targets.en.text },
        });
      }
      if (res.data.summary.targets.ja) {
        res.data.summary.targets.ja.rawHtml = await $renderMarkdown({
          data: { raw: res.data.summary.targets.ja.text },
        });
      }
      if (res.data.releaseNote.en) {
        res.data.releaseNote.en.rawHtml = await $renderMarkdown({
          data: { raw: res.data.releaseNote.en.text },
        });
      }
      if (res.data.releaseNote.ja) {
        res.data.releaseNote.ja.rawHtml = await $renderMarkdown({
          data: { raw: res.data.releaseNote.ja.text },
        });
      }

      return res;
    } catch (error) {
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
