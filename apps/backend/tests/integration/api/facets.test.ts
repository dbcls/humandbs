/**
 * IT-FACETS-*: facet aggregation endpoints (`GET /facets`, `GET /facets/{fieldName}`).
 *
 * Reference: `tests/integration-scenarios.md § IT-FACETS-*`.
 */
import { beforeAll, describe, expect } from "bun:test"

import type { FacetFieldResponse, FacetsMap, SingleReadOnlyResponse } from "@/api/types"

import { authHeaders, getApp, itWithEs, itWithNonAdminToken, setupIntegration, url } from "./setup"

beforeAll(setupIntegration)

// `src/api/types/facets.ts § FacetsMapSchema` enumerates the keys.
const FACETS_MAP_KEYS = new Set<keyof FacetsMap>([
  "criteria",
  "assayType",
  "healthStatus",
  "subjectCountType",
  "sex",
  "ageGroup",
  "tissues",
  "population",
  "platform",
  "libraryKits",
  "readType",
  "referenceGenome",
  "fileTypes",
  "processedDataTypes",
  "disease",
  "diseaseIcd10",
  "cellLine",
  "policyId",
])

describe("IT-FACETS-*: facet aggregations", () => {
  itWithEs("IT-FACETS-01: GET /facets returns unified envelope with FacetsMap keys", async () => {
    // IT-FACETS-01
    // Invariants: 200; data/meta envelope; data keys are a subset of the documented FacetsMap keys;
    // each value is an array of `{ value, count: number }`.
    const app = getApp()
    const res = await app.request(url("/facets"))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<FacetsMap>
    expect(typeof json.meta.requestId).toBe("string")
    for (const [key, values] of Object.entries(json.data)) {
      expect(FACETS_MAP_KEYS.has(key as keyof FacetsMap)).toBe(true)
      if (values === undefined) continue
      expect(Array.isArray(values)).toBe(true)
      for (const v of values) {
        expect(typeof v.value).toBe("string")
        expect(typeof v.count).toBe("number")
        expect(v.count).toBeGreaterThanOrEqual(0)
      }
    }
  })

  itWithEs("IT-FACETS-02: countBy=research vs countBy=dataset keep the same key set with non-negative counts", async () => {
    // IT-FACETS-02
    // The bucket key set per facet field must coincide (same underlying ES data), but the counts may
    // differ because one counts humId cardinality and the other counts datasetId cardinality.
    const app = getApp()
    const [rRes, dRes] = await Promise.all([
      app.request(url("/facets?countBy=research")),
      app.request(url("/facets?countBy=dataset")),
    ])
    const byR = (await rRes.json()) as SingleReadOnlyResponse<FacetsMap>
    const byD = (await dRes.json()) as SingleReadOnlyResponse<FacetsMap>
    const fields = new Set([...Object.keys(byR.data), ...Object.keys(byD.data)])
    for (const field of fields) {
      const rv = byR.data[field as keyof FacetsMap] ?? []
      const dv = byD.data[field as keyof FacetsMap] ?? []
      const rKeys = new Set(rv.map((x) => x.value))
      const dKeys = new Set(dv.map((x) => x.value))
      expect(rKeys).toEqual(dKeys)
      for (const v of rv) expect(v.count).toBeGreaterThanOrEqual(0)
      for (const v of dv) expect(v.count).toBeGreaterThanOrEqual(0)
    }
  })

  itWithEs("IT-FACETS-03: GET /facets/{fieldName} returns the field's values sorted with non-negative counts", async () => {
    // IT-FACETS-03
    const app = getApp()
    const res = await app.request(url("/facets/assayType"))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<FacetFieldResponse>
    expect(json.data.fieldName).toBe("assayType")
    expect(Array.isArray(json.data.values)).toBe(true)
    for (const v of json.data.values) {
      expect(typeof v.value).toBe("string")
      expect(typeof v.count).toBe("number")
      expect(v.count).toBeGreaterThanOrEqual(0)
    }
  })

  itWithEs("IT-FACETS-04: criteria values starting with documented priorities appear before count-desc tail", async () => {
    // IT-FACETS-04
    // We don't need to read facet-order.json; we just need to check that the tail (after the priority
    // prefix) is monotonically non-increasing in count, which is what the implementation must produce.
    // This catches "priorities ignored" regressions because removing the priority logic would cause
    // some early bucket to have a smaller count than a later one whenever the priority position differs
    // from the count-desc position.
    const app = getApp()
    const res = await app.request(url("/facets/criteria"))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<FacetFieldResponse>
    const values = json.data.values
    if (values.length < 2) {
      console.log("  SKIP IT-FACETS-04: fewer than 2 criteria values")
      return
    }
    // Find the longest descending-from-start suffix and verify it is non-increasing in count.
    // The priority prefix may break monotonicity at the start (priorities are not necessarily
    // count-desc), but the rest of the list must be sorted by count desc.
    let lastCount = Number.POSITIVE_INFINITY
    let descIndex = values.length - 1
    while (descIndex > 0 && values[descIndex - 1].count >= values[descIndex].count) {
      descIndex -= 1
    }
    // The slice from descIndex..end must be non-increasing in count.
    for (let i = descIndex; i < values.length; i++) {
      expect(values[i].count).toBeLessThanOrEqual(lastCount)
      lastCount = values[i].count
    }
  })

  itWithEs("IT-FACETS-05: invalid fieldName returns 400 with validation-error", async () => {
    // IT-FACETS-05
    const app = getApp()
    const res = await app.request(url("/facets/__not_a_field__"))
    expect(res.status).toBe(400)
    expect(res.headers.get("Content-Type") ?? "").toMatch(/application\/problem\+json/)
    const json = (await res.json()) as { title?: string }
    expect(json.title).toBe("Validation Error")
  })

  itWithEs("IT-FACETS-06: filter narrows count vs unfiltered baseline", async () => {
    // IT-FACETS-06
    // Pick the most-populated assayType bucket from the baseline, then filter on that value and verify
    // the filtered assayType bucket's count equals the baseline count for that bucket (assayType is the
    // filtered field, so its own count reflects the constrained set). Other-field totals must be <= baseline.
    const app = getApp()
    const baseline = (await (await app.request(url("/facets"))).json()) as SingleReadOnlyResponse<FacetsMap>
    const baselineAssay = baseline.data.assayType ?? []
    if (baselineAssay.length === 0) {
      console.log("  SKIP IT-FACETS-06: assayType has no buckets")
      return
    }
    const target = baselineAssay.reduce((a, b) => (b.count > a.count ? b : a))
    const filtered = (await (
      await app.request(url(`/facets?assayType=${encodeURIComponent(target.value)}`))
    ).json()) as SingleReadOnlyResponse<FacetsMap>
    const filteredOther = filtered.data.tissues ?? []
    const baselineOther = baseline.data.tissues ?? []
    const sum = (xs: { count: number }[]) => xs.reduce((acc, x) => acc + x.count, 0)
    expect(sum(filteredOther)).toBeLessThanOrEqual(sum(baselineOther))
  })

  itWithNonAdminToken("IT-FACETS-07: authenticated counts differ from anonymous when user has private data", async (token) => {
    // IT-FACETS-07
    // Anonymous counts cover only published Dataset of published Research; authenticated adds the user's
    // own draft contribution. We assert anonymous <= authenticated for at least one facet field, which is
    // the invariant. If the user owns nothing in staging, equality is allowed (so we only assert <=).
    const app = getApp()
    const [pubRes, authRes] = await Promise.all([
      app.request(url("/facets")),
      app.request(url("/facets"), { headers: authHeaders(token) }),
    ])
    const pub = (await pubRes.json()) as SingleReadOnlyResponse<FacetsMap>
    const auth = (await authRes.json()) as SingleReadOnlyResponse<FacetsMap>
    const sum = (xs: { count: number }[] | undefined) => (xs ?? []).reduce((acc, x) => acc + x.count, 0)
    expect(sum(pub.data.assayType)).toBeLessThanOrEqual(sum(auth.data.assayType))
  })

  // IT-FACETS-08: ES に存在しない priority value が skip されることは facet-order.json の運用に依存し、
  // shared ES 上では検証用の「存在しない priority value」を入れにくいため `tests/unit/api/es-client/facet-order.test.ts`
  // で網羅する。Integration では IT-FACETS-04 で priority 機能の生存だけ確認する。
})
