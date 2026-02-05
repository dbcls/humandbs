import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { ErrorSpec500 } from "@/api/routes/errors"
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

healthRouter.openapi(healthRoute, (c) => {
  const response = {
    status: "ok",
    timestamp: new Date().toISOString(),
  }
  // No validation needed - schema is simple and data is trusted
  return c.json(response, 200)
})
