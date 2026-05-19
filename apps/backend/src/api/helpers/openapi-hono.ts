/**
 * OpenAPIHono factory with a unified validation-error hook.
 *
 * The default behavior of @hono/zod-openapi returns Zod errors as
 * `application/json`. To stay RFC 7807 compliant across the API surface,
 * every router is constructed via createOpenAPIHono(), which converts
 * validation failures into Problem Details (application/problem+json).
 */
import { OpenAPIHono } from "@hono/zod-openapi"
import type { Env } from "hono"

import { createProblemDetails } from "@/api/errors"
import { getRequestId } from "@/api/middleware/request-id"

const formatZodError = (error: { issues?: { path: (string | number)[]; message: string }[]; message?: string }): string => {
  if (Array.isArray(error.issues) && error.issues.length > 0) {
    return error.issues
      .map(issue => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ")
  }
  return error.message ?? "Validation failed"
}

export const createOpenAPIHono = <E extends Env = Env>() => new OpenAPIHono<E>({
  defaultHook: (result, c) => {
    if (!result.success) {
      const requestId = getRequestId(c)
      const instance = c.req.path
      const detail = formatZodError(result.error as { issues?: { path: (string | number)[]; message: string }[]; message?: string })
      const problemDetails = createProblemDetails(
        400,
        "VALIDATION_ERROR",
        detail,
        requestId,
        instance,
      )
      return c.body(JSON.stringify(problemDetails), 400, {
        "Content-Type": "application/problem+json",
      })
    }
  },
})
