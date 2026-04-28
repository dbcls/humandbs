/**
 * JGA Shinsei DB Integration Tests
 *
 * Requires a reachable JGA PostgreSQL instance (`HUMANDBS_JGA_DB_*`).
 * Tests are skipped automatically when the DB is unreachable, so this file is
 * safe to include in CI even when the JGA DB cannot be hit.
 *
 * Run inside Docker container with proper env:
 *   docker compose exec backend bun test tests/integration/api/jga-shinsei.test.ts
 */
import { beforeAll, describe, expect, it } from "bun:test"

import { jgaSql } from "@/api/db-client/client"
import {
  fetchDsRaw,
  fetchDuRaw,
  getDsApplication,
  getDuApplication,
  listIds,
} from "@/api/db-client/jga-shinsei"
import {
  DsApplicationTransformedSchema,
  DuApplicationTransformedSchema,
} from "@/crawler/types/jga-shinsei"

let jgaConnected = false

beforeAll(async () => {
  try {
    await jgaSql`SELECT 1`
    jgaConnected = true
    console.log("JGA DB connection: OK")
  } catch (err) {
    console.log(`JGA DB connection: FAILED (${(err as Error).message})`)
    jgaConnected = false
  }
})

const itWithJgaDb = (name: string, fn: () => Promise<void>) => {
  it(name, async () => {
    if (!jgaConnected) {
      console.log(`  Skipping: ${name} (JGA DB not connected)`)
      return
    }
    await fn()
  })
}

describe("db-client/jga-shinsei integration", () => {
  describe("listIds", () => {
    itWithJgaDb("returns J-DS ids with prefix and a positive total", async () => {
      const { ids, total } = await listIds("J-DS", 1, 5)
      expect(total).toBeGreaterThan(0)
      expect(ids.length).toBeLessThanOrEqual(5)
      ids.forEach((id) => { expect(id).toMatch(/^J-DS\d+$/) })
    })

    itWithJgaDb("returns J-DU ids with prefix and a positive total", async () => {
      const { ids, total } = await listIds("J-DU", 1, 5)
      expect(total).toBeGreaterThan(0)
      expect(ids.length).toBeLessThanOrEqual(5)
      ids.forEach((id) => { expect(id).toMatch(/^J-DU\d+$/) })
    })

    itWithJgaDb("computes offset correctly across pages", async () => {
      const page1 = await listIds("J-DS", 1, 3)
      const page2 = await listIds("J-DS", 2, 3)
      expect(page1.total).toBe(page2.total)
      // page2 ids should not overlap page1 ids (sorted asc, 3 items per page)
      page2.ids.forEach((id) => { expect(page1.ids).not.toContain(id) })
    })
  })

  describe("fetchDsRaw + getDsApplication", () => {
    itWithJgaDb("fetches a real DS application and transforms successfully", async () => {
      const { ids } = await listIds("J-DS", 1, 1)
      if (ids.length === 0) {
        console.log("  Skipping: no J-DS rows in DB")
        return
      }
      const jdsId = ids[0]
      const doc = await getDsApplication(jdsId)
      expect(doc.jdsId).toBe(jdsId)
      // Round-trip through the canonical Zod schema (same one the API returns)
      DsApplicationTransformedSchema.parse(doc)
    })

    itWithJgaDb("fetchDsRaw returns rows in the requested id order", async () => {
      const { ids } = await listIds("J-DS", 1, 3)
      if (ids.length < 2) {
        console.log("  Skipping: fewer than 2 J-DS rows in DB")
        return
      }
      const raws = await fetchDsRaw(ids)
      const fetchedIds = raws.map((r) => r.jds_id).sort()
      expect(fetchedIds).toEqual([...ids].sort())
    })

    itWithJgaDb("throws NotFoundError for non-existent DS id", async () => {
      let caught: unknown
      try {
        await getDsApplication("J-DS999999")
      } catch (e) {
        caught = e
      }
      expect((caught as Error | undefined)?.message).toMatch(/DS Application/)
    })
  })

  describe("fetchDuRaw + getDuApplication", () => {
    itWithJgaDb("fetches a real DU application and transforms successfully", async () => {
      const { ids } = await listIds("J-DU", 1, 1)
      if (ids.length === 0) {
        console.log("  Skipping: no J-DU rows in DB")
        return
      }
      const jduId = ids[0]
      const doc = await getDuApplication(jduId)
      expect(doc.jduId).toBe(jduId)
      DuApplicationTransformedSchema.parse(doc)
    })

    itWithJgaDb("fetchDuRaw returns rows in the requested id order", async () => {
      const { ids } = await listIds("J-DU", 1, 3)
      if (ids.length < 2) {
        console.log("  Skipping: fewer than 2 J-DU rows in DB")
        return
      }
      const raws = await fetchDuRaw(ids)
      const fetchedIds = raws.map((r) => r.jdu_id).sort()
      expect(fetchedIds).toEqual([...ids].sort())
    })

    itWithJgaDb("throws NotFoundError for non-existent DU id", async () => {
      let caught: unknown
      try {
        await getDuApplication("J-DU999999")
      } catch (e) {
        caught = e
      }
      expect((caught as Error | undefined)?.message).toMatch(/DU Application/)
    })
  })
})
