/**
 * Admin API Routes
 *
 * Handles administrative operations such as pending reviews.
 * All routes require admin authentication.
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"

import { getPendingReviews } from "@/api/es-client"
import { requireAuth } from "@/api/middleware/auth"
import { ErrorSpec401, ErrorSpec403, ErrorSpec500 } from "@/api/routes/errors"
import {
  IsAdminResponseSchema,
  PendingReviewsResponseSchema,
} from "@/api/types"

// === Route Definitions ===

const isAdminRoute = createRoute({
  method: "get",
  path: "/is-admin",
  tags: ["Admin"],
  summary: "Check Admin Status",
  description: "Check if the current user is an admin. Requires authentication.",
  responses: {
    200: {
      content: { "application/json": { schema: IsAdminResponseSchema } },
      description: "Admin status of current user",
    },
    401: ErrorSpec401,
    500: ErrorSpec500,
  },
})

const getPendingReviewsRoute = createRoute({
  method: "get",
  path: "/pending-reviews",
  tags: ["Admin"],
  summary: "Get Pending Reviews",
  description: "List all researches awaiting admin review. Returns researches with status 'review'.",
  request: {
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: PendingReviewsResponseSchema } },
      description: "List of pending reviews",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    500: ErrorSpec500,
  },
})

// === Router ===

export const adminRouter = new OpenAPIHono()

// Apply requireAuth to all routes
adminRouter.use("*", requireAuth)

// GET /admin/is-admin - requires auth but not admin
adminRouter.openapi(isAdminRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401)
  }
  return c.json({ isAdmin: authUser.isAdmin }, 200)
})

// GET /admin/pending-reviews - requires admin
adminRouter.openapi(getPendingReviewsRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser?.isAdmin) {
    return c.json({ error: "Forbidden", message: "Admin access required" }, 403)
  }

  try {
    const { page, limit } = c.req.valid("query")

    const result = await getPendingReviews(page, limit)

    // Transform EsResearchDoc to PendingReviewItem format
    const data = result.data.map(doc => ({
      humId: doc.humId,
      title: doc.title,
      uids: doc.uids,
      submittedAt: doc.dateModified, // Use dateModified as submittedAt approximation
    }))

    return c.json({ data, total: result.total }, 200)
  } catch (error) {
    console.error("Error fetching pending reviews:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})
