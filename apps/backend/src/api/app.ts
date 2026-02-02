import { swaggerUI } from "@hono/swagger-ui"
import { OpenAPIHono } from "@hono/zod-openapi"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { logger } from "hono/logger"

import { ERROR_MESSAGES } from "@/api/constants"
import { isConflictError } from "@/api/es-client/client"
import { adminRouter } from "@/api/routes/admin"
import { datasetRouter } from "@/api/routes/dataset"
import { healthRouter } from "@/api/routes/health"
import { researchRouter } from "@/api/routes/research"
import { searchRouter } from "@/api/routes/search"
import { statsRouter } from "@/api/routes/stats"

// Environment variables
const API_URL_PREFIX = process.env.HUMANDBS_API_URL_PREFIX || ""

export const createApp = () => {
  const app = new OpenAPIHono()

  app.use("*", cors())
  app.use("*", logger())

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
  if (API_URL_PREFIX) {
    app.route(API_URL_PREFIX, api)
  } else {
    app.route("/", api)
  }

  // OpenAPI docs path (adjusted for prefix)
  const docsPath = API_URL_PREFIX ? `${API_URL_PREFIX}/docs` : "/docs"
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
    servers: API_URL_PREFIX ? [{ url: API_URL_PREFIX }] : undefined,
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

  // Global error handler
  app.onError((err, c) => {
    console.error("Unhandled error:", err)

    // Handle HTTPException from Hono
    if (err instanceof HTTPException) {
      return c.json(
        { error: err.message, message: err.cause ? String(err.cause) : null },
        err.status,
      )
    }

    // Handle ES version conflict (409)
    if (isConflictError(err)) {
      return c.json(
        { error: "Conflict", message: ERROR_MESSAGES.CONFLICT },
        409,
      )
    }

    // Default to 500 Internal Server Error
    return c.json(
      { error: ERROR_MESSAGES.INTERNAL_ERROR, message: String(err) },
      500,
    )
  })

  return app
}

const app = createApp()

export default app
