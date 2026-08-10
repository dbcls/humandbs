import { describe, expect, it } from "vitest"

import routes from "~/routes"

import { API_ENDPOINTS, OPENAPI_PATH } from "./endpoints"
import { apiDocument, documentPath } from "./openapi"

interface Document {
  paths: Record<string, Record<string, { operationId?: string, responses: Record<string, unknown> }>>
  components?: { schemas?: Record<string, unknown> }
  servers?: { url: string }[]
  security?: unknown[]
}

const document = apiDocument("https://humandbs.dbcls.jp") as unknown as Document

/** Every address the route configuration registers, flattened out of the tree. */
function registered(config: unknown): string[] {
  if (Array.isArray(config)) return config.flatMap(registered)
  if (config === null || typeof config !== "object") return []
  const route = config as { path?: string, children?: unknown }
  return [
    ...(typeof route.path === "string" ? [route.path] : []),
    ...registered(route.children),
  ]
}

describe("the document and the routes", () => {
  it("describe exactly the same addresses", () => {
    expect(Object.keys(document.paths).sort())
      .toEqual(API_ENDPOINTS.map((endpoint) => documentPath(endpoint.path)).sort())
  })

  it("describe addresses the application actually serves", () => {
    const served = new Set(registered(routes))
    for (const endpoint of API_ENDPOINTS) expect(served.has(endpoint.path)).toBe(true)
    expect(served.has(OPENAPI_PATH)).toBe(true)
  })

  it("spell a parameter the way OpenAPI spells it", () => {
    expect(documentPath("api/research/:humId/:version")).toBe("/api/research/{humId}/{version}")
  })
})

describe("the document", () => {
  it("gives every operation an id, and no two the same", () => {
    const ids = Object.values(document.paths).flatMap((methods) =>
      Object.values(methods).map((operation) => operation.operationId))
    expect(ids.every((id) => id !== undefined)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("declares that nothing is authenticated rather than leaving it unsaid", () => {
    expect(document.security).toEqual([])
  })

  it("names the server an answer's URLs are built on", () => {
    expect(document.servers).toEqual([{ url: "https://humandbs.dbcls.jp" }])
  })

  it("refers to a shared schema rather than repeating it", () => {
    expect(Object.keys(document.components?.schemas ?? {})).toContain("Research")
    const research = document.paths["/api/research/{humId}"]?.get
    expect(JSON.stringify(research)).toContain("#/components/schemas/Research")
  })

  it("says what an endpoint answers when it refuses", () => {
    for (const endpoint of API_ENDPOINTS) {
      const operation = document.paths[documentPath(endpoint.path)]?.get
      for (const status of endpoint.problems) {
        expect(Object.keys(operation?.responses ?? {})).toContain(String(status))
      }
    }
  })
})
