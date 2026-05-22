/**
 * OpenAPI document builder.
 *
 * Returns the OpenAPI 3.0.0 object passed to `OpenAPIHono.doc()`.
 * Centralises info / servers / tags / security schemes so app.ts stays small.
 */

import type { OpenAPIHono } from "@hono/zod-openapi"

type SecurityRequirement = Record<string, string[]>

/**
 * Per-operation `security` constants.
 *
 * The empty-object element in `SECURITY_OPTIONAL_AUTH` is the OpenAPI 3 convention
 * for "this operation accepts either no auth or the listed scheme(s)".
 *
 * These are typed as `SecurityRequirement[]` so that `createRoute`'s inference
 * doesn't widen the literal `{}` into a generic shape that breaks downstream
 * `c.req.valid(...)` typing.
 */
export const SECURITY_PUBLIC: SecurityRequirement[] = []
export const SECURITY_REQUIRES_AUTH: SecurityRequirement[] = [{ oauth2: [] }]
export const SECURITY_OPTIONAL_AUTH: SecurityRequirement[] = [{}, { oauth2: [] }]

// Server URLs are bare hosts. The `/api` prefix is part of each operation's
// path (routes are mounted at `URL_PREFIX`), so re-adding it here would make
// Swagger UI request `/api/api/...`.
const SERVER_BASES = [
  { url: "http://localhost:8080", description: "Local development (nginx)" },
  { url: "https://humandbs-staging.ddbj.nig.ac.jp", description: "Staging" },
  { url: "https://humandbs.dbcls.jp", description: "Production" },
] as const

const TAGS = [
  { name: "Health", description: "Liveness probe." },
  { name: "Stats", description: "Counts and facets across published Research and Dataset." },
  { name: "Research", description: "CRUD for Research (studies grouping Datasets)." },
  { name: "Research Versions", description: "Per-Research version management." },
  { name: "Research Datasets", description: "Datasets attached to a Research." },
  { name: "Research Status", description: "Publication workflow: submit / approve / reject / unpublish." },
  { name: "Dataset", description: "CRUD for Dataset (1:N child of Research)." },
  { name: "Dataset Versions", description: "Per-Dataset version retrieval." },
  { name: "Search", description: "Full-text and faceted search over Research and Dataset." },
  { name: "Admin", description: "Authentication / admin-status utilities." },
  { name: "JGA Shinsei", description: "Read-only access to JGA application data (DS / DU)." },
]

const INFO_DESCRIPTION = `
HumanDBs REST API for accessing research database information.

## Authentication

This API uses Keycloak OIDC for authentication. Include a Bearer token in the Authorization header:

\`\`\`
Authorization: Bearer <access_token>
\`\`\`

## Roles

- **public**: Unauthenticated users can read published resources only
- **authenticated**: Authenticated users can also access their own draft/review resources (where their UID is in the resource's uids field)
- **admin**: Full access to all resources and administrative functions

## Resource Naming

- List と detail は同じ singular path 配下 (\`/research\` で list、\`/research/{humId}\` で detail)
- 親子関係も singular で表現 (\`/research/{humId}/dataset\` で list / \`/research/{humId}/dataset/new\` で create — 複数形 \`datasets\` は使わない)
- 書き込み系は \`/new\`, \`/delete\`, \`/submit\`, \`/approve\`, \`/reject\`, \`/unpublish\` の action suffix で表現する (RPC-ish)

## Status Workflow

Research resources follow a publication workflow:
- **draft** → **review** → **published**

Only admins can approve/reject submissions and unpublish content.
`.trim()

const OAUTH2_SECURITY_SCHEME_NAME = "oauth2"

/**
 * Register OpenAPI security schemes (Keycloak OIDC authorization code flow).
 *
 * `components` is excluded from `OpenAPIObjectConfig` in `@asteasolutions/zod-to-openapi`,
 * so we must register security schemes through the registry rather than the doc config.
 *
 * The Keycloak realm base URL is read from `HUMANDBS_AUTH_ISSUER_URL` at runtime
 * so the same image works in staging/production by environment switch. In production
 * the env var is required so a missing config fails fast instead of silently pointing
 * Swagger UI at the staging IdP.
 */
export const registerOpenAPISecuritySchemes = (app: OpenAPIHono): void => {
  const envIssuer = process.env.HUMANDBS_AUTH_ISSUER_URL
  if (!envIssuer && process.env.NODE_ENV === "production") {
    throw new Error("HUMANDBS_AUTH_ISSUER_URL is required in production")
  }
  const issuer = envIssuer
    ?? "https://idp-staging.ddbj.nig.ac.jp/realms/master"

  app.openAPIRegistry.registerComponent("securitySchemes", OAUTH2_SECURITY_SCHEME_NAME, {
    type: "oauth2",
    description: "Keycloak OIDC. Admin-only endpoints are not gated by an OAuth scope; admin status comes from the server-side admin_uids.json file.",
    flows: {
      authorizationCode: {
        authorizationUrl: `${issuer}/protocol/openid-connect/auth`,
        tokenUrl: `${issuer}/protocol/openid-connect/token`,
        refreshUrl: `${issuer}/protocol/openid-connect/token`,
        scopes: {
          openid: "OpenID Connect login (required)",
          profile: "User profile claims (preferred_username)",
          email: "User email claim",
        },
      },
    },
  })
}

export const buildOpenAPIDocument = () => ({
  openapi: "3.0.0" as const,
  info: {
    title: "HumanDBs Backend API",
    version: "2.0.0",
    description: INFO_DESCRIPTION,
    contact: {
      name: "HumanDBs Team",
      url: "https://github.com/dbcls/humandbs",
    },
    license: {
      name: "Apache-2.0",
      url: "https://www.apache.org/licenses/LICENSE-2.0",
    },
  },
  servers: [...SERVER_BASES],
  tags: TAGS,
})
