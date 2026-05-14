import { createRoute } from "@hono/zod-openapi"

import { createOpenAPIHono } from "@/api/helpers/openapi-hono"
import { SECURITY_PUBLIC } from "@/api/openapi/document"
import { exampleHealthResponse } from "@/api/openapi/examples"
import { ErrorSpec500 } from "@/api/routes/errors"
import { HealthResponseSchema } from "@/types"

const healthRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Health"],
  operationId: "getHealth",
  summary: "Health Check",
  description: "Check the health status of the API",
  security: SECURITY_PUBLIC,
  responses: {
    200: {
      content: {
        "application/json": {
          schema: HealthResponseSchema,
          example: exampleHealthResponse,
        },
      },
      description: "API is healthy",
    },
    500: ErrorSpec500,
  },
})

export const healthRouter = createOpenAPIHono()

healthRouter.openapi(healthRoute, (c) => {
  const response = {
    status: "ok",
    timestamp: new Date().toISOString(),
  }
  // No validation needed - schema is simple and data is trusted
  return c.json(response, 200)
})
