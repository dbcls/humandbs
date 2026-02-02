import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { logger } from "@/api/logger"
import { getRequestId } from "@/api/middleware/request-id"
import { ErrorSpec500, serverErrorResponse } from "@/api/routes/errors"
import { HealthResponseSchema } from "@/types"

const healthRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Health"],
  summary: "Health Check",
  description: "Check the health status of the API",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
      description: "API is healthy",
    },
    500: ErrorSpec500,
  },
})

export const healthRouter = new OpenAPIHono()

healthRouter.openapi(healthRoute, async (c) => {
  try {
    const response = {
      status: "ok",
      timestamp: new Date().toISOString(),
    }
    const validatedResponse = HealthResponseSchema.parse(response)

    return c.json(validatedResponse, 200)
  } catch (error) {
    const requestId = getRequestId(c)
    logger.error("Response validation error", { requestId, error: String(error) })
    return serverErrorResponse(c, error)
  }
})
