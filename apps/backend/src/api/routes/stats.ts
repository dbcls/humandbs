/**
 * Stats API Routes
 *
 * Public-facing statistics about published Research and Dataset resources.
 * The actual ES aggregation lives in `@/api/es-client/stats`.
 */
import { createRoute } from "@hono/zod-openapi"

import { getPublicStats } from "@/api/es-client/stats"
import { createOpenAPIHono } from "@/api/helpers/openapi-hono"
import { singleReadOnlyResponse } from "@/api/helpers/response"
import { SECURITY_PUBLIC } from "@/api/openapi/document"
import { exampleStatsSingleResponse } from "@/api/openapi/examples"
import { ErrorSpec500 } from "@/api/routes/errors"
import { createSingleReadOnlyResponseSchema, StatsResponseSchema } from "@/api/types"

// === Response Schema ===

const StatsWrappedResponseSchema = createSingleReadOnlyResponseSchema(StatsResponseSchema)

// === Route Definition ===

const getStatsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Stats"],
  operationId: "getStats",
  summary: "Get Statistics",
  description: "Get statistics about published Research and Dataset resources, including counts and facets with Research/Dataset breakdown. Only published resources are aggregated.",
  security: SECURITY_PUBLIC,
  responses: {
    200: {
      content: { "application/json": { schema: StatsWrappedResponseSchema, example: exampleStatsSingleResponse } },
      description: "Statistics about published resources",
    },
    500: ErrorSpec500,
  },
})

// === Router ===

export const statsRouter = createOpenAPIHono()

statsRouter.openapi(getStatsRoute, async (c) => {
  const stats = await getPublicStats()
  return singleReadOnlyResponse(c, stats)
})
