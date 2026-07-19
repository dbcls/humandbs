/**
 * Unit tests for src/api/db-client/jga-shinsei.ts
 *
 * The postgres.js client (`jgaSql`) is replaced with a fake tagged-template
 * function via `mock.module`, so no real DB connection is needed.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

interface SqlCall {
  type: "template" | "identifier"
  /** For "template": joined SQL fragments separated by `?`. For "identifier": the identifier name. */
  text: string
  values: unknown[]
}

const queuedResults: unknown[][] = []
const calls: SqlCall[] = []

const queueRows = (rows: unknown[]) => queuedResults.push(rows)
const reset = () => {
  queuedResults.length = 0
  calls.length = 0
}

const mockSql = (
  stringsOrIdentifier: TemplateStringsArray | string,
  ...values: unknown[]
): unknown => {
  if (typeof stringsOrIdentifier === "string") {
    calls.push({ type: "identifier", text: stringsOrIdentifier, values: [] })
    return { __identifier: stringsOrIdentifier }
  }
  const text = stringsOrIdentifier.join("?")
  calls.push({ type: "template", text, values })
  const rows = queuedResults.shift() ?? []
  return Promise.resolve(rows)
}

void mock.module("@/api/db-client/client", () => ({
  JGA_DB_SCHEMA: "test_schema",
  jgaSql: mockSql,
  closeJgaDb: () => Promise.resolve(),
}))

const {
  listVersions,
  fetchDsRaw,
  fetchDuRaw,
  getDsApplication,
  getDuApplication,
} = await import("@/api/db-client/jga-shinsei")

const findTemplate = (snippet: string): SqlCall | undefined =>
  calls.find((c) => c.type === "template" && c.text.includes(snippet))

beforeEach(reset)

/** Plain values from a template-call's values array (drops sql(identifier) markers). */
const plainValues = (call: SqlCall | undefined): unknown[] =>
  (call?.values ?? []).filter(
    (v) => !(typeof v === "object" && v !== null && "__identifier" in v),
  )

describe("api/db-client/jga-shinsei", () => {
  describe("listVersions", () => {
    it("issues COUNT then SELECT with limit=20 offset=0 for J-DS page 1", async () => {
      queueRows([{ count: 42 }])
      queueRows([{ appl_id: 1 }, { appl_id: 2 }])

      const result = await listVersions("J-DS", 1, 20)

      expect(result.total).toBe(42)
      expect(result.applIds).toEqual([1, 2])

      // J-DS → data_type = 1; queries join nbdc_application with nbdc_application_master
      expect(plainValues(findTemplate("COUNT(*)"))).toEqual([1])
      // SELECT bind: dataType, limit, offset
      expect(plainValues(findTemplate("LIMIT"))).toEqual([1, 20, 0])
    })

    it("computes offset for page=3 limit=10 → 20", async () => {
      queueRows([{ count: 100 }])
      queueRows([])

      await listVersions("J-DS", 3, 10)

      expect(plainValues(findTemplate("LIMIT"))).toEqual([1, 10, 20])
    })

    it("uses dataType=2 for J-DU", async () => {
      queueRows([{ count: 5 }])
      queueRows([])

      await listVersions("J-DU", 1, 10)

      expect(plainValues(findTemplate("COUNT(*)"))).toEqual([2])
    })

    it("returns total=0 when COUNT result is empty", async () => {
      queueRows([])
      queueRows([])

      const result = await listVersions("J-DS", 1, 10)

      expect(result.total).toBe(0)
      expect(result.applIds).toEqual([])
    })
  })

  describe("fetchDsRaw", () => {
    it("returns empty array for empty input without issuing SQL", async () => {
      const result = await fetchDsRaw([])
      expect(result).toEqual([])
      expect(calls.filter((c) => c.type === "template")).toHaveLength(0)
    })

    it("issues a single CTE query parameterised with the id list", async () => {
      const fakeRow = {
        jds_id: "J-DS000001",
        appl_id: 1,
        appl_version: 1,
        application_type: 10,
        jsub_ids: [],
        hum_ids: [],
        jga_ids: [],
        components: [],
        status_history: [],
        submit_date: "2024-01-01",
        create_date: "2024-01-01",
      }
      queueRows([fakeRow])

      const result = await fetchDsRaw([1])

      expect(result).toEqual([fakeRow])
      const templates = calls.filter((c) => c.type === "template")
      expect(templates).toHaveLength(1)
      // applIds is bound as the parameter to the CTE query
      expect(templates[0]?.values).toContainEqual([1])
    })
  })

  describe("fetchDuRaw", () => {
    it("returns empty array for empty input without issuing SQL", async () => {
      const result = await fetchDuRaw([])
      expect(result).toEqual([])
      expect(calls.filter((c) => c.type === "template")).toHaveLength(0)
    })

    it("issues a single CTE query parameterised with the id list", async () => {
      const fakeRow = {
        jdu_id: "J-DU000001",
        appl_id: 1,
        appl_version: 1,
        application_type: 20,
        jgad_ids: [],
        jgas_ids: [],
        hum_ids: [],
        components: [],
        status_history: [],
        submit_date: "2024-01-01",
        create_date: "2024-01-01",
      }
      queueRows([fakeRow])

      const result = await fetchDuRaw([1])

      expect(result).toEqual([fakeRow])
      const templates = calls.filter((c) => c.type === "template")
      expect(templates).toHaveLength(1)
      expect(templates[0]?.values).toContainEqual([1])
    })
  })

  describe("getDsApplication", () => {
    it("throws NotFoundError when resolveApplId finds no row", async () => {
      queueRows([]) // resolveApplId returns empty → NotFoundError
      let caught: unknown
      try {
        await getDsApplication("J-DS999999-001")
      } catch (e) {
        caught = e
      }
      expect((caught as Error | undefined)?.message).toMatch(/Application/)
    })

    it("throws NotFoundError when fetchDsRaw returns empty", async () => {
      queueRows([{ appl_id: 999 }]) // resolveApplId succeeds
      queueRows([]) // fetchDsRaw returns empty
      let caught: unknown
      try {
        await getDsApplication("J-DS999999-001")
      } catch (e) {
        caught = e
      }
      expect((caught as Error | undefined)?.message).toMatch(/DS Application/)
    })
  })

  describe("getDuApplication", () => {
    it("throws NotFoundError when resolveApplId finds no row", async () => {
      queueRows([]) // resolveApplId returns empty → NotFoundError
      let caught: unknown
      try {
        await getDuApplication("J-DU999999-001")
      } catch (e) {
        caught = e
      }
      expect((caught as Error | undefined)?.message).toMatch(/Application/)
    })

    it("throws NotFoundError when fetchDuRaw returns empty", async () => {
      queueRows([{ appl_id: 999 }]) // resolveApplId succeeds
      queueRows([]) // fetchDuRaw returns empty
      let caught: unknown
      try {
        await getDuApplication("J-DU999999-001")
      } catch (e) {
        caught = e
      }
      expect((caught as Error | undefined)?.message).toMatch(/DU Application/)
    })
  })
})
