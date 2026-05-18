import { swaggerUI } from "@hono/swagger-ui"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"

import { ERROR_MESSAGES } from "@/api/constants"
import { isAppError, toProblemDetails, createProblemDetails } from "@/api/errors"
import { isConflictError } from "@/api/es-client/client"
import { createOpenAPIHono } from "@/api/helpers/openapi-hono"
import { logger } from "@/api/logger"
import { getRequestId, requestIdMiddleware } from "@/api/middleware/request-id"
import { buildOpenAPIDocument, registerOpenAPISecuritySchemes } from "@/api/openapi/document"
import { SWAGGER_UI_OAUTH2_REDIRECT_HTML } from "@/api/openapi/oauth2-redirect"
import { registerOpenAPISchemas } from "@/api/openapi/schemas"
import { adminRouter } from "@/api/routes/admin"
import { datasetRouter } from "@/api/routes/dataset"
import { healthRouter } from "@/api/routes/health"
import { jgaShinseiRouter } from "@/api/routes/jga-shinsei"
import { researchRouter } from "@/api/routes/research/index"
import { searchRouter } from "@/api/routes/search"
import { statsRouter } from "@/api/routes/stats"
import { templatesRouter } from "@/api/routes/templates"

export const createApp = () => {
  const URL_PREFIX = process.env.HUMANDBS_BACKEND_URL_PREFIX ?? ""
  const app = createOpenAPIHono()

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
  const api = createOpenAPIHono()

  // Utility routes
  api.route("/health", healthRouter)
  api.route("/stats", statsRouter)

  // API routes (singular form)
  api.route("/research", researchRouter)
  api.route("/dataset", datasetRouter)
  api.route("/admin", adminRouter)
  api.route("/jga-shinsei", jgaShinseiRouter)
  api.route("/templates", templatesRouter)

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
  registerOpenAPISecuritySchemes(app)
  registerOpenAPISchemas(app)
  app.doc(openApiJsonPath, buildOpenAPIDocument())

  // Swagger UI with Keycloak OAuth2 authorization-code (PKCE) flow.
  // The Keycloak Valid Redirect URIs list must include `${docsPath}/oauth2-redirect.html`
  // for the popup-based OAuth login to complete. See apps/backend/docs/api-guide.md.
  const oauthRedirectUrl = `${docsPath}/oauth2-redirect.html`
  const envClientId = process.env.HUMANDBS_AUTH_CLIENT_ID
  if (!envClientId && process.env.NODE_ENV === "production") {
    throw new Error("HUMANDBS_AUTH_CLIENT_ID is required in production")
  }
  const oauthClientId = envClientId ?? "humandbs-dev"

  // `@hono/swagger-ui` only ships `swagger-ui-bundle.js` (no standalone preset
  // / topbar), so we use BaseLayout and the bundle's built-in `apis` preset;
  // do NOT reference `SwaggerUIStandalonePreset` or `StandaloneLayout` — they
  // would be `undefined` here and crash with `ReferenceError`.
  //
  // The outer `url` is required by `SwaggerUIOptions` (one of `url` / `urls`
  // must be present), but `manuallySwaggerUIHtml` overrides the rendered page
  // body, so SwaggerUIBundle actually reads the URL from the inline template
  // literal below. The two values are intentionally kept in sync.
  app.get(docsPath, swaggerUI({
    url: openApiJsonPath,
    manuallySwaggerUIHtml: (asset) => `
      <div id="swagger-ui"></div>
      ${asset.css.map((url) => `<link rel="stylesheet" href="${url}" />`).join("\n")}
      ${asset.js.map((url) => `<script src="${url}" crossorigin="anonymous"></script>`).join("\n")}
      <script>
        window.onload = () => {
          const ui = SwaggerUIBundle({
            dom_id: "#swagger-ui",
            url: ${JSON.stringify(openApiJsonPath)},
            deepLinking: true,
            persistAuthorization: true,
            oauth2RedirectUrl: window.location.origin + ${JSON.stringify(oauthRedirectUrl)},
            presets: [SwaggerUIBundle.presets.apis],
            plugins: [SwaggerUIBundle.plugins.DownloadUrl],
            layout: "BaseLayout",
          })
          ui.initOAuth({
            clientId: ${JSON.stringify(oauthClientId)},
            scopes: "openid profile email",
            usePkceWithAuthorizationCodeGrant: true,
          })
          window.ui = ui
        }
      </script>
    `,
  }))

  // Serve the Swagger UI OAuth2 redirect helper. Swagger UI's distribution
  // ships a tiny HTML file at this path; we proxy it via CDN-equivalent content
  // so the OAuth popup can postMessage back to the parent window.
  app.get(oauthRedirectUrl, (c) => c.html(SWAGGER_UI_OAUTH2_REDIRECT_HTML))

  // RFC 7807 Problem Details response helper
  // Content-Type: application/problem+json per RFC 7807
  const problemResponse = (
    c: Parameters<Parameters<typeof app.onError>[0]>[1],
    problemDetails: unknown,
    status: 400 | 401 | 403 | 404 | 409 | 500,
  ) => c.body(JSON.stringify(problemDetails), status, {
    "Content-Type": "application/problem+json",
  })

  // Not-found handler: return RFC 7807 (Hono's default is plain "404 Not Found")
  app.notFound((c) => {
    const requestId = getRequestId(c)
    const instance = c.req.path
    const problemDetails = createProblemDetails(
      404,
      "NOT_FOUND",
      `Path not found: ${instance}`,
      requestId,
      instance,
    )
    return problemResponse(c, problemDetails, 404)
  })

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
      return problemResponse(c, problemDetails, err.statusCode)
    }

    // Handle HTTPException from Hono
    if (err instanceof HTTPException) {
      logger.warn("HTTP exception", { requestId, status: err.status, message: err.message })
      const code = err.status === 401 ? "UNAUTHORIZED"
        : err.status === 403 ? "FORBIDDEN"
          : err.status === 404 ? "NOT_FOUND"
            : err.status === 409 ? "CONFLICT"
              : "INTERNAL_ERROR"
      const status = err.status as 400 | 401 | 403 | 404 | 409 | 500
      const problemDetails = createProblemDetails(
        status,
        code,
        err.cause ? (typeof err.cause === "string" ? err.cause : JSON.stringify(err.cause)) : err.message,
        requestId,
        instance,
      )
      return problemResponse(c, problemDetails, status)
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
      return problemResponse(c, problemDetails, 409)
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
    return problemResponse(c, problemDetails, 500)
  })

  return app
}

const app = createApp()

export default app
