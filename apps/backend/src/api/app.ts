import { swaggerUI } from "@hono/swagger-ui"
import { OpenAPIHono } from "@hono/zod-openapi"
import { cors } from "hono/cors"
import { logger } from "hono/logger"

import { adminRouter } from "@/api/routes/admin"
import { datasetRouter } from "@/api/routes/dataset"
import { healthRouter } from "@/api/routes/health"
import { researchRouter } from "@/api/routes/research"
import { searchRouter } from "@/api/routes/search"
import { usersRouter } from "@/api/routes/users"

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
  api.route("/users", usersRouter)

  // API routes (singular form)
  api.route("/research", researchRouter)
  api.route("/dataset", datasetRouter)
  api.route("/search", searchRouter)
  api.route("/admin", adminRouter)

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
      { name: "Health", description: "Health check endpoints" },
      { name: "Research", description: "Research resource CRUD operations" },
      { name: "Research Versions", description: "Research versioning operations" },
      { name: "Research Datasets", description: "Manage dataset links for research" },
      { name: "Research Status", description: "Research publication workflow (draft → review → published)" },
      { name: "Dataset", description: "Dataset resource CRUD operations" },
      { name: "Dataset Versions", description: "Dataset versioning operations" },
      { name: "Search", description: "Full-text and faceted search" },
      { name: "Admin", description: "Administrative operations (requires admin role)" },
      { name: "Users", description: "User-related operations" },
    ],
  })

  app.get(docsPath, swaggerUI({
    url: openApiJsonPath,
  }))

  return app
}

const app = createApp()

export default app
