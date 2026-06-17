/**
 * OpenAPI document integrity tests.
 *
 * Locks in the "single-source-of-truth" guarantees the API Guide expects:
 *   - top-level metadata (contact / license / servers / security schemes) is present
 *   - every operation has a unique operationId
 *   - every operation declares its `security` (empty array is allowed for public)
 *   - every documented error response carries an example
 *   - admin-only operations advertise themselves in the description so consumers
 *     reading raw OpenAPI know the constraint
 */
import { describe, expect, it, beforeAll } from "bun:test"

import { createApp } from "@/api/app"

interface OperationLike {
  operationId?: string
  security?: unknown[]
  description?: string
  "x-admin-only"?: boolean
  responses?: Record<string, {
    content?: Record<string, { example?: unknown }>
  }>
}

interface OpenAPIDocLike {
  info: {
    contact?: { name?: string }
    license?: { name?: string }
  }
  servers?: { url: string }[]
  components?: {
    securitySchemes?: {
      oauth2?: {
        type: string
        flows?: { authorizationCode?: unknown }
      }
    }
  }
  paths: Record<string, Record<string, OperationLike>>
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"])

const iterateOperations = (doc: OpenAPIDocLike): { path: string; method: string; op: OperationLike }[] => {
  const out: { path: string; method: string; op: OperationLike }[] = []
  for (const [path, pathItem] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue
      out.push({ path, method, op })
    }
  }
  return out
}

let doc: OpenAPIDocLike

beforeAll(async () => {
  const app = createApp()
  const prefix = process.env.HUMANDBS_BACKEND_URL_PREFIX ?? ""
  const res = await app.request(`${prefix}/docs/openapi.json`)
  expect(res.status).toBe(200)
  doc = await res.json() as OpenAPIDocLike
})

describe("OpenAPI document - top-level metadata", () => {
  it("declares info.contact", () => {
    expect(doc.info.contact?.name).toBeDefined()
  })

  it("declares info.license", () => {
    expect(doc.info.license?.name).toBeDefined()
  })

  it("lists at least three servers (local, staging, production)", () => {
    expect(doc.servers?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it("registers an oauth2 security scheme with authorizationCode flow", () => {
    const scheme = doc.components?.securitySchemes?.oauth2
    expect(scheme?.type).toBe("oauth2")
    expect(scheme?.flows?.authorizationCode).toBeDefined()
  })
})

describe("OpenAPI document - per-operation contract", () => {
  it("assigns a unique operationId to every operation", () => {
    const ids = iterateOperations(doc).map(({ op }) => op.operationId)
    const missing = iterateOperations(doc).filter(({ op }) => !op.operationId)
    expect(missing.map((m) => `${m.method.toUpperCase()} ${m.path}`)).toEqual([])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("declares `security` (possibly empty for public) on every operation", () => {
    const missing = iterateOperations(doc)
      .filter(({ op }) => op.security === undefined)
      .map(({ path, method }) => `${method.toUpperCase()} ${path}`)
    expect(missing).toEqual([])
  })

  it("admin-only operations and `x-admin-only` markers are in 1:1 correspondence", () => {
    // Known admin-only operations from the routing layer. Adding a new
    // admin-only operation requires updating this list AND adding
    // `"x-admin-only": true` to the corresponding `createRoute` definition.
    // Paths are mount-relative; `HUMANDBS_BACKEND_URL_PREFIX` is applied at
    // the OpenAPI document level, so we apply the same prefix here.
    const prefix = process.env.HUMANDBS_BACKEND_URL_PREFIX ?? ""
    const expectedAdminOperations = [
      "post /research/new",
      "post /research/{humId}/delete",
      "post /research/{humId}/approve",
      "post /research/{humId}/reject",
      "post /research/{humId}/unpublish",
      "put /research/{humId}/uids",
      "post /dataset/{datasetId}/delete",
      "get /jga-shinsei/ds",
      "get /jga-shinsei/ds/{jdsApplId}",
      "get /jga-shinsei/du",
      "get /jga-shinsei/du/{jduApplId}",
      "get /templates/research/{jdsId}",
      "get /templates/dataset/{externalId}",
    ].map((entry) => {
      const [method, path] = entry.split(" ")
      return `${method} ${prefix}${path}`
    }).sort()

    const markerMatches = iterateOperations(doc)
      .filter(({ op }) => op["x-admin-only"] === true)
      .map(({ method, path }) => `${method} ${path}`)
      .sort()

    expect(markerMatches).toEqual(expectedAdminOperations)

    // Each admin-only operation must declare a non-empty `security` (i.e.
    // public access is forbidden). The OAuth2 scheme is the only one
    // configured, so requiring `security` length > 0 is enough.
    for (const key of expectedAdminOperations) {
      const [method, path] = key.split(" ")
      const op = doc.paths[path]?.[method]
      expect(op?.security?.length ?? 0, `${key} must declare an authenticated security scheme`).toBeGreaterThan(0)
    }
  })
})

describe("OpenAPI document - error responses", () => {
  it("supplies an example for every application/problem+json response", () => {
    const missing: string[] = []
    for (const { path, method, op } of iterateOperations(doc)) {
      if (!op.responses) continue
      for (const [status, response] of Object.entries(op.responses)) {
        const problem = response.content?.["application/problem+json"]
        if (!problem) continue
        if (problem.example === undefined) {
          missing.push(`${method.toUpperCase()} ${path} ${status}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})
