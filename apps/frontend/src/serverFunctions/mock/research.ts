import type {
  ResearchesResponse,
  ResearchSummary,
} from "@humandbs/backend/types";
import { createServerFn } from "@tanstack/react-start";
import path from "node:path";
import { z } from "zod";

import { localeSchema } from "@/config/i18n-config";
import { filterStringSchema, paginationSchema } from "@/utils/searchParams";

const getResearchListInputSchema = paginationSchema;

export const $getResearchList = createServerFn({ method: "GET" })
  .inputValidator(getResearchListInputSchema.extend(filterStringSchema.shape))
  .handler(async ({ data }) => {
    const allResearchItems = (await Bun.file(
      path.join(
        import.meta.dirname,
        "..",
        "..",
        "scripts",
        "mock-data",
        "research-list.json"
      )
    ).json()) as ResearchSummary[];

    const filterString = data.filter;

    let filteredResearchItems = allResearchItems;

    // Filter and apply pagination. If no filter set, do not filter
    if (filterString) {
      filteredResearchItems = allResearchItems.filter((item) =>
        item.title.includes(filterString)
      );
    }

    // Apply pagination
    const { page, limit } = data;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const pageItems = filteredResearchItems.slice(startIndex, endIndex);

    const result: ResearchesResponse = {
      data: pageItems,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(filteredResearchItems.length / limit),
        total: filteredResearchItems.length,
        hasNext: page < Math.ceil(filteredResearchItems.length / limit),
        hasPrev: page > 1,
      },
    };

    return result;
  });

export const $getResearch = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      humId: z.string(),
      lang: localeSchema,
      ver: z.string(),
    })
  )
  .handler(async ({ data }) => {});
