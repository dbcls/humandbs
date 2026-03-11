/**
 * JGA Shinsei API Routes
 *
 * DS (データ提供申請) / DU (データ利用申請) の read-only エンドポイント。
 * 全ルートに admin 認証が必要。
 */
import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import {
  listDsApplications,
  getDsApplication,
  listDuApplications,
  getDuApplication,
} from "@/api/es-client/jga-shinsei"
import { listResponse, singleReadOnlyResponse } from "@/api/helpers/response"
import { requireAdmin, requireAuth } from "@/api/middleware/auth"
import { ErrorSpec401, ErrorSpec403, ErrorSpec404, ErrorSpec500 } from "@/api/routes/errors"
import {
  createPagination,
  PaginationQuerySchema,
  JdsIdParamsSchema,
  JduIdParamsSchema,
  DsApplicationListResponseSchema,
  DsApplicationDetailResponseSchema,
  DuApplicationListResponseSchema,
  DuApplicationDetailResponseSchema,
} from "@/api/types"

// === Route Definitions ===

const listDsRoute = createRoute({
  method: "get",
  path: "/ds",
  tags: ["JGA Shinsei"],
  summary: "List DS Applications",
  description: "List all DS (data submission) applications. Requires admin authentication.",
  request: {
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DsApplicationListResponseSchema } },
      description: "List of DS applications",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    500: ErrorSpec500,
  },
})

const getDsRoute = createRoute({
  method: "get",
  path: "/ds/{jdsId}",
  tags: ["JGA Shinsei"],
  summary: "Get DS Application",
  description: "Get a single DS application by jdsId. Requires admin authentication.",
  request: {
    params: JdsIdParamsSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DsApplicationDetailResponseSchema } },
      description: "DS application detail",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const listDuRoute = createRoute({
  method: "get",
  path: "/du",
  tags: ["JGA Shinsei"],
  summary: "List DU Applications",
  description: "List all DU (data use) applications. Requires admin authentication.",
  request: {
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DuApplicationListResponseSchema } },
      description: "List of DU applications",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    500: ErrorSpec500,
  },
})

const getDuRoute = createRoute({
  method: "get",
  path: "/du/{jduId}",
  tags: ["JGA Shinsei"],
  summary: "Get DU Application",
  description: "Get a single DU application by jduId. Requires admin authentication.",
  request: {
    params: JduIdParamsSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DuApplicationDetailResponseSchema } },
      description: "DU application detail",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

// === Router ===

export const jgaShinseiRouter = new OpenAPIHono()

// All routes require admin auth
jgaShinseiRouter.use("*", requireAuth)
jgaShinseiRouter.use("*", requireAdmin)

// DS endpoints
jgaShinseiRouter.openapi(listDsRoute, async (c) => {
  const { page, limit } = c.req.valid("query")
  const { hits, total } = await listDsApplications(page, limit)
  const pagination = createPagination(total, page, limit)
  return listResponse(c, hits, pagination)
})

jgaShinseiRouter.openapi(getDsRoute, async (c) => {
  const { jdsId } = c.req.valid("param")
  const doc = await getDsApplication(jdsId)
  return singleReadOnlyResponse(c, doc)
})

// DU endpoints
jgaShinseiRouter.openapi(listDuRoute, async (c) => {
  const { page, limit } = c.req.valid("query")
  const { hits, total } = await listDuApplications(page, limit)
  const pagination = createPagination(total, page, limit)
  return listResponse(c, hits, pagination)
})

jgaShinseiRouter.openapi(getDuRoute, async (c) => {
  const { jduId } = c.req.valid("param")
  const doc = await getDuApplication(jduId)
  return singleReadOnlyResponse(c, doc)
})
