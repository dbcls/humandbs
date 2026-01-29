import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { promises as fs } from "fs"
import { decodeJwt } from "jose"

import { IsAdminResponseSchema } from "@/types"

import { ErrorSpec401, ErrorSpec500 } from "./errors"

const ADMIN_UID_FILE = process.env.ADMIN_UID_FILE || "/app/admin_uids.json"

let adminUidSet: Set<string> | null = new Set([
  "90930f78-74be-413c-aa6c-55156cbf329b",
]) // TODO: Use ADMIN_UID_FILE
const loadAminUids = async () => {
  if (adminUidSet) return adminUidSet
  const textFileContent = await fs.readFile(ADMIN_UID_FILE, "utf-8")
  adminUidSet = new Set(
    textFileContent
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0),
  )
  return adminUidSet
}

const isAdminRoute = createRoute({
  method: "get",
  path: "/is-admin",
  tags: ["Users"],
  summary: "Check if the user is an admin",
  description: "Reads a JWT from the Authorization header and checks if the user is an admin based on a list of admin UIDs.",
  request: {
    headers: z.object({
      Authorization: z.string().describe("Bearer token containing the JWT"),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: IsAdminResponseSchema,
        },
      },
      description: "User is an admin",
    },
    401: ErrorSpec401,
    500: ErrorSpec500,
  },
})

export const usersRouter = new OpenAPIHono()

// GET /is-admin - Check if the user is an admin
usersRouter.openapi(isAdminRoute, async (c) => {
  try {
    const authz = c.req.header("Authorization") ?? ""
    const m = authz.match(/^Bearer\s+(.+)$/)
    if (!m) {
      return c.json({
        error: "Unauthorized",
        message: "Authorization header is missing or invalid",
      }, 401)
    }

    const jwt = m[1]
    const payload = decodeJwt(jwt) as { uid?: string | null; sub?: string | null }
    const uid = (payload.uid ?? payload.sub ?? "").trim()
    if (!uid) {
      return c.json({
        error: "Unauthorized",
        message: "JWT does not contain a valid user ID",
      }, 401)
    }

    const adminUidSet = await loadAminUids()
    const isAdmin = adminUidSet.has(uid)
    const response = IsAdminResponseSchema.parse({ isAdmin })

    return c.json(response, 200)
  } catch (error) {
    console.error("Error checking admin status:", error)
    return c.json({
      error: "Internal Server Error",
      message: `An unexpected error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, 500)
  }
})
