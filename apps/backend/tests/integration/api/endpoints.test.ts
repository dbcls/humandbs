/**
 * API Integration Tests
 *
 * These tests require real Elasticsearch.
 * Run inside Docker container:
 *   docker compose exec backend bun test tests/integration/api/
 *
 * Or with ES running locally on port 9200:
 *   HUMANDBS_ES_HOST=localhost bun test tests/integration/api/
 */
import { describe, expect, it, beforeAll, afterAll } from "bun:test"

import { esClient } from "@/api/es-client"
import { getTestApp } from "../../unit/api/helpers"

// Check ES connectivity before running tests
let esConnected = false

// URL prefix from environment (matches Docker config)
const URL_PREFIX = process.env.HUMANDBS_BACKEND_URL_PREFIX ?? ""

beforeAll(async () => {
  try {
    const health = await esClient.cluster.health({ timeout: "5s" })
    esConnected = health.status === "green" || health.status === "yellow"
    console.log(`ES connection: ${esConnected ? "OK" : "FAILED"}`)
    console.log(`URL prefix: "${URL_PREFIX}"`)
  } catch (e) {
    console.log("ES connection: FAILED - some tests may fail")
    esConnected = false
  }
})

// Helper to skip test if ES not connected
const itWithEs = (name: string, fn: () => Promise<void>) => {
  it(name, async () => {
    if (!esConnected) {
      console.log(`  Skipping: ${name} (ES not connected)`)
      return
    }
    await fn()
  })
}

// Helper to build URL with prefix
const url = (path: string) => `${URL_PREFIX}${path}`

describe("API Integration Tests", () => {
  // === Stats ===
  describe("GET /stats", () => {
    itWithEs("should return stats with research and dataset counts", async () => {
      const app = getTestApp()
      const res = await app.request(url("/stats"))

      expect(res.status).toBe(200)

      const json = await res.json()

      expect(json).toHaveProperty("research")
      expect(json).toHaveProperty("dataset")
      expect(json).toHaveProperty("facets")

      expect(json.research).toHaveProperty("total")
      expect(typeof json.research.total).toBe("number")

      expect(json.dataset).toHaveProperty("total")
      expect(typeof json.dataset.total).toBe("number")
    })
  })

  // === Facets ===
  describe("GET /facets", () => {
    itWithEs("should return all facet values", async () => {
      const app = getTestApp()
      const res = await app.request(url("/facets"))

      expect(res.status).toBe(200)

      const json = await res.json()
      expect(typeof json).toBe("object")

      const keys = Object.keys(json)
      expect(keys.length).toBeGreaterThan(0)
    })
  })

  describe("GET /facets/{fieldName}", () => {
    itWithEs("should return assayType facet values", async () => {
      const app = getTestApp()
      const res = await app.request(url("/facets/assayType"))

      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toHaveProperty("fieldName", "assayType")
      expect(json).toHaveProperty("values")
      expect(Array.isArray(json.values)).toBe(true)
    })

    itWithEs("should return empty values for unknown field", async () => {
      const app = getTestApp()
      const res = await app.request(url("/facets/unknownField"))

      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toHaveProperty("fieldName", "unknownField")
      expect(json.values).toEqual([])
    })
  })

  // === Research ===
  describe("GET /research", () => {
    itWithEs("should return research list with pagination", async () => {
      const app = getTestApp()
      const res = await app.request(url("/research?page=1&limit=5"))

      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toHaveProperty("data")
      expect(json).toHaveProperty("pagination")
      expect(Array.isArray(json.data)).toBe(true)

      expect(json.pagination).toHaveProperty("page", 1)
      expect(json.pagination).toHaveProperty("limit", 5)
      expect(json.pagination).toHaveProperty("total")
      expect(json.pagination).toHaveProperty("totalPages")
    })

    itWithEs("should reject page=0", async () => {
      const app = getTestApp()
      const res = await app.request(url("/research?page=0"))

      expect(res.status).toBe(400)
    })

    itWithEs("should reject limit=0", async () => {
      const app = getTestApp()
      const res = await app.request(url("/research?limit=0"))

      expect(res.status).toBe(400)
    })

    itWithEs("should reject limit > 100", async () => {
      const app = getTestApp()
      const res = await app.request(url("/research?limit=101"))

      expect(res.status).toBe(400)
    })
  })

  describe("GET /research/{humId}", () => {
    itWithEs("should return 404 for nonexistent humId", async () => {
      const app = getTestApp()
      const res = await app.request(url("/research/nonexistent"))

      expect(res.status).toBe(404)
    })
  })

  // === Dataset ===
  describe("GET /dataset", () => {
    itWithEs("should return dataset list with pagination", async () => {
      const app = getTestApp()
      const res = await app.request(url("/dataset?page=1&limit=5"))

      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toHaveProperty("data")
      expect(json).toHaveProperty("pagination")
      expect(Array.isArray(json.data)).toBe(true)
    })

    itWithEs("should reject invalid pagination", async () => {
      const app = getTestApp()

      let res = await app.request(url("/dataset?page=0"))
      expect(res.status).toBe(400)

      res = await app.request(url("/dataset?limit=0"))
      expect(res.status).toBe(400)
    })
  })

  describe("GET /dataset/{datasetId}", () => {
    itWithEs("should return 404 for nonexistent datasetId", async () => {
      const app = getTestApp()
      const res = await app.request(url("/dataset/nonexistent"))

      expect(res.status).toBe(404)
    })
  })

  // === Search ===
  describe("POST /research/search", () => {
    itWithEs("should search research with pagination", async () => {
      const app = getTestApp()
      const res = await app.request(url("/research/search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: 1, limit: 5, lang: "ja" }),
      })

      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toHaveProperty("data")
      expect(json).toHaveProperty("pagination")
    })

    itWithEs("should search research with facets", async () => {
      const app = getTestApp()
      const res = await app.request(url("/research/search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: 1, limit: 5, lang: "ja", includeFacets: true }),
      })

      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toHaveProperty("facets")
    })
  })

  describe("POST /dataset/search", () => {
    itWithEs("should search datasets with pagination", async () => {
      const app = getTestApp()
      const res = await app.request(url("/dataset/search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: 1, limit: 5, lang: "ja" }),
      })

      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toHaveProperty("data")
      expect(json).toHaveProperty("pagination")
    })

    itWithEs("should search datasets with filters", async () => {
      const app = getTestApp()
      const res = await app.request(url("/dataset/search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: 1,
          limit: 5,
          lang: "ja",
          filters: { assayType: ["WGS", "WES"] },
        }),
      })

      expect(res.status).toBe(200)
    })
  })

  // === Auth Required ===
  describe("Authentication required endpoints", () => {
    itWithEs("POST /research/new should return 401 without auth", async () => {
      const app = getTestApp()
      const res = await app.request(url("/research/new"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(401)
    })

    itWithEs("GET /admin/is-admin should return 401 without auth", async () => {
      const app = getTestApp()
      const res = await app.request(url("/admin/is-admin"))

      expect(res.status).toBe(401)
    })
  })
})
