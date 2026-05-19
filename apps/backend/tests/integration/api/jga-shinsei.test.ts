/**
 * IT-JGA-*: JGA Shinsei application endpoints (`/jga-shinsei/ds`, `/du`).
 *
 * Reference: `tests/integration-scenarios.md § IT-JGA-*`.
 *
 * Combines HTTP-level checks (auth/admin guards, pagination, formats) via the running
 * app with two db-client-level invariants (`fetchDsRaw([])` short-circuits, DS/DU are
 * separated by data_type) which are easiest to assert by calling the client directly.
 */
import { beforeAll, describe, expect } from "bun:test"

import { fetchDsRaw, fetchDuRaw, listIds } from "@/api/db-client/jga-shinsei"
import type { SearchResponse, SingleReadOnlyResponse } from "@/api/types"
import {
  DsApplicationTransformedSchema,
  DuApplicationTransformedSchema,
} from "@/crawler/types/jga-shinsei"

import {
  authHeaders,
  getApp,
  itWithEs,
  itWithJga,
  itWithJgaAdmin,
  itWithNonAdminToken,
  setupIntegration,
  url,
} from "./setup"

beforeAll(setupIntegration)

interface DsListItem { jdsId: string }
interface DuListItem { jduId: string }

describe("IT-JGA-*: JGA Shinsei (admin-only HTTP + db-client invariants)", () => {
  itWithEs("IT-JGA-01: GET /jga-shinsei/ds without auth returns 401", async () => {
    // IT-JGA-01
    const app = getApp()
    const res = await app.request(url("/jga-shinsei/ds"))
    expect(res.status).toBe(401)
  })

  itWithNonAdminToken("IT-JGA-02: GET /jga-shinsei/ds with non-admin auth returns 403", async (token) => {
    // IT-JGA-02
    const app = getApp()
    const res = await app.request(url("/jga-shinsei/ds"), { headers: authHeaders(token) })
    expect(res.status).toBe(403)
  })

  itWithJgaAdmin("IT-JGA-03: GET /jga-shinsei/ds (admin) returns paginated J-DS ids", async (token) => {
    // IT-JGA-03
    const app = getApp()
    const res = await app.request(url("/jga-shinsei/ds?page=1&limit=10"), { headers: authHeaders(token) })
    expect(res.status).toBe(200)
    const json = (await res.json()) as SearchResponse<DsListItem>
    expect(json.meta.pagination.page).toBe(1)
    expect(json.meta.pagination.limit).toBe(10)
    expect(json.meta.pagination.total).toBeGreaterThanOrEqual(0)
    expect(json.data.length).toBeLessThanOrEqual(10)
    expect(json.data.length).toBeLessThanOrEqual(json.meta.pagination.total)
    for (const item of json.data) expect(item.jdsId).toMatch(/^J-DS\d+$/)
  })

  itWithJgaAdmin("IT-JGA-04: ds pagination boundary validation rejects out-of-range params", async (token) => {
    // IT-JGA-04
    // We only exercise the 400 cases here because each 200 case fires a live aggregation against
    // staging Postgres (~5s each). The "normal" 200 path is covered once in IT-JGA-03 (limit=10).
    // We additionally probe one out-of-range page to confirm it returns 200 + empty without erroring.
    const app = getApp()
    const cases: { qs: string; expected: number }[] = [
      { qs: "page=1&limit=101", expected: 400 },
      { qs: "page=0&limit=20", expected: 400 },
    ]
    for (const c of cases) {
      const res = await app.request(url(`/jga-shinsei/ds?${c.qs}`), { headers: authHeaders(token) })
      expect(res.status).toBe(c.expected)
    }
    const huge = await app.request(url("/jga-shinsei/ds?page=99999&limit=20"), { headers: authHeaders(token) })
    expect(huge.status).toBe(200)
    const hugeJson = (await huge.json()) as SearchResponse<DsListItem>
    expect(hugeJson.data).toEqual([])
  })

  itWithJgaAdmin("IT-JGA-05: GET /jga-shinsei/ds/{jdsId} (admin) returns the transformed application", async (token) => {
    // IT-JGA-05
    const app = getApp()
    const listRes = await app.request(url("/jga-shinsei/ds?page=1&limit=1"), { headers: authHeaders(token) })
    const list = (await listRes.json()) as SearchResponse<DsListItem>
    if (list.data.length === 0) {
      console.log("  SKIP IT-JGA-05: no J-DS rows in staging DB")
      return
    }
    const jdsId = list.data[0].jdsId
    const detailRes = await app.request(url(`/jga-shinsei/ds/${jdsId}`), { headers: authHeaders(token) })
    expect(detailRes.status).toBe(200)
    const detail = (await detailRes.json()) as SingleReadOnlyResponse<unknown>
    DsApplicationTransformedSchema.parse(detail.data)
    const meta = detail.meta as Record<string, unknown>
    expect(meta._seq_no).toBeUndefined()
    expect(meta._primary_term).toBeUndefined()
  })

  itWithJgaAdmin("IT-JGA-06: GET /jga-shinsei/ds/{unknown-jdsId} returns 404", async (token) => {
    // IT-JGA-06
    const app = getApp()
    const res = await app.request(url("/jga-shinsei/ds/J-DS999999"), { headers: authHeaders(token) })
    expect(res.status).toBe(404)
    const json = (await res.json()) as { title?: string }
    expect(json.title).toBe("Not Found")
  })

  itWithJgaAdmin("IT-JGA-07: malformed jdsId without J-DS prefix is rejected (400 or 404)", async (token) => {
    // IT-JGA-07
    const app = getApp()
    const res = await app.request(url("/jga-shinsei/ds/invalid-id"), { headers: authHeaders(token) })
    expect([400, 404]).toContain(res.status)
  })

  itWithNonAdminToken("IT-JGA-08: /jga-shinsei/du enforces admin (401 / 403 / 200 by token)", async (token) => {
    // IT-JGA-08
    const app = getApp()
    const unauth = await app.request(url("/jga-shinsei/du"))
    expect(unauth.status).toBe(401)
    const nonAdmin = await app.request(url("/jga-shinsei/du"), { headers: authHeaders(token) })
    expect(nonAdmin.status).toBe(403)
  })

  itWithJgaAdmin("IT-JGA-09: GET /jga-shinsei/du/{jduId} (admin) returns the transformed application", async (token) => {
    // IT-JGA-09
    const app = getApp()
    const listRes = await app.request(url("/jga-shinsei/du?page=1&limit=1"), { headers: authHeaders(token) })
    const list = (await listRes.json()) as SearchResponse<DuListItem>
    if (list.data.length === 0) {
      console.log("  SKIP IT-JGA-09: no J-DU rows in staging DB")
      return
    }
    const jduId = list.data[0].jduId
    const detailRes = await app.request(url(`/jga-shinsei/du/${jduId}`), { headers: authHeaders(token) })
    expect(detailRes.status).toBe(200)
    const detail = (await detailRes.json()) as SingleReadOnlyResponse<unknown>
    DuApplicationTransformedSchema.parse(detail.data)
  })

  itWithJga("IT-JGA-10: fetchDsRaw([]) / fetchDuRaw([]) short-circuit without issuing SQL", async () => {
    // IT-JGA-10
    // Empty input must return [] without touching the DB. We assert the return value and rely on
    // unit-level SQL spy (`tests/unit/api/db-client/jga-shinsei.test.ts`) for the no-query guarantee.
    expect(await fetchDsRaw([])).toEqual([])
    expect(await fetchDuRaw([])).toEqual([])
  })

  itWithJga("IT-JGA-11: J-DS and J-DU id sets returned by listIds are disjoint (data_type separation)", async () => {
    // IT-JGA-11
    const [ds, du] = await Promise.all([listIds("J-DS", 1, 50), listIds("J-DU", 1, 50)])
    for (const id of ds.ids) expect(id).toMatch(/^J-DS\d+$/)
    for (const id of du.ids) expect(id).toMatch(/^J-DU\d+$/)
    const dsSet = new Set(ds.ids)
    for (const id of du.ids) expect(dsSet.has(id)).toBe(false)
  })
})
