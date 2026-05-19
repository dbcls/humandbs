/**
 * Unit tests for `createOpenAPIHono`.
 *
 * The helper is what guarantees that every router responds to Zod validation
 * failures with RFC 7807 `application/problem+json` (instead of the default
 * `application/json` from `@hono/zod-openapi`). These tests exercise the
 * `defaultHook` directly so the contract is verified independently of any
 * particular route file.
 */
import { createRoute, z } from "@hono/zod-openapi"
import { describe, expect, it } from "bun:test"

import { createOpenAPIHono } from "@/api/helpers/openapi-hono"
import { requestIdMiddleware } from "@/api/middleware/request-id"

const echoRouter = () => {
  const app = createOpenAPIHono()
  app.openapi(
    createRoute({
      method: "post",
      path: "/echo",
      request: {
        query: z.object({ q: z.string().min(1) }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                name: z.string().min(1),
                age: z.number().int().min(0),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          description: "ok",
          content: {
            "application/json": { schema: z.object({ ok: z.literal(true) }) },
          },
        },
      },
    }),
    (c) => c.json({ ok: true as const }),
  )
  return app
}

const rootRouter = () => {
  // Validation target is a top-level non-object body, so a failure produces
  // `issue.path === []` which the formatter substitutes with `<root>`.
  const app = createOpenAPIHono()
  app.openapi(
    createRoute({
      method: "post",
      path: "/scalar",
      request: {
        body: {
          content: {
            "application/json": { schema: z.string().min(3) },
          },
        },
      },
      responses: {
        200: {
          description: "ok",
          content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
        },
      },
    }),
    (c) => c.json({ ok: true as const }),
  )
  return app
}

const VALIDATION_ERROR_TYPE = /validation-error$/

describe("createOpenAPIHono defaultHook", () => {
  it("returns 200 on valid input (sanity)", async () => {
    const app = echoRouter()
    const res = await app.request("/echo?q=hello", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "alice", age: 30 }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it("returns RFC 7807 on body validation failure", async () => {
    const app = echoRouter()
    const res = await app.request("/echo?q=hello", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", age: -1 }),
    })
    expect(res.status).toBe(400)
    expect(res.headers.get("content-type")).toContain("application/problem+json")
    const body = await res.json() as {
      type?: string
      title?: string
      status?: number
      detail?: string
      instance?: string
      requestId?: string
    }
    expect(body.title).toBe("Validation Error")
    expect(body.type ?? "").toMatch(VALIDATION_ERROR_TYPE)
    expect(body.status).toBe(400)
    expect(body.instance).toBe("/echo")
  })

  it("joins multiple Zod issues with '; '", async () => {
    const app = echoRouter()
    const res = await app.request("/echo?q=hello", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", age: -1 }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { detail?: string }
    // Both `name` (min 1) and `age` (min 0) fail; we expect them concatenated
    expect(body.detail).toContain("name")
    expect(body.detail).toContain("age")
    expect(body.detail).toContain(";")
  })

  it("labels root-level issues as <root> when path is empty", async () => {
    const app = rootRouter()
    const res = await app.request("/scalar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify("ab"),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { detail?: string }
    expect(body.detail).toContain("<root>")
  })

  it("returns requestId='unknown' when requestIdMiddleware is not registered", async () => {
    const app = echoRouter()
    const res = await app.request("/echo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "alice", age: 30 }),
    })
    // ?q is missing -> validation 400; requestId should fall back to "unknown"
    expect(res.status).toBe(400)
    const body = await res.json() as { requestId?: string }
    expect(body.requestId).toBe("unknown")
  })

  it("returns the propagated requestId when requestIdMiddleware is registered first", async () => {
    const app = createOpenAPIHono()
    app.use("*", requestIdMiddleware)
    app.openapi(
      createRoute({
        method: "get",
        path: "/needs-q",
        request: { query: z.object({ q: z.string().min(1) }) },
        responses: {
          200: {
            description: "ok",
            content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
          },
        },
      }),
      (c) => c.json({ ok: true as const }),
    )
    const fixedId = "test-req-12345"
    const res = await app.request("/needs-q", {
      headers: { "X-Request-ID": fixedId },
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { requestId?: string }
    expect(body.requestId).toBe(fixedId)
  })
})
