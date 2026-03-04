import {
  CreateResearchRequestSchema,
  HumIdParamsSchema,
  LangQuerySchema,
  LangVersionQuerySchema,
  ResearchSearchBodySchema,
  UpdateResearchRequestSchema,
  UpdateUidsRequestSchema,
  type ResearchDetailResponse,
  type ResearchSearchBody,
  type ResearchSearchUnifiedResponse,
  type ResearchWithLockResponse,
} from "@humandbs/backend/types";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { api, APIError } from "@/services/backend";
import { filterDefined } from "@/utils/filterDefined";
import { $$getJWT } from "@/utils/jwt-helpers";

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
  .inputValidator(CreateResearchRequestSchema)
  .handler<Promise<CreateResearchResult>>(async ({ data }) => {
    const accessToken = $$getJWT();
    if (!accessToken) throw new Error("Unauthorized");

    try {
      const result = await api.createResearch(data, accessToken);
      return { ok: true, data: result };
    } catch (error) {
      if (error instanceof APIError && error.status === 409) {
        const detail =
          (error.data as { detail?: string } | undefined)?.detail ??
          "A research with this humId already exists.";
        return { ok: false, error: detail, code: "HUMID_CONFLICT" };
      }
      throw error;
    }
  });

const UpdateResearchInputSchema = z.object({
  humId: HumIdParamsSchema.shape.humId,
  body: UpdateResearchRequestSchema,
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
      if (error instanceof APIError) {
        const detail =
          (error.data as { detail?: string } | undefined)?.detail ??
          "Failed to update research.";
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
      if (error instanceof APIError) {
        const detail =
          (error.data as { detail?: string } | undefined)?.detail ??
          "Failed to update research uids.";
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
      if (error instanceof APIError) {
        const detail =
          (error.data as { detail?: string } | undefined)?.detail ??
          "Failed to delete research.";
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

export const $getResearches = createServerFn()
  .inputValidator(ResearchSearchBodySchema)
  .handler<Promise<ResearchSearchUnifiedResponse>>(({ data }) => {
    const accessToken = $$getJWT();
    return api.searchResearches(data, accessToken ?? undefined);
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

export const ResearchVersionsQuerySchema = z.object({
  ...HumIdParamsSchema.shape,
  ...LangQuerySchema.shape,
});

export const $getResearchVersions = createServerFn()
  .inputValidator(ResearchVersionsQuerySchema)
  .handler(({ data }) =>
    api.getResearchVersions({
      params: { humId: data.humId },
      search: { lang: data.lang, includeRawHtml: false },
    }),
  );

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
