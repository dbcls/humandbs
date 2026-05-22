/**
 * IT-ERROR-*: RFC 7807 problem details (`app.ts § onError`, `errors/index.ts`).
 *
 * Reference: `tests/integration-scenarios.md § IT-ERROR-*`.
 *
 * IT-ERROR-05 (optimistic-lock 409), IT-ERROR-06 (op_type:create 409), and IT-ERROR-07
 * (deleted humId 404) require mutating fixtures and are covered in
 * `research.test.ts` / `dataset.test.ts` where the isolation index is bootstrapped.
 */
import { beforeAll, describe, expect } from "bun:test"

import {
  authHeaders,
  getApp,
  itWithEs,
  itWithNonAdminToken,
  setupIntegration,
  url,
} from "./setup"

beforeAll(setupIntegration)

interface ProblemDetails {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  timestamp: string
  requestId?: string
}

const expectProblem = (json: unknown, status: number, type: string, title: string): ProblemDetails => {
  const p = json as ProblemDetails
  expect(p.type).toBe(type)
  expect(p.title).toBe(title)
  expect(p.status).toBe(status)
  expect(typeof p.timestamp).toBe("string")
  expect(Number.isNaN(Date.parse(p.timestamp))).toBe(false)
  return p
}

const ERR = {
  NOT_FOUND: "https://humandbs.dbcls.jp/errors/not-found",
  VALIDATION: "https://humandbs.dbcls.jp/errors/validation-error",
  UNAUTHORIZED: "https://humandbs.dbcls.jp/errors/unauthorized",
  FORBIDDEN: "https://humandbs.dbcls.jp/errors/forbidden",
  CONFLICT: "https://humandbs.dbcls.jp/errors/conflict",
} as const

describe("IT-ERROR-*: RFC 7807 problem details", () => {
  itWithEs("IT-ERROR-01: 404 returns problem+json with not-found type and matching instance/requestId", async () => {
    // IT-ERROR-01
    const app = getApp()
    const path = url("/research/__does_not_exist__")
    const res = await app.request(path)
    expect(res.status).toBe(404)
    expect(res.headers.get("Content-Type") ?? "").toMatch(/application\/problem\+json/)
    const headerId = res.headers.get("X-Request-ID")
    const json = (await res.json()) as unknown
    const p = expectProblem(json, 404, ERR.NOT_FOUND, "Not Found")
    expect(p.instance).toBe(path)
    expect(p.requestId).toBe(headerId ?? undefined)
    expect(headerId).toBeTruthy()
  })

  itWithEs("IT-ERROR-02: 400 validation error has validation-error type", async () => {
    // IT-ERROR-02 (representative: page=0 on `/research`)
    const app = getApp()
    const res = await app.request(url("/research?page=0"))
    expect(res.status).toBe(400)
    expect(res.headers.get("Content-Type") ?? "").toMatch(/application\/problem\+json/)
    expectProblem(await res.json(), 400, ERR.VALIDATION, "Validation Error")
  })

  itWithEs("IT-ERROR-03: 401 for admin-required endpoint without bearer", async () => {
    // IT-ERROR-03
    const app = getApp()
    const res = await app.request(url("/research/new"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(401)
    expect(res.headers.get("Content-Type") ?? "").toMatch(/application\/problem\+json/)
    expectProblem(await res.json(), 401, ERR.UNAUTHORIZED, "Unauthorized")
  })

  itWithNonAdminToken("IT-ERROR-04: 403 when authenticated non-admin hits admin-only endpoint", async (token) => {
    // IT-ERROR-04
    // Hitting POST /research/{humId}/approve as a non-admin should be rejected before any state change.
    // The exact humId is incidental: even nonexistent paths are gated by requireAdmin before the resource lookup.
    const app = getApp()
    const res = await app.request(url("/research/hum0001/approve"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(403)
    expect(res.headers.get("Content-Type") ?? "").toMatch(/application\/problem\+json/)
    expectProblem(await res.json(), 403, ERR.FORBIDDEN, "Forbidden")
  })

  itWithEs("IT-ERROR-08: error timestamp is ISO 8601 within ±60s of wall-clock", async () => {
    // IT-ERROR-08 (representative through IT-ERROR-01).
    const app = getApp()
    const before = Date.now()
    const res = await app.request(url("/research/__does_not_exist__"))
    const after = Date.now()
    const json = (await res.json()) as ProblemDetails
    const ts = Date.parse(json.timestamp)
    expect(Number.isNaN(ts)).toBe(false)
    expect(ts).toBeGreaterThanOrEqual(before - 60_000)
    expect(ts).toBeLessThanOrEqual(after + 60_000)
  })
})
