import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { getResearchDetail, listResearchSummaries, listResearchVersionsSorted } from "@/api/es-client"
import { ErrorSpec404, ErrorSpec500 } from "@/api/routes/errors"
import { LangVersionQuerySchema, HumIdParamsSchema, ResearchesQuerySchema, ResearchesResponseSchema, LangQuerySchema, ResearchVersionsResponseSchema, ResearchDetailSchema } from "@/types"
import type { ResearchesQuery, HumIdParams, LangVersionQuery, LangQuery } from "@/types"

const listResearchSummariesRoute = createRoute({
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

const getResearchDetailRoute = createRoute({
  method: "get",
  path: "/{humId}",
  summary: "Get Research Detail",
  description: "Get detailed information about a specific research by its humId",
  request: {
    params: HumIdParamsSchema,
    query: LangVersionQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ResearchDetailSchema,
        },
      },
      description: "Detailed information about the research",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const listResearchVersionsRoute = createRoute({
  method: "get",
  path: "/{humId}/versions",
  summary: "List Research Versions",
  description: "List version metadata for a research.",
  request: {
    params: HumIdParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ResearchVersionsResponseSchema,
        },
      },
      description: "Versions of the research",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

export const researchesRouter = new OpenAPIHono()

// GET /researches - List research summaries
researchesRouter.openapi(listResearchSummariesRoute, async (c) => {
  try {
    const query = c.req.query() as unknown as ResearchesQuery
    const researches = await listResearchSummaries(query)
    return c.json(researches, 200)
  } catch (error) {
    console.error("Error fetching research summaries:", error)
    return c.json({
      error: "Internal Server Error",
      message: `An unexpected error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, 500)
  }
})

// GET /researches/{humId} - Get research detail
researchesRouter.openapi(getResearchDetailRoute, async (c) => {
  try {
    const { humId } = c.req.param() as unknown as HumIdParams
    const query = c.req.query() as unknown as LangVersionQuery
    const detail = await getResearchDetail(humId, query)
    if (!detail) return c.json({ error: `Research with humId ${humId} not found` }, 404)
    return c.json(detail, 200)
  } catch (error) {
    console.error(`Error fetching research detail for humId ${c.req.param("humId")}:`, error)
    return c.json({
      error: "Internal Server Error",
      message: `An unexpected error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, 500)
  }
})

// GET /researches/{humId}/versions - List research versions
researchesRouter.openapi(listResearchVersionsRoute, async (c) => {
  try {
    const { humId } = c.req.param() as unknown as HumIdParams
    const query = c.req.query() as unknown as LangQuery
    const versions = await listResearchVersionsSorted(humId, query.lang)
    if (versions === null) return c.json({ error: `Research with humId ${humId} not found` }, 404)
    return c.json({ data: versions }, 200)
  } catch (error) {
    console.error(`Error fetching research versions for humId ${c.req.param("humId")}:`, error)
    return c.json({
      error: "Internal Server Error",
      message: `An unexpected error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, 500)
  }
})
