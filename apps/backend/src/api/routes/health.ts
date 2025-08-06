import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { HealthResponseSchema, ErrorResponseSchema } from "@/types"

const healthRoute = createRoute({
  method: "get",
  path: "/",
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
    500: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Internal Server Error",
    },
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
    console.error("Response validation error:", error)
    return c.json({
      error: "Internal Server Error",
      message: `An unexpected error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, 500)
  }
})
