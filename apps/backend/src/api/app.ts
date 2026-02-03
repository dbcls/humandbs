import { swaggerUI } from "@hono/swagger-ui"
import { OpenAPIHono } from "@hono/zod-openapi"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"

import { ERROR_MESSAGES } from "@/api/constants"
import { isAppError, toProblemDetails, createProblemDetails } from "@/api/errors"
import { isConflictError } from "@/api/es-client/client"
import { logger } from "@/api/logger"
import { getRequestId, requestIdMiddleware } from "@/api/middleware/request-id"
import { adminRouter } from "@/api/routes/admin"
import { datasetRouter } from "@/api/routes/dataset"
import { healthRouter } from "@/api/routes/health"
import { researchRouter } from "@/api/routes/research/index"
import { searchRouter } from "@/api/routes/search"
import { statsRouter } from "@/api/routes/stats"

// Environment variables
const URL_PREFIX = process.env.HUMANDBS_BACKEND_URL_PREFIX ?? ""

export const createApp = () => {
  const app = new OpenAPIHono()

  // Middleware
  app.use("*", requestIdMiddleware)
  app.use("*", cors())

  // Request logging middleware
  app.use("*", async (c, next) => {
    const start = Date.now()
    const requestId = getRequestId(c)
    const method = c.req.method
    const path = c.req.path

    logger.info("Request received", { requestId, method, path })

    await next()

    const duration = Date.now() - start
    const status = c.res.status

    logger.info("Request completed", { requestId, method, path, status, duration })
  })

  // Create a sub-app for API routes
  const api = new OpenAPIHono()

  // Utility routes
  api.route("/health", healthRouter)
  api.route("/stats", statsRouter)

  // API routes (singular form)
  api.route("/research", researchRouter)
  api.route("/dataset", datasetRouter)
  api.route("/admin", adminRouter)

  // Search routes mounted at root level for POST /research/search, POST /dataset/search, GET /facets
  api.route("/", searchRouter)

  // Mount API routes with optional prefix
  if (URL_PREFIX) {
    app.route(URL_PREFIX, api)
  } else {
    app.route("/", api)
  }

  // OpenAPI docs path (adjusted for prefix)
  const docsPath = URL_PREFIX ? `${URL_PREFIX}/docs` : "/docs"
  const openApiJsonPath = `${docsPath}/openapi.json`

  // OpenAPI docs
  app.doc(openApiJsonPath, {
    openapi: "3.0.0",
    info: {
      title: "HumanDBs Backend API",
      version: "2.0.0",
      description: `
HumanDBs REST API for accessing research database information.

## Authentication

This API uses Keycloak OIDC for authentication. Include a Bearer token in the Authorization header:

\`\`\`
Authorization: Bearer <access_token>
\`\`\`

## Roles

- **public**: Unauthenticated users can read published resources
- **researcher**: Can create and manage their own resources
- **admin**: Full access to all resources and administrative functions

## Resource Naming

API endpoints use singular resource names (e.g., \`/research\`, \`/dataset\`).

## Status Workflow

Research resources follow a publication workflow:
- **draft** → **review** → **published**

Only admins can approve/reject submissions and unpublish content.
      `.trim(),
    },
    servers: URL_PREFIX ? [{ url: URL_PREFIX }] : undefined,
    tags: [
      {
        name: "Health",
        description: "Health check endpoint for monitoring and load balancer probes.",
      },
      {
        name: "Stats",
        description: "Statistics about published resources. Returns counts and facet aggregations for Research and Dataset resources. Only includes published resources.",
      },
      {
        name: "Research",
        description: "CRUD operations for Research resources. A Research represents a study that contains one or more Datasets. Supports versioning and publication workflow (draft → review → published). Research deletion is logical (status=deleted) to preserve humId uniqueness and external references.",
      },
      {
        name: "Research Versions",
        description: "Version management for Research resources. Each Research can have multiple versions (v1, v2, ...). Creating a new version copies datasets from the previous version. Specific versions can be retrieved via /research/{humId}/versions/{version}.",
      },
      {
        name: "Research Datasets",
        description: "Manage datasets linked to a Research. Datasets can only be created, updated, or deleted when the parent Research is in draft status. Use POST /research/{humId}/dataset/new to create a new Dataset for a Research.",
      },
      {
        name: "Research Status",
        description: "Research publication workflow management. Transitions: draft → review (submit), review → published (approve), review → draft (reject), published → draft (unpublish). Only admins can approve, reject, or unpublish. Dataset versions are finalized when Research is approved.",
      },
      {
        name: "Dataset",
        description: "CRUD operations for Dataset resources. A Dataset belongs to exactly one Research (1:N relationship). Dataset visibility depends on parent Research status. Datasets cannot be created standalone - use POST /research/{humId}/dataset/new instead.",
      },
      {
        name: "Dataset Versions",
        description: "Version management for Dataset resources. Dataset versions are tied to Research versions. When a Dataset is first modified in a draft Research cycle, a new version is created. Subsequent modifications update the same version until Research is published.",
      },
      {
        name: "Search",
        description: "Full-text and faceted search for Research and Dataset resources. Supports complex filters via POST endpoints. GET /facets returns available facet values with counts. Search targets: Research (title, summary), Dataset (experiments).",
      },
      {
        name: "Admin",
        description: "Administrative operations requiring admin role. Includes admin status check. Admin users are determined by admin_uids.json configuration, not JWT roles.",
      },
    ],
  })

  app.get(docsPath, swaggerUI({
    url: openApiJsonPath,
  }))

  // Global error handler with RFC 7807 Problem Details support
  app.onError((err, c) => {
    const requestId = getRequestId(c)
    const instance = c.req.path

    // Handle custom AppError - return RFC 7807 format
    if (isAppError(err)) {
      const logLevel = err.statusCode >= 500 ? "error" : "warn"
      logger[logLevel](`${err.code}: ${err.message}`, {
        requestId,
        status: err.statusCode,
        code: err.code,
      })
      const problemDetails = toProblemDetails(err, requestId, instance)
      return c.json(problemDetails, err.statusCode)
    }

    // Handle HTTPException from Hono
    if (err instanceof HTTPException) {
      logger.warn("HTTP exception", { requestId, status: err.status, message: err.message })
      const code = err.status === 401 ? "UNAUTHORIZED"
        : err.status === 403 ? "FORBIDDEN"
          : err.status === 404 ? "NOT_FOUND"
            : err.status === 409 ? "CONFLICT"
              : "INTERNAL_ERROR"
      const problemDetails = createProblemDetails(
        err.status as 400 | 401 | 403 | 404 | 409 | 500,
        code,
        err.cause ? (typeof err.cause === "string" ? err.cause : JSON.stringify(err.cause)) : err.message,
        requestId,
        instance,
      )
      return c.json(problemDetails, err.status)
    }

    // Handle ES version conflict (409)
    if (isConflictError(err)) {
      logger.warn("Conflict error", { requestId, message: ERROR_MESSAGES.CONFLICT })
      const problemDetails = createProblemDetails(
        409,
        "CONFLICT",
        ERROR_MESSAGES.CONFLICT,
        requestId,
        instance,
      )
      return c.json(problemDetails, 409)
    }

    // Default to 500 Internal Server Error
    logger.error("Unhandled error", { requestId, error: String(err), stack: (err as Error).stack })
    const problemDetails = createProblemDetails(
      500,
      "INTERNAL_ERROR",
      "An unexpected error occurred",
      requestId,
      instance,
    )
    return c.json(problemDetails, 500)
  })

  return app
}

const app = createApp()

export default app
