/**
 * JGA Shinsei API Routes
 *
 * DS (データ提供申請) / DU (データ利用申請) の read-only エンドポイント。
 * すべて版 (appl_id) 単位で操作する。全ルートに admin 認証が必要。
 */
import { createRoute } from "@hono/zod-openapi"

import {
  listDsApplications,
  getDsApplication,
  listDuApplications,
  getDuApplication,
} from "@/api/db-client/jga-shinsei"
import { createOpenAPIHono } from "@/api/helpers/openapi-hono"
import { listResponse, singleReadOnlyResponse } from "@/api/helpers/response"
import { requireAdmin, requireAuth } from "@/api/middleware/auth"
import { SECURITY_REQUIRES_AUTH } from "@/api/openapi/document"
import {
  exampleDsApplicationDetailResponse,
  exampleDsApplicationListResponse,
  exampleDuApplicationDetailResponse,
  exampleDuApplicationListResponse,
} from "@/api/openapi/examples"
import { ErrorSpec400, ErrorSpec401, ErrorSpec403, ErrorSpec404, ErrorSpec500 } from "@/api/routes/errors"
import {
  createPagination,
  JdsApplIdParamsSchema,
  JduApplIdParamsSchema,
  JgaShinseiDsListQuerySchema,
  JgaShinseiDuListQuerySchema,
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
  operationId: "listDsApplications",
  summary: "List DS Application Versions",
  description: "**Authorization:** Admin only.\n\nList all DS (data submission) application versions. "
    + "Use `dsDuId` query parameter to filter by master DS ID.",
  security: SECURITY_REQUIRES_AUTH,
  "x-admin-only": true,
  request: {
    query: JgaShinseiDsListQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DsApplicationListResponseSchema, example: exampleDsApplicationListResponse } },
      description: "List of DS application versions",
    },
    400: ErrorSpec400,
    401: ErrorSpec401,
    403: ErrorSpec403,
    500: ErrorSpec500,
  },
})

const getDsRoute = createRoute({
  method: "get",
  path: "/ds/{jdsApplId}",
  tags: ["JGA Shinsei"],
  operationId: "getDsApplication",
  summary: "Get DS Application Version",
  description: "**Authorization:** Admin only.\n\nGet a single DS application version by version ID (e.g., J-DS002494-001).",
  security: SECURITY_REQUIRES_AUTH,
  "x-admin-only": true,
  request: {
    params: JdsApplIdParamsSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DsApplicationDetailResponseSchema, example: exampleDsApplicationDetailResponse } },
      description: "DS application version detail",
    },
    400: ErrorSpec400,
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
  operationId: "listDuApplications",
  summary: "List DU Application Versions",
  description: "**Authorization:** Admin only.\n\nList all DU (data use) application versions. "
    + "Use `dsDuId` query parameter to filter by master DU ID.",
  security: SECURITY_REQUIRES_AUTH,
  "x-admin-only": true,
  request: {
    query: JgaShinseiDuListQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DuApplicationListResponseSchema, example: exampleDuApplicationListResponse } },
      description: "List of DU application versions",
    },
    400: ErrorSpec400,
    401: ErrorSpec401,
    403: ErrorSpec403,
    500: ErrorSpec500,
  },
})

const getDuRoute = createRoute({
  method: "get",
  path: "/du/{jduApplId}",
  tags: ["JGA Shinsei"],
  operationId: "getDuApplication",
  summary: "Get DU Application Version",
  description: "**Authorization:** Admin only.\n\nGet a single DU application version by version ID (e.g., J-DU006498-001).",
  security: SECURITY_REQUIRES_AUTH,
  "x-admin-only": true,
  request: {
    params: JduApplIdParamsSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DuApplicationDetailResponseSchema, example: exampleDuApplicationDetailResponse } },
      description: "DU application version detail",
    },
    400: ErrorSpec400,
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

// === Router ===

export const jgaShinseiRouter = createOpenAPIHono()

// All routes require admin auth
jgaShinseiRouter.use("*", requireAuth)
jgaShinseiRouter.use("*", requireAdmin)

// DS endpoints
jgaShinseiRouter.openapi(listDsRoute, async (c) => {
  const { page, limit, dsDuId } = c.req.valid("query")
  const { hits, total } = await listDsApplications(page, limit, dsDuId)
  const pagination = createPagination(total, page, limit)
  return listResponse(c, hits, pagination)
})

jgaShinseiRouter.openapi(getDsRoute, async (c) => {
  const { jdsApplId } = c.req.valid("param")
  const doc = await getDsApplication(jdsApplId)
  return singleReadOnlyResponse(c, doc)
})

// DU endpoints
jgaShinseiRouter.openapi(listDuRoute, async (c) => {
  const { page, limit, dsDuId } = c.req.valid("query")
  const { hits, total } = await listDuApplications(page, limit, dsDuId)
  const pagination = createPagination(total, page, limit)
  return listResponse(c, hits, pagination)
})

jgaShinseiRouter.openapi(getDuRoute, async (c) => {
  const { jduApplId } = c.req.valid("param")
  const doc = await getDuApplication(jduApplId)
  return singleReadOnlyResponse(c, doc)
})
