/**
 * IT-STATS-*: `/stats` aggregation endpoint (`src/api/routes/stats.ts`).
 *
 * Reference: `tests/integration-scenarios.md § IT-STATS-*`.
 *
 * IT-STATS-03 (published=0 indexes) and IT-STATS-05 (ES unreachable → 500) require
 * special ES states and are not exercised here; their notes are in
 * `tests/integration-scenarios.md`.
 */
import { beforeAll, describe, expect } from "bun:test"

import type { SingleReadOnlyResponse, StatsResponse } from "@/api/types"

import { getApp, itWithEs, setupIntegration, url } from "./setup"

beforeAll(setupIntegration)

// `tests/integration-scenarios.md § IT-STATS-04` enumerates the documented facet keys.
// The set is the SSOT for what `extractStatsFacets` may produce.
const DOCUMENTED_FACETS = new Set([
  "criteria",
  "assayType",
  "tissues",
  "population",
  "platform",
  "fileTypes",
  "healthStatus",
  "subjectCountType",
  "isTumor",
  "cellLine",
  "sex",
  "ageGroup",
  "libraryKits",
  "readType",
  "referenceGenome",
  "processedDataTypes",
  "hasPhenotypeData",
  "disease",
  "diseaseIcd10",
  "policyId",
])

describe("IT-STATS-*: stats endpoint", () => {
  itWithEs("IT-STATS-01: returns unified envelope with non-negative totals (no auth)", async () => {
    // IT-STATS-01
    // Invariants: 200; data/meta envelope; totals are numbers >= 0; facets is an object; reachable anonymously.
    const app = getApp()
    const res = await app.request(url("/stats"))
    expect(res.status).toBe(200)

    const json = (await res.json()) as SingleReadOnlyResponse<StatsResponse>
    expect(typeof json.meta.requestId).toBe("string")
    expect(typeof json.meta.timestamp).toBe("string")

    expect(typeof json.data.research.total).toBe("number")
    expect(json.data.research.total).toBeGreaterThanOrEqual(0)
    expect(typeof json.data.dataset.total).toBe("number")
    expect(json.data.dataset.total).toBeGreaterThanOrEqual(0)
    expect(typeof json.data.facets).toBe("object")
    expect(json.data.facets).not.toBeNull()
  })

  itWithEs("IT-STATS-02: facet bucket counts respect research/dataset totals and platform key uses '||' separator", async () => {
    // IT-STATS-02
    // Invariants: per-bucket `research` / `dataset` are non-negative integers; both <= corresponding totals;
    // platform bucket keys are formatted as `"<vendor>||<model>"`.
    const app = getApp()
    const res = await app.request(url("/stats"))
    const json = (await res.json()) as SingleReadOnlyResponse<StatsResponse>
    const totalResearch = json.data.research.total
    const totalDataset = json.data.dataset.total

    for (const [facetName, buckets] of Object.entries(json.data.facets)) {
      for (const [bucketKey, counts] of Object.entries(buckets)) {
        expect(typeof counts.research).toBe("number")
        expect(typeof counts.dataset).toBe("number")
        expect(counts.research).toBeGreaterThanOrEqual(0)
        expect(counts.dataset).toBeGreaterThanOrEqual(0)
        expect(counts.research).toBeLessThanOrEqual(totalResearch)
        expect(counts.dataset).toBeLessThanOrEqual(totalDataset)
        if (facetName === "platform") {
          expect(bucketKey).toContain("||")
        }
      }
    }
  })

  itWithEs("IT-STATS-04: facet keys are a subset of the documented 18 facets and exclude total_* aliases", async () => {
    // IT-STATS-04
    const app = getApp()
    const res = await app.request(url("/stats"))
    const json = (await res.json()) as SingleReadOnlyResponse<StatsResponse>
    const keys = Object.keys(json.data.facets)
    for (const k of keys) {
      expect(DOCUMENTED_FACETS.has(k)).toBe(true)
    }
    expect(keys).not.toContain("total_research")
    expect(keys).not.toContain("total_dataset")
  })
})
