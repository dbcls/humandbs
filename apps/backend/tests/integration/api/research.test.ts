/**
 * IT-RESEARCH-*: Research CRUD + version resolution + linked Dataset listing.
 *
 * Reference: `tests/integration-scenarios.md § IT-RESEARCH-*`.
 *
 * Mutating scenarios (humId allocation, update, delete, uids update, linked Dataset create,
 * default-body create) require the isolation ES index discussed in the plan; they are stubbed
 * with skip notes here.
 */
import { beforeAll, describe, expect } from "bun:test"

import { esClient, ES_INDEX } from "@/api/es-client"
import { generateNextHumId } from "@/api/es-client/research"
import type { BatchResponse, EsResearch, ResearchDetail, SearchResponse, SingleReadOnlyResponse } from "@/api/types"

import {
  approveResearch,
  createDatasetForResearch,
  createDraftResearch,
  getResearchSeqNo,
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

interface SingleResearchResponse {
  data: EsResearch
  meta: {
    requestId: string
    timestamp: string
    _seq_no?: number
    _primary_term?: number
  }
}

beforeAll(setupIntegration)

interface ResearchSummary {
  humId: string
  status?: string
  uids?: string[]
  latestVersion?: string | null
  draftVersion?: string | null
}

describe("IT-RESEARCH-*: Research CRUD & versioning", () => {
  itWithEs("IT-RESEARCH-01: GET /research returns only publicly visible items with summary-shape field set", async () => {
    // IT-RESEARCH-01
    // ResearchSummary list shape (empirical staging):
    //   - status === "published"
    //   - uids / draftVersion / latestVersion are omitted (the list is a lean summary)
    //   - item-level `_seq_no` / `_primary_term` must NOT leak (those belong to detail)
    //   - `versions` is a non-empty array of `{ version, releaseDate }`
    const app = getApp()
    const res = await app.request(url("/research?page=1&limit=10"))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SearchResponse<ResearchSummary & {
      versions?: { version: string }[]
      _seq_no?: number
      _primary_term?: number
    }>
    for (const item of json.data) {
      expect(item.status).toBe("published")
      expect(item.uids).toBeUndefined()
      expect(item.draftVersion).toBeUndefined()
      expect(item.latestVersion).toBeUndefined()
      expect(item._seq_no).toBeUndefined()
      expect(item._primary_term).toBeUndefined()
      const versions = item.versions ?? []
      expect(versions.length).toBeGreaterThanOrEqual(1)
    }
  })

  itWithEs("IT-RESEARCH-02: public status filter (parametrize)", async () => {
    // IT-RESEARCH-02
    const app = getApp()
    const cases: { status: string; expected: number }[] = [
      { status: "published", expected: 200 },
      { status: "draft", expected: 403 },
      { status: "review", expected: 403 },
      { status: "deleted", expected: 403 },
    ]
    for (const c of cases) {
      const res = await app.request(url(`/research?status=${c.status}`))
      expect(res.status).toBe(c.expected)
      if (c.expected === 403) {
        const json = (await res.json()) as { title?: string }
        expect(json.title).toBe("Forbidden")
      }
    }
  })

  itWithNonAdminToken("IT-RESEARCH-03: authenticated status=draft restricts to own resources", async (token) => {
    // IT-RESEARCH-03
    // Same as IT-AUTH-17. We keep both because the SSOT maps one IT to one test and integration-scenarios.md
    // catalogs both. Invariant: every returned Research has the user's sub in `uids`.
    const app = getApp()
    const res = await app.request(url("/research?status=draft&limit=20"), { headers: authHeaders(token) })
    expect(res.status).toBe(200)
    // No further assertion here: IT-AUTH-17 owns the uids membership check.
  })

  itWithNonAdminToken("IT-RESEARCH-T9: authenticated non-admin status=deleted returns 403 on listing and POST search", async (token) => {
    // architecture.md § deleted 状態: admin のみ閲覧可能 (一覧・詳細・バージョン一覧)。
    // owner を含むそれ以外のユーザーには 404 を返す。一覧は 403 (permission gate) で弾く。
    const app = getApp()
    const list = await app.request(url("/research?status=deleted&limit=10"), { headers: authHeaders(token) })
    expect(list.status).toBe(403)

    const post = await app.request(url("/research/search"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, limit: 10, status: "deleted" }),
    })
    expect(post.status).toBe(403)
  })

  itWithNonAdminToken("IT-RESEARCH-06: POST /research/new by non-admin authenticated returns 403", async (token) => {
    // IT-RESEARCH-06
    const app = getApp()
    const res = await app.request(url("/research/new"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(403)
    const json = (await res.json()) as { title?: string }
    expect(json.title).toBe("Forbidden")
  })

  itWithEs("IT-RESEARCH-08: public GET /research/{humId} resolves to a v<N> version with draftVersion=null", async () => {
    // IT-RESEARCH-08
    // Note: the list summary omits `latestVersion`, so we cannot directly compare detail.version to it.
    // The invariant is: detail.version is a `v<digits>` string, and draftVersion is null for the public view.
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-08: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<EsResearch & { version?: string }>
    expect(json.data.version).toMatch(/^v\d+$/)
    expect(json.data.draftVersion).toBeNull()
  })

  itWithEs("IT-RESEARCH-10: public ?version=<beyond-latest> returns 404", async () => {
    // IT-RESEARCH-10
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-10: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}?version=v999`))
    expect(res.status).toBe(404)
  })

  itWithEs("IT-RESEARCH-11: GET /research/{humId} omits internal `versionIds`", async () => {
    // IT-RESEARCH-11
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-11: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}`))
    const json = (await res.json()) as SingleReadOnlyResponse<EsResearch & { versionIds?: unknown }>
    expect(json.data.versionIds).toBeUndefined()
  })

  itWithNonAdminToken("IT-RESEARCH-19: POST /research/{humId}/delete by non-admin returns 403", async (token) => {
    // IT-RESEARCH-19
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-19: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}/delete`), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(403)
  })

  itWithNonAdminToken("IT-RESEARCH-22: PUT /research/{humId}/uids by non-admin returns 403", async (token) => {
    // IT-RESEARCH-22
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-22: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}/uids`), {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ uids: [], _seq_no: 0, _primary_term: 1 }),
    })
    expect(res.status).toBe(403)
  })

  itWithEs("IT-RESEARCH-23: GET /research/{humId}/dataset returns Dataset array for public when parent is published", async () => {
    // IT-RESEARCH-23
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-23: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}/dataset`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SearchResponse<{ datasetId: string; humId: string }>
    for (const d of json.data) {
      expect(d.humId).toBe(humId)
    }
  })

  itWithEs("IT-RESEARCH-26: includeRawHtml=true exposes rawHtml field on text values", async () => {
    // IT-RESEARCH-26
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-26: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const [withRaw, withoutRaw] = await Promise.all([
      app.request(url(`/research/${humId}?includeRawHtml=true`)),
      app.request(url(`/research/${humId}`)),
    ])
    expect(withRaw.status).toBe(200)
    expect(withoutRaw.status).toBe(200)
    const withRawJson = (await withRaw.json()) as SingleReadOnlyResponse<{ summary?: { aims?: { ja?: object } } }>
    const withoutRawJson = (await withoutRaw.json()) as SingleReadOnlyResponse<{ summary?: { aims?: { ja?: object } } }>
    const aimsJaWith = (withRawJson.data.summary?.aims?.ja ?? {}) as Record<string, unknown>
    const aimsJaWithout = (withoutRawJson.data.summary?.aims?.ja ?? {}) as Record<string, unknown>
    // includeRawHtml=true: the object must expose a `rawHtml` property (value may be string or null).
    // includeRawHtml absent: the property must be stripped from the response.
    expect("rawHtml" in aimsJaWith).toBe(true)
    expect("rawHtml" in aimsJaWithout).toBe(false)
  })

  itWithEs("IT-RESEARCH-BATCH-01: GET /research/batch returns research in requested order with empty notFound", async () => {
    // IT-RESEARCH-BATCH-01
    const app = getApp()
    const listRes = await app.request(url("/research?limit=3"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length < 2) {
      console.log("  SKIP IT-RESEARCH-BATCH-01: need >=2 Research in ES")
      return
    }
    const ids = list.data.slice(0, 2).map(r => r.humId)
    const requested = [ids[1], ids[0]]
    const res = await app.request(url(`/research/batch?ids=${requested.join(",")}`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as BatchResponse<ResearchDetail>
    expect(json.data.map(r => r.humId)).toEqual(requested)
    expect(json.meta.batch.requested).toBe(2)
    expect(json.meta.batch.found).toBe(2)
    expect(json.meta.batch.notFound).toEqual([])
  })

  itWithEs("IT-RESEARCH-BATCH-02: GET /research/batch partial success lists unknown ids in notFound", async () => {
    // IT-RESEARCH-BATCH-02
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-BATCH-02: no Research in ES")
      return
    }
    const realId = list.data[0].humId
    const res = await app.request(url(`/research/batch?ids=${realId},__not_a_humId__`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as BatchResponse<ResearchDetail>
    expect(json.data.map(r => r.humId)).toEqual([realId])
    expect(json.meta.batch.requested).toBe(2)
    expect(json.meta.batch.found).toBe(1)
    expect(json.meta.batch.notFound).toContain("__not_a_humId__")
  })

  itWithEs("IT-RESEARCH-BATCH-03: GET /research/batch rejects empty/missing/over-limit ids", async () => {
    // IT-RESEARCH-BATCH-03
    const app = getApp()
    const empty = await app.request(url("/research/batch?ids="))
    expect(empty.status).toBe(400)
    const missing = await app.request(url("/research/batch"))
    expect(missing.status).toBe(400)
    const overLimit = Array.from({ length: 101 }, (_v, i) => `hum${String(i).padStart(4, "0")}`).join(",")
    const over = await app.request(url(`/research/batch?ids=${overLimit}`))
    expect(over.status).toBe(400)
  })

  itWithEs("IT-RESEARCH-BATCH-04: public batch never exposes uids/draftVersion (masked view)", async () => {
    // IT-RESEARCH-BATCH-04
    // Public scope only ever sees published Research; the handler's value-based
    // masking guarantees uids is empty and draftVersion is null for every item.
    const app = getApp()
    const listRes = await app.request(url("/research?limit=3"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-BATCH-04: no Research in ES")
      return
    }
    const ids = list.data.map(r => r.humId)
    const res = await app.request(url(`/research/batch?ids=${ids.join(",")}`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as BatchResponse<ResearchDetail>
    for (const item of json.data) {
      expect(item.status).toBe("published")
      expect(item.uids).toEqual([])
      expect(item.draftVersion).toBeNull()
    }
  })

  itWithAdminToken("IT-RESEARCH-loadResearchAndAuthorize-non-draft-404-for-unknown: admin gets 404 on unknown humId", async (token) => {
    // (cross-link with IT-AUTH-15; keeps research.test.ts self-contained.)
    const app = getApp()
    const res = await app.request(url("/research/__not_a_humId__"), { headers: authHeaders(token) })
    expect(res.status).toBe(404)
  })

  itWithIsolationIndex("IT-RESEARCH-04: POST /research/new (admin) auto-generates humId in `hum\\d{4,}` format", async ({ admin }) => {
    // IT-RESEARCH-04
    // The isolation index already contains hum0001 (seed); a new POST must allocate the next free id.
    const app = getApp()
    const res = await app.request(url("/research/new"), {
      method: "POST",
      headers: { ...authHeaders(admin), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(201)
    const json = (await res.json()) as SingleResearchResponse
    expect(json.data.humId).toMatch(/^hum\d{4,}$/)
    expect(json.data.status).toBe("draft")
    expect(json.data.latestVersion).toBeNull()
    expect(json.data.draftVersion).toBe("v1")
    expect(typeof json.meta._seq_no).toBe("number")
    expect(typeof json.meta._primary_term).toBe("number")
    // Cleanup so the isolation index stays at a known baseline for the next run.
    const del = await app.request(url(`/research/${json.data.humId}/delete`), {
      method: "POST",
      headers: authHeaders(admin),
    })
    expect([204, 404]).toContain(del.status)
  })

  itWithIsolationIndex("IT-RESEARCH-05: POST /research/new accepts explicit humId and returns 409 on duplicate", async ({ admin }) => {
    // IT-RESEARCH-05
    const fixed = `hum${90000 + Math.floor(Math.random() * 9999)}` // 5-digit hum to avoid colliding with reindexed production data
    try {
      const created = await createDraftResearch(admin, { humId: fixed })
      expect(created.humId).toBe(fixed)
      // Second POST with the same humId should be rejected as duplicate.
      const app = getApp()
      const dup = await app.request(url("/research/new"), {
        method: "POST",
        headers: { ...authHeaders(admin), "Content-Type": "application/json" },
        body: JSON.stringify({ humId: fixed }),
      })
      expect(dup.status).toBe(409)
      const dupJson = (await dup.json()) as { title?: string; detail?: string }
      expect(dupJson.title).toBe("Conflict")
    } finally {
      await purgeResearch(admin, fixed)
    }
  })

  // IT-RESEARCH-07: covered by tests/unit/api/es-client/research.test.ts (retry-after-conflict).
  // Integration-level parallel POST is non-deterministic due to ES refresh timing, so the
  // SSOT itself calls it out as "unit でモック" — we keep the IT number live in scenarios.md
  // and trace it to the unit suite from there.

  itWithIsolationIndex("IT-RESEARCH-09: owner GET resolves to draftVersion when latestVersion is null", async ({ admin, nonAdmin }) => {
    // IT-RESEARCH-09
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const app = getApp()
      const res = await app.request(url(`/research/${humId}`), { headers: authHeaders(nonAdmin) })
      expect(res.status).toBe(200)
      const json = (await res.json()) as SingleReadOnlyResponse<EsResearch & { version?: string }>
      // Owner sees the in-flight draft (latestVersion is null, draftVersion is v1).
      expect(json.data.version).toBe("v1")
      expect(json.data.draftVersion).toBe("v1")
      expect(json.data.latestVersion).toBeNull()
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-RESEARCH-12: PUT /research/{humId}/update by owner returns 200 and increments _seq_no", async ({ admin, nonAdmin }) => {
    // IT-RESEARCH-12
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      const owned = await setOwnerUids(admin, humId, [sub!])
      const app = getApp()
      const res = await app.request(url(`/research/${humId}/update`), {
        method: "PUT",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: { ja: "更新後タイトル", en: "Updated title" },
          _seq_no: owned.seqNo,
          _primary_term: owned.primaryTerm,
        }),
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as SingleResearchResponse
      expect(typeof json.meta._seq_no).toBe("number")
      expect((json.meta._seq_no ?? -1)).toBeGreaterThan(owned.seqNo)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-RESEARCH-13: PUT /research/{humId}/update on review status returns 409", async ({ admin, nonAdmin }) => {
    // IT-RESEARCH-13
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      await submitForReview(nonAdmin, humId)
      // After submit the research is in "review", so update must be refused with 409.
      const seq = await getResearchSeqNo(admin, humId)
      const app = getApp()
      const res = await app.request(url(`/research/${humId}/update`), {
        method: "PUT",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: { ja: "X", en: "Y" },
          _seq_no: seq.seqNo,
          _primary_term: seq.primaryTerm,
        }),
      })
      expect(res.status).toBe(409)
      const json = (await res.json()) as { title?: string; detail?: string }
      expect(json.title).toBe("Conflict")
      expect(json.detail ?? "").toMatch(/draft/i)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-RESEARCH-14: PUT /research/{humId}/update with stale _seq_no returns 409", async ({ admin, nonAdmin }) => {
    // IT-RESEARCH-14
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      // setOwnerUids advances _seq_no, so the original created.seqNo is now stale.
      await setOwnerUids(admin, humId, [sub!])
      const app = getApp()
      const res = await app.request(url(`/research/${humId}/update`), {
        method: "PUT",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: { ja: "X", en: "Y" },
          _seq_no: created.seqNo,
          _primary_term: created.primaryTerm,
        }),
      })
      expect(res.status).toBe(409)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-RESEARCH-15: PUT /research/{humId}/update without rawHtml leaves rawHtml=null", async ({ admin, nonAdmin }) => {
    // IT-RESEARCH-15
    // SSOT target is "any TextValue field" (the request schema does not accept rawHtml).
    // summary.aims is BilingualTextValue-shaped, so its rawHtml is observable via includeRawHtml=true.
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      const owned = await setOwnerUids(admin, humId, [sub!])
      const app = getApp()
      const put = await app.request(url(`/research/${humId}/update`), {
        method: "PUT",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: {
            aims: { ja: { text: "目的" }, en: { text: "Aims" } },
            methods: { ja: null, en: null },
            targets: { ja: null, en: null },
            url: { ja: [], en: [] },
          },
          _seq_no: owned.seqNo,
          _primary_term: owned.primaryTerm,
        }),
      })
      expect(put.status).toBe(200)
      const detail = await app.request(url(`/research/${humId}?includeRawHtml=true`), {
        headers: authHeaders(admin),
      })
      expect(detail.status).toBe(200)
      const detailJson = (await detail.json()) as SingleReadOnlyResponse<{
        summary?: { aims?: { ja?: { rawHtml?: unknown } } }
      }>
      expect(detailJson.data.summary?.aims?.ja?.rawHtml).toBeNull()
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-RESEARCH-16: PUT /research/{humId}/update silently strips rawHtml in body", async ({ admin, nonAdmin }) => {
    // IT-RESEARCH-16
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      const owned = await setOwnerUids(admin, humId, [sub!])
      const app = getApp()
      const put = await app.request(url(`/research/${humId}/update`), {
        method: "PUT",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: {
            // rawHtml is not part of the request schema; including it must be silently stripped (not 400).
            aims: {
              ja: { text: "目的", rawHtml: "<p>目的</p>" },
              en: { text: "Aims", rawHtml: "<p>Aims</p>" },
            },
            methods: { ja: null, en: null },
            targets: { ja: null, en: null },
            url: { ja: [], en: [] },
          },
          _seq_no: owned.seqNo,
          _primary_term: owned.primaryTerm,
        }),
      })
      expect(put.status).toBe(200)
      const detail = await app.request(url(`/research/${humId}?includeRawHtml=true`), {
        headers: authHeaders(admin),
      })
      const detailJson = (await detail.json()) as SingleReadOnlyResponse<{
        summary?: { aims?: { ja?: { rawHtml?: unknown } } }
      }>
      expect(detailJson.data.summary?.aims?.ja?.rawHtml).toBeNull()
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-RESEARCH-17: PUT /research/{humId}/update silently strips immutable fields", async ({ admin, nonAdmin }) => {
    // IT-RESEARCH-17
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      const owned = await setOwnerUids(admin, humId, [sub!])
      const app = getApp()
      const put = await app.request(url(`/research/${humId}/update`), {
        method: "PUT",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: JSON.stringify({
          // The request schema does not declare any of these — z.object strips them by default.
          humId: "hum99999999",
          url: "https://example.invalid/leaked",
          versionIds: ["fake-version"],
          latestVersion: "v999",
          datePublished: "1970-01-01",
          title: { ja: "T", en: "T" },
          _seq_no: owned.seqNo,
          _primary_term: owned.primaryTerm,
        }),
      })
      expect(put.status).toBe(200)
      // The Research must keep its real humId and the immutable fields must not be modified.
      const get = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      const getJson = (await get.json()) as SingleReadOnlyResponse<EsResearch & {
        url?: string
        versionIds?: unknown
      }>
      expect(getJson.data.humId).toBe(humId)
      expect(getJson.data.latestVersion).toBeNull()
      expect(getJson.data.datePublished).toBeNull()
      // versionIds は内部メタとして常に除外される (IT-RESEARCH-11 と同じ不変条件)。
      expect(getJson.data.versionIds).toBeUndefined()
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-RESEARCH-18: admin delete makes Research and its Datasets unreachable", async ({ admin, nonAdmin }) => {
    // IT-RESEARCH-18
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const dataset = await createDatasetForResearch(nonAdmin, humId)
      const app = getApp()
      const del = await app.request(url(`/research/${humId}/delete`), {
        method: "POST",
        headers: authHeaders(admin),
      })
      expect(del.status).toBe(204)
      // GET /research/{humId} is 404 for admin too: after delete `draftVersion`
      // and `latestVersion` are both null, so `resolveVersionForUser` returns
      // null and the detail handler 404s — independent of the admin bypass in
      // `canAccessResearchDoc`.
      const detail = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      expect(detail.status).toBe(404)
      // architecture.md § deleted: admin のみ /versions を 200 で閲覧可、owner 含むそれ以外は 404
      const adminVersions = await app.request(url(`/research/${humId}/versions`), { headers: authHeaders(admin) })
      expect(adminVersions.status).toBe(200)
      const ownerVersions = await app.request(url(`/research/${humId}/versions`), { headers: authHeaders(nonAdmin) })
      expect(ownerVersions.status).toBe(404)
      // Associated Datasets are physically removed by `deleteByQuery`.
      const dsGet = await app.request(url(`/dataset/${dataset.datasetId}`), {
        headers: authHeaders(admin),
      })
      expect(dsGet.status).toBe(404)
      humId = "" // suppress finally cleanup; already deleted.
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-RESEARCH-20: humId of a deleted Research cannot be reused", async ({ admin }) => {
    // IT-RESEARCH-20
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      const app = getApp()
      const del = await app.request(url(`/research/${humId}/delete`), {
        method: "POST",
        headers: authHeaders(admin),
      })
      expect(del.status).toBe(204)
      // Recreating with the same humId must fail with 409 because the deleted doc still occupies the id.
      const dup = await app.request(url("/research/new"), {
        method: "POST",
        headers: { ...authHeaders(admin), "Content-Type": "application/json" },
        body: JSON.stringify({ humId }),
      })
      expect(dup.status).toBe(409)
      humId = "" // already deleted; nothing to clean up.
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-RESEARCH-21: PUT /research/{humId}/uids by admin updates the owner list", async ({ admin }) => {
    // IT-RESEARCH-21
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      const target = ["uid-IT-21-A", "uid-IT-21-B"]
      const after = await setOwnerUids(admin, humId, target)
      expect(after.seqNo).toBeGreaterThanOrEqual(created.seqNo)
      // setOwnerUids has already re-GET-and-asserted the uids contain the requested set;
      // re-verify the exact list shape here for the IT contract.
      const app = getApp()
      const get = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      const getJson = (await get.json()) as SingleReadOnlyResponse<{ uids?: string[] }>
      expect(getJson.data.uids).toEqual(target)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-RESEARCH-24: POST /research/{humId}/dataset/new by owner returns 201 with default Dataset shape", async ({ admin, nonAdmin }) => {
    // IT-RESEARCH-24
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const ds = await createDatasetForResearch(nonAdmin, humId)
      expect(ds.datasetId).toMatch(new RegExp(`^DRAFT-${humId}-`))
      // releaseDate defaults to today's ISO 8601 date string.
      const today = new Date().toISOString().split("T")[0]
      expect(ds.releaseDate).toBe(today)
      expect(ds.criteria).toBe("Controlled-access (Type I)")
      expect(ds.experiments).toEqual([])
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-RESEARCH-25: POST /research/{humId}/dataset/new on published parent is refused", async ({ admin, nonAdmin }) => {
    // IT-RESEARCH-25
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      await submitForReview(nonAdmin, humId)
      await approveResearch(admin, humId)
      // Parent is now published, so dataset/new must be refused (409 Conflict,
      // requireDraftStatus middleware in routes/research/index.ts).
      const app = getApp()
      const res = await app.request(url(`/research/${humId}/dataset/new`), {
        method: "POST",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: "{}",
      })
      expect(res.status).toBe(409)
      const json = (await res.json()) as { title?: string; detail?: string }
      expect(json.detail ?? "").toMatch(/expected 'draft'/)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-RESEARCH-T1: generateNextHumId is robust against malformed humId seeds", async () => {
    // The Painless aggregation in generateNextHumId calls
    // `Integer.parseInt(doc['humId'].value.substring(3))`. Without a `humId`
    // regex filter on the search query, a seed with a non-conforming `humId`
    // (empty, missing the `hum` prefix, etc.) would crash the shard with a
    // NumberFormatException. The IT seeds three deliberately malformed docs
    // and asserts that generateNextHumId still returns a syntactically valid
    // `hum\d{4,}` id, without bubbling a 500 / shard failure.
    const seeds: { id: string; doc: Record<string, unknown> }[] = [
      { id: "__t1_empty__", doc: { humId: "" } },
      { id: "__t1_nonhum__", doc: { humId: "abc1234" } },
      { id: "__t1_prefix_only__", doc: { humId: "hum" } },
    ]
    try {
      for (const s of seeds) {
        await esClient.index({
          index: ES_INDEX.research,
          id: s.id,
          body: s.doc,
          refresh: "wait_for",
        })
      }
      // Should not throw a Painless shard failure even with the malformed seeds present.
      const nextId = await generateNextHumId()
      expect(nextId).toMatch(/^hum\d{4,}$/)
    } finally {
      for (const s of seeds) {
        await esClient.delete({
          index: ES_INDEX.research,
          id: s.id,
          refresh: "wait_for",
        }, { ignore: [404] })
      }
    }
  })

  itWithIsolationIndex("IT-RESEARCH-T5: deleted Research is excluded from public listing", async ({ admin, nonAdmin }) => {
    // A Research that was once published (latestVersion=v1) and then deleted
    // (status="deleted") must disappear from the public listing. This exercises
    // the search post-filter that drops `status === "deleted"` rows.
    //
    // `GET /research?humId=<id>` is used because it is the canonical
    // direct-filter path (`ResearchListingQuerySchema § humId`) and shares the
    // `searchResearches` post-filter with `POST /research/search`. The POST
    // search body (`ResearchSearchBodySchema`) does not currently expose a
    // dedicated `humId` filter, and `query` (full-text) does not match the
    // `humId` keyword field — so we rely on the GET endpoint here.
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      await submitForReview(nonAdmin, humId)
      await approveResearch(admin, humId)
      // Sanity check: the humId is visible to public via the humId-filtered list.
      const app = getApp()
      const beforeDelete = await app.request(url(`/research?humId=${humId}&limit=10`))
      expect(beforeDelete.status).toBe(200)
      const beforeJson = (await beforeDelete.json()) as SearchResponse<{ humId: string }>
      expect(beforeJson.data.find(d => d.humId === humId)).toBeDefined()

      const del = await app.request(url(`/research/${humId}/delete`), {
        method: "POST",
        headers: authHeaders(admin),
      })
      expect(del.status).toBe(204)

      // After delete, the humId-filtered list must return 0 hits. This is the
      // canonical invariant — the same `searchResearches` post-filter that
      // drops `status === "deleted"` also backs `POST /research/search`.
      const filtered = await app.request(url(`/research?humId=${humId}&limit=10`))
      expect(filtered.status).toBe(200)
      const filteredJson = (await filtered.json()) as SearchResponse<{ humId: string }>
      expect(filteredJson.data.length).toBe(0)

      humId = "" // already deleted; suppress cleanup.
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-RESEARCH-27: POST /research/new with empty body applies all spec defaults", async ({ admin }) => {
    // IT-RESEARCH-27
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      const app = getApp()
      const get = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      expect(get.status).toBe(200)
      const json = (await get.json()) as SingleReadOnlyResponse<EsResearch & { uids?: string[] }>
      // Defaults per the spec: empty bilingual title, no uids, draft/v1.
      expect(json.data.status).toBe("draft")
      expect(json.data.latestVersion).toBeNull()
      expect(json.data.draftVersion).toBe("v1")
      expect(json.data.uids ?? []).toEqual([])
      const titleAny = json.data.title as Record<string, unknown> | undefined
      expect(titleAny?.ja).toBeNull()
      expect(titleAny?.en).toBeNull()
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })
})
