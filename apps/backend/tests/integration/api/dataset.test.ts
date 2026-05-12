/**
 * IT-DATASET-*: Dataset endpoints (`src/api/routes/dataset.ts`).
 *
 * Reference: `tests/integration-scenarios.md § IT-DATASET-*`.
 *
 * Mutating scenarios (IT-DATASET-12 optimistic lock, IT-DATASET-14 rawHtml strip,
 * IT-DATASET-15 admin-only delete, IT-DATASET-16 cascade delete) require the
 * isolation ES index discussed in the plan. They are stubbed here with a skip
 * note and will be activated once `HUMANDBS_ES_INDEX_*` is in place.
 */
import { beforeAll, describe, expect } from "bun:test"

import type { EsDataset, SearchResponse, SingleReadOnlyResponse } from "@/api/types"

import {
  authHeaders,
  getApp,
  itWithAdminToken,
  itWithEs,
  itWithNonAdminToken,
  setupIntegration,
  url,
} from "./setup"

beforeAll(setupIntegration)

interface ResearchSummary {
  humId: string
  status?: string
  latestVersion?: string | null
  draftVersion?: string | null
}

describe("IT-DATASET-*: Dataset endpoints", () => {
  itWithEs("IT-DATASET-01: GET /dataset returns SearchResponse for public scope", async () => {
    // IT-DATASET-01
    const app = getApp()
    const res = await app.request(url("/dataset?page=1&limit=5&lang=ja"))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SearchResponse<EsDataset>
    expect(json.meta.pagination.page).toBe(1)
    expect(json.meta.pagination.limit).toBe(5)
    expect(json.data.length).toBeLessThanOrEqual(5)
    expect(json.data.length).toBeLessThanOrEqual(json.meta.pagination.total)
  })

  itWithEs("IT-DATASET-02: pagination boundaries (parametrize)", async () => {
    // IT-DATASET-02
    const app = getApp()
    const cases: { qs: string; expected: number }[] = [
      { qs: "page=1&limit=1", expected: 200 },
      { qs: "page=1&limit=100", expected: 200 },
      { qs: "page=1&limit=101", expected: 400 },
      { qs: "page=0&limit=20", expected: 400 },
      { qs: "page=1&limit=0", expected: 400 },
    ]
    for (const c of cases) {
      const res = await app.request(url(`/dataset?${c.qs}`))
      expect(res.status).toBe(c.expected)
    }
  })

  itWithEs("IT-DATASET-03: GET /dataset/{datasetId} carries _seq_no/_primary_term and parsed shape", async () => {
    // IT-DATASET-03
    const app = getApp()
    const listRes = await app.request(url("/dataset?limit=1"))
    const list = (await listRes.json()) as SearchResponse<EsDataset>
    if (list.data.length === 0) {
      console.log("  SKIP IT-DATASET-03: no Dataset in ES")
      return
    }
    const datasetId = list.data[0].datasetId
    const res = await app.request(url(`/dataset/${datasetId}`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<EsDataset> & {
      meta: { _seq_no?: number; _primary_term?: number }
    }
    expect(json.data.datasetId).toBe(datasetId)
    expect(typeof json.meta._seq_no).toBe("number")
    expect(typeof json.meta._primary_term).toBe("number")
  })

  itWithEs("IT-DATASET-04: GET /dataset/{datasetId} with unknown id returns 404 with problem+json", async () => {
    // IT-DATASET-04
    const app = getApp()
    const res = await app.request(url("/dataset/__not_a_datasetId__"))
    expect(res.status).toBe(404)
    expect(res.headers.get("Content-Type") ?? "").toMatch(/application\/problem\+json/)
  })

  itWithEs("IT-DATASET-05: ?version=<v> and /versions/<v> return structurally equivalent data", async () => {
    // IT-DATASET-05
    const app = getApp()
    const listRes = await app.request(url("/dataset?limit=1"))
    const list = (await listRes.json()) as SearchResponse<EsDataset>
    if (list.data.length === 0) {
      console.log("  SKIP IT-DATASET-05: no Dataset in ES")
      return
    }
    const { datasetId, version } = list.data[0]
    const [a, b] = await Promise.all([
      app.request(url(`/dataset/${datasetId}?version=${version}`)),
      app.request(url(`/dataset/${datasetId}/versions/${version}`)),
    ])
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    const aJson = (await a.json()) as SingleReadOnlyResponse<EsDataset>
    const bJson = (await b.json()) as SingleReadOnlyResponse<EsDataset>
    expect(aJson.data.datasetId).toBe(datasetId)
    expect(bJson.data.datasetId).toBe(datasetId)
    expect(aJson.data.version).toBe(version)
    expect(bJson.data.version).toBe(version)
  })

  itWithEs("IT-DATASET-06: unknown version returns 404", async () => {
    // IT-DATASET-06
    const app = getApp()
    const listRes = await app.request(url("/dataset?limit=1"))
    const list = (await listRes.json()) as SearchResponse<EsDataset>
    if (list.data.length === 0) {
      console.log("  SKIP IT-DATASET-06: no Dataset in ES")
      return
    }
    const datasetId = list.data[0].datasetId
    const res = await app.request(url(`/dataset/${datasetId}?version=v999`))
    expect(res.status).toBe(404)
  })

  itWithAdminToken("IT-DATASET-07: dataset whose parent Research is draft (latestVersion=null) is 404 for public", async (token) => {
    // IT-DATASET-07
    // Find a draft Research with `latestVersion === null` and try to GET one of its datasets anonymously.
    const app = getApp()
    const draftRes = await app.request(url("/research?status=draft&limit=20"), { headers: authHeaders(token) })
    const drafts = (await draftRes.json()) as SearchResponse<ResearchSummary>
    const draftWithNullLatest = drafts.data.find((r) => r.latestVersion === null)
    if (!draftWithNullLatest) {
      console.log("  SKIP IT-DATASET-07: no draft Research with latestVersion=null")
      return
    }
    const linkedRes = await app.request(
      url(`/research/${draftWithNullLatest.humId}/dataset`),
      { headers: authHeaders(token) },
    )
    if (linkedRes.status !== 200) {
      console.log(`  SKIP IT-DATASET-07: linked dataset endpoint not 200 (status=${linkedRes.status})`)
      return
    }
    const linked = (await linkedRes.json()) as SearchResponse<EsDataset>
    if (linked.data.length === 0) {
      console.log("  SKIP IT-DATASET-07: draft Research has no Dataset")
      return
    }
    const datasetId = linked.data[0].datasetId
    const adminGet = await app.request(url(`/dataset/${datasetId}`), { headers: authHeaders(token) })
    const publicGet = await app.request(url(`/dataset/${datasetId}`))
    expect(adminGet.status).toBe(200)
    expect(publicGet.status).toBe(404)
  })

  itWithEs("IT-DATASET-09: PUT /dataset/{datasetId}/update without auth returns 401", async () => {
    // IT-DATASET-09
    const app = getApp()
    const listRes = await app.request(url("/dataset?limit=1"))
    const list = (await listRes.json()) as SearchResponse<EsDataset>
    if (list.data.length === 0) {
      console.log("  SKIP IT-DATASET-09: no Dataset in ES")
      return
    }
    const datasetId = list.data[0].datasetId
    const res = await app.request(url(`/dataset/${datasetId}/update`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(401)
  })

  itWithNonAdminToken("IT-DATASET-10: PUT update by non-owner returns 403", async (token) => {
    // IT-DATASET-10
    // A public-list Dataset belongs to a published Research with empty `uids`, so the staging non-admin
    // user is never the owner, and the resource-auth guard must produce 403.
    const app = getApp()
    const listRes = await app.request(url("/dataset?limit=1"))
    const list = (await listRes.json()) as SearchResponse<EsDataset>
    if (list.data.length === 0) {
      console.log("  SKIP IT-DATASET-10: no Dataset in ES")
      return
    }
    const datasetId = list.data[0].datasetId
    const res = await app.request(url(`/dataset/${datasetId}/update`), {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(403)
  })

  itWithAdminToken("IT-DATASET-11: PUT update on a published-parent dataset returns 403 (parent not in draft)", async (token) => {
    // IT-DATASET-11
    // Admin bypasses ownership but the parent-status check still fires per
    // `src/api/routes/dataset.ts:330-331`. Published-list Dataset always has a published parent.
    const app = getApp()
    const listRes = await app.request(url("/dataset?limit=1"))
    const list = (await listRes.json()) as SearchResponse<EsDataset>
    if (list.data.length === 0) {
      console.log("  SKIP IT-DATASET-11: no Dataset in ES")
      return
    }
    const datasetId = list.data[0].datasetId
    const res = await app.request(url(`/dataset/${datasetId}/update`), {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ experiments: [] }),
    })
    expect(res.status).toBe(403)
    const json = (await res.json()) as { title?: string; detail?: string }
    expect(json.title).toBe("Forbidden")
    expect(json.detail ?? "").toMatch(/parent Research is not in draft/i)
  })

  itWithEs("IT-DATASET-17: GET /dataset/{datasetId}/versions returns ascending version array", async () => {
    // IT-DATASET-17
    const app = getApp()
    const listRes = await app.request(url("/dataset?limit=50"))
    const list = (await listRes.json()) as SearchResponse<EsDataset>
    if (list.data.length === 0) {
      console.log("  SKIP IT-DATASET-17: no Dataset in ES")
      return
    }
    // Find any datasetId whose endpoint returns >=1 version (every dataset has at least 1).
    const datasetId = list.data[0].datasetId
    const res = await app.request(url(`/dataset/${datasetId}/versions`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<{ version: string }[]>
    expect(Array.isArray(json.data)).toBe(true)
    expect(json.data.length).toBeGreaterThanOrEqual(1)
    const parseNum = (v: string): number => Number(v.replace(/^v/, ""))
    for (let i = 1; i < json.data.length; i++) {
      expect(parseNum(json.data[i - 1].version)).toBeLessThanOrEqual(parseNum(json.data[i].version))
    }
  })

  itWithEs("IT-DATASET-18: GET /dataset/{datasetId}/research returns the parent Research", async () => {
    // IT-DATASET-18
    const app = getApp()
    const listRes = await app.request(url("/dataset?limit=1"))
    const list = (await listRes.json()) as SearchResponse<EsDataset>
    if (list.data.length === 0) {
      console.log("  SKIP IT-DATASET-18: no Dataset in ES")
      return
    }
    const { datasetId, humId } = list.data[0]
    const res = await app.request(url(`/dataset/${datasetId}/research`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<ResearchSummary>
    expect(json.data.humId).toBe(humId)
  })

  itWithEs("IT-DATASET-19: GET /dataset?humId=<humId> restricts to that humId", async () => {
    // IT-DATASET-19
    const app = getApp()
    const listRes = await app.request(url("/dataset?limit=1"))
    const list = (await listRes.json()) as SearchResponse<EsDataset>
    if (list.data.length === 0) {
      console.log("  SKIP IT-DATASET-19: no Dataset in ES")
      return
    }
    const { humId } = list.data[0]
    const filtered = await app.request(url(`/dataset?humId=${encodeURIComponent(humId)}&limit=50`))
    expect(filtered.status).toBe(200)
    const filteredJson = (await filtered.json()) as SearchResponse<EsDataset>
    for (const d of filteredJson.data) expect(d.humId).toBe(humId)
  })

  // IT-DATASET-08: parent draft with latestVersion!=null は staging に都合よく存在しないと検証できない。
  //   isolation index で fixture を整備したあとに復活させる。
  // IT-DATASET-12: 楽観的ロック → mutating、isolation index 待ち。
  // IT-DATASET-13: experiments required は body validation。Update 経路に到達する前に PUT 自体が 403 で弾かれる
  //   (現状の staging Dataset は published parent 配下しかない)。isolation index 上の draft で実施。
  // IT-DATASET-14: rawHtml strip → mutating、isolation index 待ち。
  // IT-DATASET-15: admin-only delete → mutating、isolation index 待ち (parametrize 形式)。
  // IT-DATASET-16: delete propagation → mutating、isolation index 待ち。
})
