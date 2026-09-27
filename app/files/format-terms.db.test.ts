import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { eq } from "drizzle-orm"

import { closePools, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { syncFileFormatTerms } from "./format-terms.server"
import { FILE_FORMAT_SET, FILE_FORMATS } from "./formats"

const db = getOwnerDb()

beforeEach(async () => {
  await emptyDatabase(db)
})

afterAll(async () => {
  await closePools()
})

async function terms() {
  return await db
    .select({ id: s.vocabularyTerm.id, code: s.vocabularyTerm.code, labelEn: s.vocabularyTerm.labelEn, labelJa: s.vocabularyTerm.labelJa, position: s.vocabularyTerm.position })
    .from(s.vocabularyTerm)
    .innerJoin(s.vocabularySet, eq(s.vocabularySet.id, s.vocabularyTerm.setId))
    .where(eq(s.vocabularySet.code, FILE_FORMAT_SET.code))
    .orderBy(s.vocabularyTerm.position)
}

describe("syncFileFormatTerms", () => {
  it("leaves a term the list does not have when not asked to remove it, since a key may still point at it", async () => {
    const [set] = await db.insert(s.vocabularySet).values(FILE_FORMAT_SET).returning({ id: s.vocabularySet.id })
    if (set === undefined) throw new Error("expected a set")
    await db.insert(s.vocabularyTerm).values({ setId: set.id, code: "document", labelEn: "DOCUMENT", position: 3 })

    await syncFileFormatTerms(db, { removeUnlisted: false })

    expect((await terms()).map((row) => row.code).sort()).toEqual([...FILE_FORMATS.map((one) => one.code), "document"].sort())
  })

  it("makes the vocabulary and its terms from the list where there are none", async () => {
    await syncFileFormatTerms(db, { removeUnlisted: true })

    expect((await terms()).map(({ code, labelEn, labelJa, position }) => ({ code, labelEn, labelJa, position }))).toEqual(
      FILE_FORMATS.map((one, position) => ({ code: one.code, labelEn: one.label, labelJa: null, position })),
    )
  })

  it("keeps the ID of a term the list still has, so what points at it stays", async () => {
    await syncFileFormatTerms(db, { removeUnlisted: true })
    const before = await terms()

    await syncFileFormatTerms(db, { removeUnlisted: true })

    expect(await terms()).toEqual(before)
  })

  it("corrects a term's label and, when asked to, removes a term the list does not have", async () => {
    const [set] = await db.insert(s.vocabularySet).values({ ...FILE_FORMAT_SET, labelJa: "形式" }).returning({ id: s.vocabularySet.id })
    if (set === undefined) throw new Error("expected a set")
    const [fastq] = await db.insert(s.vocabularyTerm).values([
      { setId: set.id, code: "fastq", labelEn: "Fastq reads", labelJa: "リード", position: 40 },
      { setId: set.id, code: "document", labelEn: "DOCUMENT", position: 3 },
    ]).returning({ id: s.vocabularyTerm.id })

    await syncFileFormatTerms(db, { removeUnlisted: true })

    const after = await terms()
    expect(after.map((row) => row.code)).toEqual(FILE_FORMATS.map((one) => one.code))
    expect(after[0]).toEqual({ id: fastq?.id, code: "fastq", labelEn: "FASTQ", labelJa: null, position: 0 })
    const [kept] = await db.select({ labelJa: s.vocabularySet.labelJa }).from(s.vocabularySet).where(eq(s.vocabularySet.code, FILE_FORMAT_SET.code))
    expect(kept?.labelJa).toBe("形式")
  })
})
