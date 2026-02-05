/**
 * Admin API Routes
 *
 * Handles administrative operations.
 * All routes require admin authentication.
 *
 * Note: /admin/pending-reviews has been removed.
 * Use GET /research?status=review instead (admin only).
 */
import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { singleReadOnlyResponse } from "@/api/helpers/response"
import { requireAuth } from "@/api/middleware/auth"
import { ErrorSpec401, ErrorSpec500, UnauthorizedError } from "@/api/routes/errors"
import { createUnifiedSingleReadOnlyResponseSchema, IsAdminResponseSchema } from "@/api/types"

// === Unified Response Schemas ===

// Admin status response (read-only)
const IsAdminUnifiedResponseSchema = createUnifiedSingleReadOnlyResponseSchema(IsAdminResponseSchema)

// === Route Definitions ===

const isAdminRoute = createRoute({
  method: "get",
  path: "/is-admin",
  tags: ["Admin"],
  summary: "Check Admin Status",
  description: "Check if the current user is an admin. Requires authentication.",
  responses: {
    200: {
      content: { "application/json": { schema: IsAdminUnifiedResponseSchema } },
      description: "Admin status of current user",
    },
    401: ErrorSpec401,
    500: ErrorSpec500,
  },
})

// === Router ===

export const adminRouter = new OpenAPIHono()

// Apply requireAuth to all routes
adminRouter.use("*", requireAuth)

// GET /admin/is-admin - requires auth but not admin
adminRouter.openapi(isAdminRoute, (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    throw new UnauthorizedError()
  }
  return singleReadOnlyResponse(c, { isAdmin: authUser.isAdmin })
})
