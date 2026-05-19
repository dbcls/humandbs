/**
 * IT-VERSION-*: Research/Dataset version endpoints.
 *
 * Reference: `tests/integration-scenarios.md § IT-VERSION-*`.
 *
 * Mutating scenarios (IT-VERSION-06, 07 success, 09, 10, 11, 12, 13, 14) require
 * the isolation ES index and admin/owner tokens. They are stubbed with skip notes.
 *
 * Multi-version Research is required for IT-VERSION-02 / 05 to assert the public
 * range restriction. We probe one from the live index via `setup.ts`; absence is
 * treated as a skip.
 */
import { beforeAll, describe, expect } from "bun:test"

import type { SearchResponse, SingleReadOnlyResponse } from "@/api/types"

import {
  approveResearch,
  createDatasetForResearch,
  createDraftResearch,
  createNewVersion,
  getResearchSeqNo,
  purgeResearch,
  setOwnerUids,
  submitForReview,
} from "./mutating-helpers"
import {
  authHeaders,
  decodeJwtSub,
  getApp,
  getFixtures,
  itWithEs,
  itWithIsolationIndex,
  itWithNonAdminToken,
  setupIntegration,
  url,
} from "./setup"

beforeAll(setupIntegration)

interface ResearchSummary {
  humId: string
  versionIds?: string[]
  latestVersion?: string | null
  draftVersion?: string | null
}

interface VersionListItem {
  version: string
  versionReleaseDate?: string
}

const parseNum = (v: string): number => Number(v.replace(/^v/, ""))

describe("IT-VERSION-*: Research/Dataset version endpoints", () => {
  itWithEs("IT-VERSION-01: GET /research/{humId}/versions returns a non-decreasing version array", async () => {
    // IT-VERSION-01
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-VERSION-01: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}/versions`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<VersionListItem[]>
    expect(Array.isArray(json.data)).toBe(true)
    expect(json.data.length).toBeGreaterThanOrEqual(1)
    for (let i = 1; i < json.data.length; i++) {
      expect(parseNum(json.data[i - 1].version)).toBeLessThanOrEqual(parseNum(json.data[i].version))
    }
  })

  itWithEs("IT-VERSION-03: GET /research/{humId}/versions/{version} returns the requested version", async () => {
    // IT-VERSION-03
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-VERSION-03: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const versions = list.data[0].latestVersion
    if (!versions) {
      console.log("  SKIP IT-VERSION-03: no latestVersion on representative Research")
      return
    }
    const res = await app.request(url(`/research/${humId}/versions/${versions}`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<VersionListItem>
    expect(json.data.version).toBe(versions)
    // singleReadOnlyResponse must not expose _seq_no / _primary_term on the version sub-resource.
    const meta = json.meta as Record<string, unknown>
    expect(meta._seq_no).toBeUndefined()
    expect(meta._primary_term).toBeUndefined()
  })

  itWithEs("IT-VERSION-04: GET /research/{humId}/versions/v999 returns 404", async () => {
    // IT-VERSION-04
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-VERSION-04: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}/versions/v999`))
    expect(res.status).toBe(404)
  })

  itWithEs("IT-VERSION-05: public is restricted to latestVersion for direct ?version=v<beyond>", async () => {
    // IT-VERSION-05
    const fx = getFixtures()
    if (!fx.multiVersionHumId) {
      console.log("  SKIP IT-VERSION-05: no multi-version Research probed")
      return
    }
    const app = getApp()
    // Determine latestVersion: read the public detail to get the resolved version.
    const detail = (await (
      await app.request(url(`/research/${fx.multiVersionHumId}`))
    ).json()) as SingleReadOnlyResponse<{ latestVersion?: string | null }>
    const latest = detail.data.latestVersion
    if (!latest) {
      console.log("  SKIP IT-VERSION-05: probed Research has no latestVersion (unexpected)")
      return
    }
    const beyond = `v${parseNum(latest) + 1}`
    const res = await app.request(url(`/research/${fx.multiVersionHumId}/versions/${beyond}`))
    expect(res.status).toBe(404)
  })

  itWithNonAdminToken("IT-VERSION-08: POST /research/{humId}/versions/new by non-owner returns 403", async (token) => {
    // IT-VERSION-08
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-VERSION-08: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}/versions/new`), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(403)
  })

  itWithIsolationIndex("IT-VERSION-02: public sees only versions up to latestVersion; owner/admin see the draft too", async ({ admin, nonAdmin }) => {
    // IT-VERSION-02
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      await submitForReview(nonAdmin, humId)
      await approveResearch(admin, humId) // v1 published
      await createNewVersion(nonAdmin, humId) // v2 draft
      const app = getApp()
      const pub = await app.request(url(`/research/${humId}/versions`))
      expect(pub.status).toBe(200)
      const pubJson = (await pub.json()) as SearchResponse<VersionListItem>
      const pubVersions = pubJson.data.map((v) => v.version)
      expect(pubVersions).toContain("v1")
      expect(pubVersions).not.toContain("v2")
      const adminGet = await app.request(url(`/research/${humId}/versions`), { headers: authHeaders(admin) })
      const adminJson = (await adminGet.json()) as SearchResponse<VersionListItem>
      const adminVersions = adminJson.data.map((v) => v.version)
      expect(adminVersions).toContain("v1")
      expect(adminVersions).toContain("v2")
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-VERSION-06: owner POST /research/{humId}/versions/new on published creates a draft v2", async ({ admin, nonAdmin }) => {
    // IT-VERSION-06
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      await submitForReview(nonAdmin, humId)
      await approveResearch(admin, humId)
      const newVersion = await createNewVersion(nonAdmin, humId)
      expect(newVersion.draftVersion).toBe("v2")
      const app = getApp()
      const detail = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      const detailJson = (await detail.json()) as SingleReadOnlyResponse<{
        latestVersion?: string | null
        draftVersion?: string | null
        status?: string
      }>
      expect(detailJson.data.latestVersion).toBe("v1")
      expect(detailJson.data.draftVersion).toBe("v2")
      expect(detailJson.data.status).toBe("draft")
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-VERSION-07: POST /research/{humId}/versions/new on non-published is refused with 409", async ({ admin, nonAdmin }) => {
    // IT-VERSION-07
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const app = getApp()
      // draft → 409
      const draft = await app.request(url(`/research/${humId}/versions/new`), {
        method: "POST",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: "{}",
      })
      expect(draft.status).toBe(409)
      const draftJson = (await draft.json()) as { detail?: string }
      expect(draftJson.detail ?? "").toMatch(/published/i)
      // review → 409
      await submitForReview(nonAdmin, humId)
      const review = await app.request(url(`/research/${humId}/versions/new`), {
        method: "POST",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: "{}",
      })
      expect(review.status).toBe(409)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-VERSION-09: first PUT under a new draft cycle bumps Dataset version v1 → v2", async ({ admin, nonAdmin }) => {
    // IT-VERSION-09
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const ds = await createDatasetForResearch(nonAdmin, humId)
      await submitForReview(nonAdmin, humId)
      await approveResearch(admin, humId)
      await createNewVersion(nonAdmin, humId)
      const app = getApp()
      const dsCurrent = await app.request(url(`/dataset/${ds.datasetId}`), { headers: authHeaders(admin) })
      const dsCurrentJson = (await dsCurrent.json()) as SingleReadOnlyResponse<{ releaseDate?: string; criteria?: string; version?: string }> & {
        meta: { _seq_no?: number; _primary_term?: number }
      }
      // GET returns the previously pinned version (v1) before the bump.
      expect(dsCurrentJson.data.version).toBe("v1")
      const put = await app.request(url(`/dataset/${ds.datasetId}/update`), {
        method: "PUT",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: JSON.stringify({
          humId,
          humVersionId: `${humId}-v1`,
          releaseDate: dsCurrentJson.data.releaseDate ?? new Date().toISOString().split("T")[0],
          criteria: dsCurrentJson.data.criteria ?? "Controlled-access (Type I)",
          typeOfData: { ja: null, en: null },
          experiments: [],
          _seq_no: dsCurrentJson.meta._seq_no ?? 0,
          _primary_term: dsCurrentJson.meta._primary_term ?? 1,
        }),
      })
      expect(put.status).toBe(200)
      const latest = await app.request(url(`/dataset/${ds.datasetId}`), { headers: authHeaders(admin) })
      const latestJson = (await latest.json()) as SingleReadOnlyResponse<{ version?: string; humVersionId?: string }>
      expect(latestJson.data.version).toBe("v2")
      expect(latestJson.data.humVersionId).toBe(`${humId}-v2`)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-VERSION-10: second PUT in the same draft cycle stays on the bumped Dataset version", async ({ admin, nonAdmin }) => {
    // IT-VERSION-10
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const ds = await createDatasetForResearch(nonAdmin, humId)
      await submitForReview(nonAdmin, humId)
      await approveResearch(admin, humId)
      await createNewVersion(nonAdmin, humId)
      const app = getApp()
      const doPut = async (): Promise<Response> => {
        const cur = await app.request(url(`/dataset/${ds.datasetId}`), { headers: authHeaders(admin) })
        const curJson = (await cur.json()) as SingleReadOnlyResponse<{ releaseDate?: string; criteria?: string }> & {
          meta: { _seq_no?: number; _primary_term?: number }
        }
        return app.request(url(`/dataset/${ds.datasetId}/update`), {
          method: "PUT",
          headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
          body: JSON.stringify({
            humId,
            humVersionId: `${humId}-v1`,
            releaseDate: curJson.data.releaseDate ?? new Date().toISOString().split("T")[0],
            criteria: curJson.data.criteria ?? "Controlled-access (Type I)",
            typeOfData: { ja: null, en: null },
            experiments: [],
            _seq_no: curJson.meta._seq_no ?? 0,
            _primary_term: curJson.meta._primary_term ?? 1,
          }),
        })
      }
      // First PUT performs the v1 → v2 bump.
      const first = await doPut()
      expect(first.status).toBe(200)
      const afterFirst = await app.request(url(`/dataset/${ds.datasetId}`), { headers: authHeaders(admin) })
      const afterFirstJson = (await afterFirst.json()) as SingleReadOnlyResponse<{ version?: string }>
      expect(afterFirstJson.data.version).toBe("v2")
      // Second PUT in the same draft cycle: in-place overwrite on v2 (no further bump).
      const second = await doPut()
      expect(second.status).toBe(200)
      const latest = await app.request(url(`/dataset/${ds.datasetId}`), { headers: authHeaders(admin) })
      const latestJson = (await latest.json()) as SingleReadOnlyResponse<{ version?: string }>
      expect(latestJson.data.version).toBe("v2")
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-VERSION-11: new Dataset on a draft Research appears in the parent dataset list", async ({ admin, nonAdmin }) => {
    // IT-VERSION-11
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const ds = await createDatasetForResearch(nonAdmin, humId)
      const app = getApp()
      const listed = await app.request(url(`/research/${humId}/dataset`), { headers: authHeaders(admin) })
      const listedJson = (await listed.json()) as SearchResponse<{ datasetId: string }>
      const ids = listedJson.data.map((d) => d.datasetId)
      expect(ids).toContain(ds.datasetId)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-VERSION-12: approve pins the dataset version into the historical Research version", async ({ admin, nonAdmin }) => {
    // IT-VERSION-12
    // create → set uids → create dataset (D1 v1) → submit → approve (publish v1) →
    //   new draft v2 → PUT D1 (v2 bump) → submit → approve (publish v2) →
    // GET /research/{humId}/versions/v1 → datasets[].version === "v1" pinned.
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const ds = await createDatasetForResearch(nonAdmin, humId)
      await submitForReview(nonAdmin, humId)
      await approveResearch(admin, humId)
      await createNewVersion(nonAdmin, humId)
      const app = getApp()
      // Bump dataset to v2 under the draft research.
      const cur = await app.request(url(`/dataset/${ds.datasetId}`), { headers: authHeaders(admin) })
      const curJson = (await cur.json()) as SingleReadOnlyResponse<{ releaseDate?: string; criteria?: string }> & {
        meta: { _seq_no?: number; _primary_term?: number }
      }
      const put = await app.request(url(`/dataset/${ds.datasetId}/update`), {
        method: "PUT",
        headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
        body: JSON.stringify({
          humId,
          humVersionId: `${humId}-v2`,
          releaseDate: curJson.data.releaseDate ?? new Date().toISOString().split("T")[0],
          criteria: curJson.data.criteria ?? "Controlled-access (Type I)",
          typeOfData: { ja: null, en: null },
          experiments: [],
          _seq_no: curJson.meta._seq_no ?? 0,
          _primary_term: curJson.meta._primary_term ?? 1,
        }),
      })
      expect(put.status).toBe(200)
      await submitForReview(nonAdmin, humId)
      await approveResearch(admin, humId)
      // Now both v1 and v2 are published; v1's dataset reference must still pin v1.
      const v1 = await app.request(url(`/research/${humId}/versions/v1`))
      expect(v1.status).toBe(200)
      const v1Json = (await v1.json()) as SingleReadOnlyResponse<{
        datasets?: { datasetId: string; version: string }[]
      }>
      const pinned = (v1Json.data.datasets ?? []).find((d) => d.datasetId === ds.datasetId)
      expect(pinned?.version).toBe("v1")
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-VERSION-13: consecutive publish cycles produce v1, v2, v3 strictly increasing", async ({ admin, nonAdmin }) => {
    // IT-VERSION-13
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const app = getApp()
      const readLatest = async (): Promise<string | null> => {
        const res = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
        const json = (await res.json()) as SingleReadOnlyResponse<{ latestVersion?: string | null }>
        return json.data.latestVersion ?? null
      }
      const publishedVersions: string[] = []
      // Cycle 1: submit+approve (publishes draftVersion v1)
      await submitForReview(nonAdmin, humId)
      await approveResearch(admin, humId)
      publishedVersions.push((await readLatest()) ?? "")
      // Cycle 2 & 3: new draft → submit → approve
      for (let cycle = 0; cycle < 2; cycle++) {
        await createNewVersion(nonAdmin, humId)
        await submitForReview(nonAdmin, humId)
        await approveResearch(admin, humId)
        publishedVersions.push((await readLatest()) ?? "")
      }
      expect(publishedVersions).toEqual(["v1", "v2", "v3"])
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-VERSION-14: concurrent POST /versions/new → exactly one wins, the other 409", async ({ admin, nonAdmin }) => {
    // IT-VERSION-14
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      await submitForReview(nonAdmin, humId)
      await approveResearch(admin, humId)
      // confirm published before the race so the second 409 is not from state-guard but from the lock.
      const probe = await getResearchSeqNo(admin, humId)
      expect(probe.seqNo).toBeGreaterThanOrEqual(0)
      const app = getApp()
      const [a, b] = await Promise.all([
        app.request(url(`/research/${humId}/versions/new`), {
          method: "POST",
          headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
          body: "{}",
        }),
        app.request(url(`/research/${humId}/versions/new`), {
          method: "POST",
          headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
          body: "{}",
        }),
      ])
      const statuses = [a.status, b.status].sort()
      expect(statuses).toEqual([201, 409])
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })
})
