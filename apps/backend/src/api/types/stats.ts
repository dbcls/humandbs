/**
 * Schemas for the public stats endpoint (GET /stats).
 */
import "@hono/zod-openapi"
import { z } from "zod"

/**
 * Stats facet counts per Research/Dataset
 */
export const StatsFacetCountSchema = z.object({
  research: z
    .number()
    .describe("Number of Research resources with this facet value"),
  dataset: z
    .number()
    .describe("Number of Dataset resources with this facet value"),
})
export type StatsFacetCount = z.infer<typeof StatsFacetCountSchema>

/**
 * Stats response (GET /stats)
 * Returns counts and facets for published resources
 * Facets include both Research and Dataset counts per value
 */
export const StatsResponseSchema = z.object({
  research: z
    .object({
      total: z
        .number()
        .describe("Total number of published Research resources"),
    })
    .describe("Research resource statistics"),
  dataset: z
    .object({
      total: z.number().describe("Total number of published Dataset resources"),
    })
    .describe("Dataset resource statistics"),
  facets: z
    .record(z.string(), z.record(z.string(), StatsFacetCountSchema))
    .describe(
      "Facet aggregations with Research/Dataset counts per value. Outer key is field name (e.g., 'criteria'), inner key is facet value.",
    ),
})
export type StatsResponse = z.infer<typeof StatsResponseSchema>
