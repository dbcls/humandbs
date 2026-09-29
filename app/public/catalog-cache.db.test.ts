import { eq, sql } from "drizzle-orm"
import fc from "fast-check"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { CATALOG_CHANNEL, publicCatalog } from "./catalog-cache.server"
import { loadCatalog } from "./queries.server"

/**
 * These run against the test database, so they need `docker compose up`.
 */
const db = getDb()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await emptyDatabase(getOwnerDb())
  await closePools()
})

function only<T>(rows: T[]): T {
  const [row] = rows
  if (row === undefined || rows.length !== 1) throw new Error(`expected one row, got ${rows.length}`)
  return row
}

async function seed(): Promise<{ termId: string, keyId: string, documentId: string }> {
  const { id: documentId } = only(await db.insert(s.document).values({ slug: "policy" }).returning({ id: s.document.id }))
  const { id: setId } = only(await db.insert(s.vocabularySet)
    .values({ code: "policies", labelJa: "ポリシー", labelEn: "Policies" })
    .returning({ id: s.vocabularySet.id }))
  const { id: termId } = only(await db.insert(s.vocabularyTerm)
    .values({ setId, code: "nbdc-policy", labelEn: "NBDC policy", documentId })
    .returning({ id: s.vocabularyTerm.id }))
  const { id: keyId } = only(await db.insert(s.contentKey)
    .values({ code: "policies", scope: "dataset", valueType: "vocabulary", labelJa: "ポリシー", labelEn: "Policies", vocabularySetId: setId })
    .returning({ id: s.contentKey.id }))
  return { termId, keyId, documentId }
}

describe("the catalog the public side reads", () => {
  it("is the catalog as read from the tables, and the same one while nothing changes", async () => {
    const { termId } = await seed()
    const kept = await publicCatalog(db)
    expect(kept.termById.get(termId)?.documentSlug).toBe("policy")
    expect(kept).toEqual(await loadCatalog(db))
    expect(await publicCatalog(db)).toBe(kept)
  })

  it("has every change to a term, a key or a document a term links to that committed before it was read", async () => {
    const { termId, keyId, documentId } = await seed()
    const before = await publicCatalog(db)

    await db.update(s.vocabularyTerm).set({ labelEn: "NBDC data sharing policy" }).where(eq(s.vocabularyTerm.id, termId))
    const afterTerm = await publicCatalog(db)
    expect(afterTerm).not.toBe(before)
    expect(afterTerm.termById.get(termId)?.labelEn).toBe("NBDC data sharing policy")

    await db.update(s.contentKey).set({ labelEn: "Use policies" }).where(eq(s.contentKey.id, keyId))
    expect((await publicCatalog(db)).keyById.get(keyId)?.labelEn).toBe("Use policies")

    await db.update(s.document).set({ slug: "data-sharing-policy" }).where(eq(s.document.id, documentId))
    expect((await publicCatalog(db)).termById.get(termId)?.documentSlug).toBe("data-sharing-policy")
  })

  it("has the last of any run of labels, each read right after its commit", async () => {
    const { termId } = await seed()
    await fc.assert(fc.asyncProperty(
      fc.array(fc.string({ minLength: 1, maxLength: 40 }), { minLength: 1, maxLength: 5 }),
      async (labels) => {
        for (const label of labels) {
          await db.update(s.vocabularyTerm).set({ labelEn: label }).where(eq(s.vocabularyTerm.id, termId))
          expect((await publicCatalog(db)).termById.get(termId)?.labelEn).toBe(label)
        }
      },
    ), { numRuns: 25 })
  })

  it("is the same one after a change that is rolled back", async () => {
    const { termId } = await seed()
    const kept = await publicCatalog(db)
    await expect(db.transaction(async (tx) => {
      await tx.update(s.vocabularyTerm).set({ labelEn: "never committed" }).where(eq(s.vocabularyTerm.id, termId))
      throw new Error("roll back")
    })).rejects.toThrow("roll back")
    expect(await publicCatalog(db)).toBe(kept)
  })

  it("is read from the tables once the listening connection is lost, and kept again once it is back", async () => {
    const { termId } = await seed()
    await publicCatalog(db)
    await getOwnerDb().execute(sql`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname = current_database() AND application_name = ${CATALOG_CHANNEL}
    `)
    await getOwnerDb().update(s.vocabularyTerm).set({ labelEn: "changed while nobody listened" }).where(eq(s.vocabularyTerm.id, termId))
    expect((await publicCatalog(db)).termById.get(termId)?.labelEn).toBe("changed while nobody listened")

    const again = await publicCatalog(db)
    expect(await publicCatalog(db)).toBe(again)
  })
})
