/**
 * IT-TEMPLATE-*: admin-only template endpoints (`/templates/research/{jdsId}`,
 * `/templates/dataset/{externalId}`).
 *
 * These tests hit live JGA-Shinsei DB (Research template) and live DDBJ Search
 * (Dataset template). Each case probes the staging DB / DDBJ for an existing
 * accession and skips when nothing usable is available — staging is a moving
 * target, so we never hard-code IDs.
 */
import { beforeAll, describe, expect } from "bun:test"

import { fetchDsRaw, listVersions } from "@/api/db-client/jga-shinsei"
import type { SingleReadOnlyResponse } from "@/api/types"

import {
  authHeaders,
  getApp,
  itWithEs,
  itWithJgaAdmin,
  itWithNonAdminToken,
  setupIntegration,
  url,
} from "./setup"

beforeAll(setupIntegration)

interface ResearchTemplate {
  humId?: string
  title?: { ja?: string | null; en?: string | null }
  relatedAccessions: { jgad: string[] }
  warnings: string[]
}

interface DatasetTemplate {
  datasetId?: string
  releaseDate?: string
  criteria: string
  typeOfData: { ja: string | null; en: string | null }
  experiments: {
    header: { ja: { text: string } | null; en: { text: string } | null }
    data: Record<string, unknown>
    searchable: { assayType: string[]; readType: string | null; platforms: unknown[] }
  }[]
  warnings: string[]
}

describe("IT-TEMPLATE-*: template endpoints", () => {
  // === Auth gates ===

  itWithEs("IT-TEMPLATE-01: GET /templates/research/J-DS000001 without auth returns 401", async () => {
    const app = getApp()
    const res = await app.request(url("/templates/research/J-DS000001"))
    expect(res.status).toBe(401)
  })

  itWithEs("IT-TEMPLATE-02: GET /templates/dataset/JGAD000001 without auth returns 401", async () => {
    const app = getApp()
    const res = await app.request(url("/templates/dataset/JGAD000001"))
    expect(res.status).toBe(401)
  })

  itWithNonAdminToken("IT-TEMPLATE-03: GET /templates/research/{jdsId} for non-admin returns 403", async (token) => {
    const app = getApp()
    const res = await app.request(url("/templates/research/J-DS000001"), { headers: authHeaders(token) })
    expect(res.status).toBe(403)
  })

  itWithNonAdminToken("IT-TEMPLATE-04: GET /templates/dataset/{externalId} for non-admin returns 403", async (token) => {
    const app = getApp()
    const res = await app.request(url("/templates/dataset/JGAD000001"), { headers: authHeaders(token) })
    expect(res.status).toBe(403)
  })

  // === Validation ===

  itWithJgaAdmin("IT-TEMPLATE-05: GET /templates/research/{invalid jdsId} returns 400", async (token) => {
    const app = getApp()
    const res = await app.request(url("/templates/research/JDS-001"), { headers: authHeaders(token) })
    expect(res.status).toBe(400)
  })

  itWithJgaAdmin("IT-TEMPLATE-06: GET /templates/dataset/{wrong prefix} returns 400", async (token) => {
    const app = getApp()
    for (const id of ["DRX000001", "JGAS000001", "PRJDB1234", "jgad000001"]) {
      const res = await app.request(url(`/templates/dataset/${id}`), { headers: authHeaders(token) })
      expect(res.status).toBe(400)
    }
  })

  // === Success paths ===

  itWithJgaAdmin("IT-TEMPLATE-07: GET /templates/research/{existing jdsId} returns the draft payload", async (token) => {
    // Probe an existing J-DS via listVersions (returns appl_ids).
    // We then fetchDsRaw to verify the row exists and extract the master-level
    // jds_id (e.g. "J-DS002494") which the /templates/research/ route expects.
    const versions = await listVersions("J-DS", 1, 5)
    let existingJdsId: string | null = null
    for (const applId of versions.applIds) {
      const raws = await fetchDsRaw([applId])
      if (raws.length > 0) {
        existingJdsId = raws[0].jds_id
        break
      }
    }
    if (!existingJdsId) {
      console.log("  SKIP IT-TEMPLATE-07: no usable J-DS rows in staging DB")
      return
    }

    const app = getApp()
    const res = await app.request(url(`/templates/research/${existingJdsId}`), { headers: authHeaders(token) })
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<ResearchTemplate>
    expect(json.data).toBeDefined()
    expect(Array.isArray(json.data.relatedAccessions.jgad)).toBe(true)
    for (const acc of json.data.relatedAccessions.jgad) {
      expect(acc).toMatch(/^JGAD\d+$/)
    }
    expect(json.data.warnings).toEqual([])
  })

  itWithJgaAdmin("IT-TEMPLATE-08: GET /templates/research/{nonexistent jdsId} returns 404", async (token) => {
    const app = getApp()
    const res = await app.request(url("/templates/research/J-DS999999999"), { headers: authHeaders(token) })
    expect(res.status).toBe(404)
  })

  // Dataset template tests use itWithJgaAdmin since the admin token is sufficient
  // here — the JGA DB isn't actually queried for the dataset endpoint, but the
  // helper gives us the admin token without requiring ES isolation.

  itWithJgaAdmin("IT-TEMPLATE-09: GET /templates/dataset/{existing JGAD} returns a Controlled-access draft", async (token) => {
    // JGAD000001 is the canonical "is the JGA-dataset endpoint alive" probe.
    // If DDBJ Search returns null we treat it as a skip rather than a failure.
    const app = getApp()
    const res = await app.request(url("/templates/dataset/JGAD000001"), { headers: authHeaders(token) })
    if (res.status === 404) {
      console.log("  SKIP IT-TEMPLATE-09: JGAD000001 not present in DDBJ Search")
      return
    }
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<DatasetTemplate>
    expect(json.data.criteria).toBe("Controlled-access (Type II)")
    expect(json.data.experiments).toEqual([])
  })

  itWithJgaAdmin("IT-TEMPLATE-10: GET /templates/dataset/{existing DRA} returns an Unrestricted draft with experiments", async (token) => {
    // DRA000001 is the historical anchor for the SRA submission stream.
    const app = getApp()
    const res = await app.request(url("/templates/dataset/DRA000001"), { headers: authHeaders(token) })
    if (res.status === 404) {
      console.log("  SKIP IT-TEMPLATE-10: DRA000001 not present in DDBJ Search")
      return
    }
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<DatasetTemplate>
    expect(json.data.criteria).toBe("Unrestricted-access")
    expect(Array.isArray(json.data.experiments)).toBe(true)
    if (json.data.experiments.length > 0) {
      const first = json.data.experiments[0]
      expect(first.header.en?.text).toMatch(/^DRX\d+$/)
      expect(Array.isArray(first.searchable.platforms)).toBe(true)
    }
  })

  itWithJgaAdmin("IT-TEMPLATE-11: GET /templates/dataset/{nonexistent DRA} returns 404", async (token) => {
    const app = getApp()
    const res = await app.request(url("/templates/dataset/DRA999999999"), { headers: authHeaders(token) })
    expect(res.status).toBe(404)
  })
})
