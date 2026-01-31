/**
 * Admin API Routes
 *
 * Handles administrative operations such as pending reviews, user management,
 * and role assignment. Most routes require admin authentication.
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"

import { getPendingReviews } from "@/api/es-client"
import { requireAuth } from "@/api/middleware/auth"
import { ErrorSpec401, ErrorSpec403, ErrorSpec404, ErrorSpec500 } from "@/api/routes/errors"
import {
  IsAdminResponseSchema,
  PendingReviewsResponseSchema,
  UpdateUserAdminRequestSchema,
  UserIdParamsSchema,
  UserInfoSchema,
  UsersListResponseSchema,
} from "@/api/types"
import type { UpdateUserAdminRequest, UserIdParams } from "@/api/types"

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

const listUsersRoute = createRoute({
  method: "get",
  path: "/users",
  tags: ["Admin"],
  summary: "List Users",
  description: "Get a paginated list of all users in the system.",
  request: {
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      isAdmin: z.coerce.boolean().optional(),
      search: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: UsersListResponseSchema } },
      description: "List of users",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    500: ErrorSpec500,
  },
})

const getUserRoute = createRoute({
  method: "get",
  path: "/users/{userId}",
  tags: ["Admin"],
  summary: "Get User",
  description: "Get details of a specific user.",
  request: {
    params: UserIdParamsSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: UserInfoSchema } },
      description: "User details",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const updateUserAdminRoute = createRoute({
  method: "patch",
  path: "/users/{userId}/admin",
  tags: ["Admin"],
  summary: "Update User Admin Status",
  description: "Update the admin status of a user. This modifies the admin_uids.json file.",
  request: {
    params: UserIdParamsSchema,
    body: { content: { "application/json": { schema: UpdateUserAdminRequestSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: UserInfoSchema } },
      description: "User admin status updated successfully",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
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

// GET /admin/users - requires admin
adminRouter.openapi(listUsersRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser?.isAdmin) {
    return c.json({ error: "Forbidden", message: "Admin access required" }, 403)
  }

  try {
    const { page, limit, isAdmin: _isAdmin, search: _search } = c.req.query()
    // TODO: Implement user listing via Keycloak Admin API
    return c.json({
      data: [],
      pagination: {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    }, 200)
  } catch (error) {
    console.error("Error fetching users:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /admin/users/{userId} - requires admin
adminRouter.openapi(getUserRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser?.isAdmin) {
    return c.json({ error: "Forbidden", message: "Admin access required" }, 403)
  }

  try {
    const { userId: _userId } = c.req.param() as unknown as UserIdParams
    // TODO: Fetch user from Keycloak Admin API
    return c.json({ error: "Not Implemented", message: "Get user not yet implemented" }, 500)
  } catch (error) {
    console.error("Error fetching user:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// PATCH /admin/users/{userId}/admin - requires admin
adminRouter.openapi(updateUserAdminRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser?.isAdmin) {
    return c.json({ error: "Forbidden", message: "Admin access required" }, 403)
  }

  try {
    const { userId: _userId } = c.req.param() as unknown as UserIdParams
    const _body = await c.req.json() as UpdateUserAdminRequest
    // TODO: Update admin_uids.json file to add/remove user from admin list
    return c.json({ error: "Not Implemented", message: "Update user admin status not yet implemented" }, 500)
  } catch (error) {
    console.error("Error updating user admin status:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})
