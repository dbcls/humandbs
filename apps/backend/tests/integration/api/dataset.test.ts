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

import type { BatchResponse, EsDataset, SearchResponse, SingleReadOnlyResponse } from "@/api/types"

import {
  approveResearch,
  createDatasetForResearch,
  createDraftResearch,
  createNewVersion,
  purgeResearch,
  setOwnerUids,
  submitForReview,
} from "./mutating-helpers"
import {
  authHeaders,
  decodeJwtSub,
  getApp,
  itWithAdminToken,
  itWithEs,
  itWithIsolationIndex,
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
    const json = (await res.json()) as SearchResponse<EsDataset & { _seq_no?: number; _primary_term?: number }>
    expect(json.meta.pagination.page).toBe(1)
    expect(json.meta.pagination.limit).toBe(5)
    expect(json.data.length).toBeLessThanOrEqual(5)
    expect(json.data.length).toBeLessThanOrEqual(json.meta.pagination.total)
    // Optimistic-lock fields are detail-only — list items must NOT leak them.
    for (const item of json.data) {
      expect(item._seq_no).toBeUndefined()
      expect(item._primary_term).toBeUndefined()
    }
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
    // loadDatasetAndAuthorize runs before validators, so an unauthenticated PUT is
    // refused at the auth gate (401) and the body schema is never reported back.
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
    // Non-owner is rejected at the ownership gate (403) before validators run.
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

  itWithAdminToken("IT-DATASET-11: PUT update on a published-parent dataset returns 409", async (token) => {
    // IT-DATASET-11
    // Admin bypasses ownership but parent-draft check still fires (409 Conflict)
    // before validators run. The error detail must surface the parent-status
    // reason so a 409 from any earlier gate would not match.
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
    expect(res.status).toBe(409)
    const json = (await res.json()) as { title?: string; detail?: string }
    expect(json.title).toBe("Conflict")
    expect(json.detail ?? "").toMatch(/expected 'draft'/)
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

  itWithEs("IT-DATASET-18: GET /dataset/{datasetId}/research surfaces the parent Research humId", async () => {
    // IT-DATASET-18
    // Staging shape: `data` is an array (1 element per Research version that pins this datasetId).
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
    const json = (await res.json()) as { data: { humId: string }[] }
    expect(Array.isArray(json.data)).toBe(true)
    expect(json.data.length).toBeGreaterThanOrEqual(1)
    for (const r of json.data) expect(r.humId).toBe(humId)
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

  itWithEs("IT-DATASET-BATCH-01: GET /dataset/batch returns datasets in requested order with empty notFound", async () => {
    // IT-DATASET-BATCH-01
    const app = getApp()
    const listRes = await app.request(url("/dataset?limit=3"))
    const list = (await listRes.json()) as SearchResponse<EsDataset>
    if (list.data.length < 2) {
      console.log("  SKIP IT-DATASET-BATCH-01: need >=2 datasets in ES")
      return
    }
    const ids = list.data.slice(0, 2).map(d => d.datasetId)
    // Reverse the listing order to assert the response preserves the requested order.
    const requested = [ids[1], ids[0]]
    const res = await app.request(url(`/dataset/batch?ids=${requested.join(",")}`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as BatchResponse<EsDataset & { _seq_no?: number; _primary_term?: number }>
    expect(json.data.map(d => d.datasetId)).toEqual(requested)
    expect(json.meta.batch.requested).toBe(2)
    expect(json.meta.batch.found).toBe(2)
    expect(json.meta.batch.notFound).toEqual([])
    // Batch is read-oriented: per-item optimistic-lock fields must NOT leak.
    for (const item of json.data) {
      expect(item._seq_no).toBeUndefined()
      expect(item._primary_term).toBeUndefined()
    }
  })

  itWithEs("IT-DATASET-BATCH-02: GET /dataset/batch partial success lists unknown ids in notFound", async () => {
    // IT-DATASET-BATCH-02
    const app = getApp()
    const listRes = await app.request(url("/dataset?limit=1"))
    const list = (await listRes.json()) as SearchResponse<EsDataset>
    if (list.data.length === 0) {
      console.log("  SKIP IT-DATASET-BATCH-02: no Dataset in ES")
      return
    }
    const realId = list.data[0].datasetId
    const res = await app.request(url(`/dataset/batch?ids=${realId},__not_a_datasetId__`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as BatchResponse<EsDataset>
    expect(json.data.map(d => d.datasetId)).toEqual([realId])
    expect(json.meta.batch.requested).toBe(2)
    expect(json.meta.batch.found).toBe(1)
    expect(json.meta.batch.notFound).toContain("__not_a_datasetId__")
  })

  itWithEs("IT-DATASET-BATCH-03: GET /dataset/batch rejects empty/missing/over-limit ids", async () => {
    // IT-DATASET-BATCH-03
    const app = getApp()
    const empty = await app.request(url("/dataset/batch?ids="))
    expect(empty.status).toBe(400)
    const missing = await app.request(url("/dataset/batch"))
    expect(missing.status).toBe(400)
    const overLimit = Array.from({ length: 101 }, (_v, i) => `JGAD${String(i).padStart(6, "0")}`).join(",")
    const over = await app.request(url(`/dataset/batch?ids=${overLimit}`))
    expect(over.status).toBe(400)
  })

  itWithAdminToken("IT-DATASET-BATCH-04: draft-parent dataset is notFound for public, found for admin", async (token) => {
    // IT-DATASET-BATCH-04
    // Mirrors IT-DATASET-07 in batch form: missing and access-denied collapse to notFound.
    const app = getApp()
    const draftRes = await app.request(url("/research?status=draft&limit=20"), { headers: authHeaders(token) })
    const drafts = (await draftRes.json()) as SearchResponse<ResearchSummary>
    const draftWithNullLatest = drafts.data.find((r) => r.latestVersion === null)
    if (!draftWithNullLatest) {
      console.log("  SKIP IT-DATASET-BATCH-04: no draft Research with latestVersion=null")
      return
    }
    const linkedRes = await app.request(
      url(`/research/${draftWithNullLatest.humId}/dataset`),
      { headers: authHeaders(token) },
    )
    if (linkedRes.status !== 200) {
      console.log(`  SKIP IT-DATASET-BATCH-04: linked dataset endpoint not 200 (status=${linkedRes.status})`)
      return
    }
    const linked = (await linkedRes.json()) as SearchResponse<EsDataset>
    if (linked.data.length === 0) {
      console.log("  SKIP IT-DATASET-BATCH-04: draft Research has no Dataset")
      return
    }
    const datasetId = linked.data[0].datasetId

    const publicRes = await app.request(url(`/dataset/batch?ids=${datasetId}`))
    expect(publicRes.status).toBe(200)
    const publicJson = (await publicRes.json()) as BatchResponse<EsDataset>
    expect(publicJson.data).toHaveLength(0)
    expect(publicJson.meta.batch.notFound).toContain(datasetId)

    const adminRes = await app.request(url(`/dataset/batch?ids=${datasetId}`), { headers: authHeaders(token) })
    expect(adminRes.status).toBe(200)
    const adminJson = (await adminRes.json()) as BatchResponse<EsDataset>
    expect(adminJson.data.map(d => d.datasetId)).toContain(datasetId)
    expect(adminJson.meta.batch.found).toBe(1)
  })

  // IT-DATASET-08: 親 Research が draft かつ latestVersion!=null は現実装の状態遷移経路上に出現しない
  //   (approve→unpublish は latestVersion を draftVersion に移すため latestVersion=null になる)。
  //   解決ルール自体は tests/unit/api/utils/version.test.ts で人工 doc を用いて検証している。

  itWithIsolationIndex("IT-DATASET-12: PUT /dataset/{datasetId}/update with stale _seq_no returns 409", async ({ admin, nonAdmin }) => {
    // IT-DATASET-12
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const ds = await createDatasetForResearch(nonAdmin, humId)
      const app = getApp()
      const valid = {
        humId,
        humVersionId: `${humId}-v1`,
        releaseDate: ds.releaseDate ?? new Date().toISOString().split("T")[0],
        criteria: ds.criteria ?? "Controlled-access (Type I)",
        typeOfData: { ja: null, en: null },
        experiments: [],
      }
      // Send an explicitly stale `_seq_no` (a value that cannot match the current
      // ES `_seq_no` for this document, regardless of any preceding writes). ES
      // rejects with version_conflict_engine_exception → 409.
      const stale = await app.request(url(`/dataset/${ds.datasetId}/update`), {
        method: "PUT",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: JSON.stringify({ ...valid, _seq_no: 999_999_999, _primary_term: ds.primaryTerm }),
      })
      expect(stale.status).toBe(409)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-DATASET-13: PUT /dataset/{datasetId}/update with experiments missing header/data returns 400", async ({ admin, nonAdmin }) => {
    // IT-DATASET-13
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const ds = await createDatasetForResearch(nonAdmin, humId)
      const app = getApp()
      const res = await app.request(url(`/dataset/${ds.datasetId}/update`), {
        method: "PUT",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: JSON.stringify({
          humId,
          humVersionId: `${humId}-v1`,
          releaseDate: ds.releaseDate ?? new Date().toISOString().split("T")[0],
          criteria: ds.criteria ?? "Controlled-access (Type I)",
          typeOfData: { ja: null, en: null },
          // Each experiments item must declare header and data; an empty object is a schema violation.
          experiments: [{}],
          _seq_no: ds.seqNo,
          _primary_term: ds.primaryTerm,
        }),
      })
      expect(res.status).toBe(400)
      const json = (await res.json()) as { detail?: string; errors?: unknown }
      const serialized = JSON.stringify(json)
      expect(serialized).toMatch(/header/i)
      expect(serialized).toMatch(/data/i)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-DATASET-14: PUT /dataset/{datasetId}/update silently strips rawHtml fields in body", async ({ admin, nonAdmin }) => {
    // IT-DATASET-14
    // SSOT mentions typeOfData; the live UpdateDatasetRequestSchema has typeOfData as bilingual
    // simple strings (no rawHtml). The observable rawHtml-bearing field on a Dataset is
    // experiments[].header / data values, so we exercise the strip via experiments[].header.
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const ds = await createDatasetForResearch(nonAdmin, humId)
      const app = getApp()
      const res = await app.request(url(`/dataset/${ds.datasetId}/update`), {
        method: "PUT",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: JSON.stringify({
          humId,
          humVersionId: `${humId}-v1`,
          releaseDate: ds.releaseDate ?? new Date().toISOString().split("T")[0],
          criteria: ds.criteria ?? "Controlled-access (Type I)",
          typeOfData: { ja: null, en: null },
          experiments: [{
            header: {
              ja: { text: "実験 A", rawHtml: "<p>実験 A</p>" },
              en: { text: "Experiment A", rawHtml: "<p>Experiment A</p>" },
            },
            data: {},
          }],
          _seq_no: ds.seqNo,
          _primary_term: ds.primaryTerm,
        }),
      })
      expect(res.status).toBe(200)
      const get = await app.request(url(`/dataset/${ds.datasetId}?includeRawHtml=true`), {
        headers: authHeaders(admin),
      })
      const getJson = (await get.json()) as SingleReadOnlyResponse<{
        experiments?: { header?: { ja?: { rawHtml?: unknown } } }[]
      }>
      expect(getJson.data.experiments?.[0]?.header?.ja?.rawHtml).toBeNull()
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-DATASET-15: POST /dataset/{datasetId}/delete is admin-only (401/403/403/204)", async ({ admin, nonAdmin }) => {
    // IT-DATASET-15
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      // Initially leave uids empty so the dataset must be created by admin (non-owner case).
      const ds = await createDatasetForResearch(admin, humId)
      const app = getApp()
      // 1) unauthenticated → 401 (requireAuth middleware)
      const noAuth = await app.request(url(`/dataset/${ds.datasetId}/delete`), { method: "POST" })
      expect(noAuth.status).toBe(401)
      // 2) authenticated non-owner → 403 (requireAdmin middleware)
      const nonOwner = await app.request(url(`/dataset/${ds.datasetId}/delete`), {
        method: "POST",
        headers: authHeaders(nonAdmin),
      })
      expect(nonOwner.status).toBe(403)
      // 3) authenticated owner (non-admin) → still 403 because delete is admin-only
      await setOwnerUids(admin, humId, [sub!])
      const ownerNonAdmin = await app.request(url(`/dataset/${ds.datasetId}/delete`), {
        method: "POST",
        headers: authHeaders(nonAdmin),
      })
      expect(ownerNonAdmin.status).toBe(403)
      // 4) admin → 204
      const adminDel = await app.request(url(`/dataset/${ds.datasetId}/delete`), {
        method: "POST",
        headers: authHeaders(admin),
      })
      expect(adminDel.status).toBe(204)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-DATASET-T7: concurrent first-PUT bump produces exactly one new version (no orphan)", async ({ admin, nonAdmin }) => {
    // Two parallel PUTs against a v1 Dataset whose parent Research just
    // entered a v2 draft cycle must result in `{200, 409}` and a single new
    // Dataset version (`v2`). The orphan-free invariant is what `refresh:
    // "wait_for"` on the compensating delete (es-client/dataset.ts:404) is
    // there to guarantee.
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      // 1. Set up a published Research with one Dataset at v1.
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const ds = await createDatasetForResearch(nonAdmin, humId)
      await submitForReview(nonAdmin, humId)
      await approveResearch(admin, humId)
      // 2. Open a new draft cycle on the parent Research (latestVersion=v1, draftVersion=v2).
      await createNewVersion(nonAdmin, humId)

      // 3. Read the v1 Dataset back so both racers start from the same _seq_no.
      const app = getApp()
      const dsGet = await app.request(url(`/dataset/${ds.datasetId}?version=v1`), {
        headers: authHeaders(nonAdmin),
      })
      expect(dsGet.status).toBe(200)
      const dsJson = (await dsGet.json()) as SingleReadOnlyResponse<EsDataset> & {
        meta: { _seq_no: number; _primary_term: number }
      }

      const putBody = JSON.stringify({
        humId,
        humVersionId: `${humId}-v2`,
        releaseDate: ds.releaseDate ?? new Date().toISOString().split("T")[0],
        criteria: ds.criteria ?? "Controlled-access (Type I)",
        typeOfData: { ja: null, en: null },
        experiments: [],
        _seq_no: dsJson.meta._seq_no,
        _primary_term: dsJson.meta._primary_term,
      })
      const headers = { ...authHeaders(nonAdmin), "Content-Type": "application/json" }

      // 4. Fire both PUTs at the same time. Both will compute nextVersion=v2 and
      //    race to `op_type:create` the new dataset doc; ES makes exactly one win.
      const [a, b] = await Promise.all([
        app.request(url(`/dataset/${ds.datasetId}/update?version=v1`), { method: "PUT", headers, body: putBody }),
        app.request(url(`/dataset/${ds.datasetId}/update?version=v1`), { method: "PUT", headers, body: putBody }),
      ])
      const statuses = [a.status, b.status].sort((x, y) => x - y)
      expect(statuses).toEqual([200, 409])

      // 5. Versions endpoint must show exactly v1 + v2; the loser's compensating
      //    delete (refresh:wait_for) must have removed any orphan it created.
      const versions = await app.request(url(`/dataset/${ds.datasetId}/versions`), {
        headers: authHeaders(admin),
      })
      expect(versions.status).toBe(200)
      const vjson = (await versions.json()) as SingleReadOnlyResponse<{ version: string }[]>
      const versionSet = new Set(vjson.data.map(d => d.version))
      expect(versionSet.has("v1")).toBe(true)
      expect(versionSet.has("v2")).toBe(true)
      expect(versionSet.size).toBe(2)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-DATASET-T8: PUT update rejects body.humId that does not match the dataset's parent linkage", async ({ admin, nonAdmin }) => {
    // The handler authorizes against the URL-resolved parent Research only; a
    // body that overrides humId would otherwise try to reattach the dataset
    // to an unrelated Research. The handler rejects such bodies with 400
    // before reaching the writer. (humVersionId rotates across draft cycles
    // so it is not compared at the handler boundary; the ES layer pins it
    // from the existing dataset doc + parent.draftVersion regardless.)
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humIdA = ""
    let humIdB = ""
    try {
      const a = await createDraftResearch(admin)
      humIdA = a.humId
      await setOwnerUids(admin, humIdA, [sub!])
      const b = await createDraftResearch(admin)
      humIdB = b.humId

      const ds = await createDatasetForResearch(nonAdmin, humIdA)
      const app = getApp()
      const tamperedBody = {
        humId: humIdB,
        humVersionId: `${humIdB}-v1`,
        releaseDate: ds.releaseDate ?? new Date().toISOString().split("T")[0],
        criteria: ds.criteria ?? "Controlled-access (Type I)",
        typeOfData: { ja: null, en: null },
        experiments: [],
        _seq_no: ds.seqNo,
        _primary_term: ds.primaryTerm,
      }
      const tampered = await app.request(url(`/dataset/${ds.datasetId}/update`), {
        method: "PUT",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: JSON.stringify(tamperedBody),
      })
      expect(tampered.status).toBe(400)

      // Sanity check: the same body with the correct linkage succeeds.
      const ok = await app.request(url(`/dataset/${ds.datasetId}/update`), {
        method: "PUT",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: JSON.stringify({ ...tamperedBody, humId: humIdA, humVersionId: `${humIdA}-v1` }),
      })
      expect(ok.status).toBe(200)
    } finally {
      if (humIdA) await purgeResearch(admin, humIdA)
      if (humIdB) await purgeResearch(admin, humIdB)
    }
  })

  itWithIsolationIndex("IT-DATASET-16: admin delete removes the Dataset from GET and from the parent dataset list", async ({ admin, nonAdmin }) => {
    // IT-DATASET-16
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const ds = await createDatasetForResearch(nonAdmin, humId)
      const app = getApp()
      const del = await app.request(url(`/dataset/${ds.datasetId}/delete`), {
        method: "POST",
        headers: authHeaders(admin),
      })
      expect(del.status).toBe(204)
      const get = await app.request(url(`/dataset/${ds.datasetId}`), { headers: authHeaders(admin) })
      expect(get.status).toBe(404)
      const linked = await app.request(url(`/research/${humId}/dataset`), {
        headers: authHeaders(admin),
      })
      const linkedJson = (await linked.json()) as SearchResponse<{ datasetId: string }>
      for (const d of linkedJson.data) {
        expect(d.datasetId).not.toBe(ds.datasetId)
      }
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })
})
