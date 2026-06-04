import { z } from "zod";

import { ResearchListingQuerySchema, ResearchSearchBodySchema } from "@humandbs/backend/types";

/** Filter params for the authed researches list page search params,
 *  where text could be humId of free-text query
 * lang not needed because use context
 * pagination also not needed because infinite scroll
 */
export const authedResearchesListSearchParamsSchema = ResearchListingQuerySchema.extend(
  ResearchSearchBodySchema.shape,
)
  .pick({
    sort: true,
    order: true,
    status: true,
    page: true,
    limit: true,
  })
  .extend(
    z.object({
      q: z.string().optional(),
    }).shape,
  );

export type AuthedResearchesListSearchParams = z.infer<
  typeof authedResearchesListSearchParamsSchema
>;

export const newsAdminSearchParamsSchema = z.object({
  selectedId: z.string().optional(),
  q: z.string().optional(),
  publishedFrom: z.string().optional(),
  publishedTo: z.string().optional(),
  tagIds: z.array(z.string()).optional(),
});

export type NewsAdminSearchParams = z.infer<typeof newsAdminSearchParamsSchema>;

export const alertsAdminSearchParamsSchema = z.object({
  selectedId: z.string().optional(),
  q: z.string().optional(),
  activeFrom: z.string().optional(),
  activeTo: z.string().optional(),
});

export type AlertsAdminSearchParams = z.infer<typeof alertsAdminSearchParamsSchema>;

export const newsPublicSearchParamsSchema = z.object({
  q: z.string().optional(),
  publishedFrom: z.string().optional(),
  publishedTo: z.string().optional(),
  tagIds: z.array(z.string()).optional(),
});

export type NewsPublicSearchParams = z.infer<typeof newsPublicSearchParamsSchema>;
