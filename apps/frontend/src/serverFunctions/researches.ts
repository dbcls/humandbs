import {
  HumIdParamsSchema,
  LangQuerySchema,
  LangVersionQuerySchema,
  ResearchSearchBodySchema,
  type ResearchSearchBody,
  type ResearchSearchUnifiedResponse,
} from "@humandbs/backend/types";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { api } from "@/services/backend";
import { filterDefined } from "@/utils/filterDefined";
import { $$getJWT } from "@/utils/jwt-helpers";

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
    // if data.verison is undefined, dont include it
    const { humId, ...search } = filterDefined(data);

    return api.getResearchDetail({
      search: { ...search, includeRawHtml: false },
      params: { humId },
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
