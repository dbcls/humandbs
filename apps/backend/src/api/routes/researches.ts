import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { searchResearches } from "@/api/es-client"
import { ResearchesQuerySchema, ResearchesResponseSchema } from "@/types"

import { ErrorSpec500 } from "./errors"

const listResearchesRoute = createRoute({
  method: "get",
  path: "/",
  summary: "List Research Summaries",
  description: "Get a paginated list of research summaries with optional filtering and sorting",
  request: {
    query: ResearchesQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ResearchesResponseSchema,
        },
      },
      description: "List of research summaries",
    },
    500: ErrorSpec500,
  },
})

export const researchesRouter = new OpenAPIHono()

// GET /researches - List research summaries
researchesRouter.openapi(listResearchesRoute, async (c) => {
  try {
    const query = ResearchesQuerySchema.parse(c.req.query())
    const researches = await searchResearches(query)
    const validatedResponse = ResearchesResponseSchema.parse(researches)

    return c.json(validatedResponse, 200)
  } catch (error) {
    console.error("Error fetching research summaries:", error)
    return c.json({
      error: "Internal Server Error",
      message: `An unexpected error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, 500)
  }
})
