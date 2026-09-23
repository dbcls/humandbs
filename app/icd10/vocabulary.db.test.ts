import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { icd10TermIds, icd10VocabularySize, importIcd10Terms } from "./vocabulary.server"

/**
 * Putting the classification in as the disease vocabulary, against the test
 * database. What matters is that an import can be run again without moving
 * anything a value points at, and that the tree the facet counts by is there.
 */
const db = getDb()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

const C34 = { code: "C34", titleEn: "Malignant neoplasm of bronchus and lung", titleJa: "気管支及び肺の悪性新生物" }
const C349 = { code: "C349", titleEn: "Bronchus or lung, unspecified", titleJa: "気管支又は肺，部位不明" }

async function terms() {
  return db.select().from(s.vocabularyTerm)
}

describe("putting the classification in", () => {
  it("makes the vocabulary when the catalog has none, and hangs a four-character code under its root", async () => {
    expect(await importIcd10Terms(db, [C349, C34])).toEqual({ roots: 1, children: 1 })

    const sets = await db.select().from(s.vocabularySet)
    expect(sets.map((set) => [set.code, set.hierarchical])).toEqual([["icd10", true]])
    const held = await terms()
    const root = held.find((one) => one.code === "C34")
    const child = held.find((one) => one.code === "C349")
    expect(root?.parentId).toBeNull()
    expect(child?.parentId).toBe(root?.id)
    expect(child?.labelEn).toBe("Bronchus or lung, unspecified")
    expect(child?.labelJa).toBe("気管支又は肺，部位不明")
  })

  it("uses the vocabulary the catalog seeded rather than making a second one", async () => {
    const [seeded] = await db.insert(s.vocabularySet)
      .values({ code: "icd10", labelJa: "疾患 (ICD-10)", labelEn: "Disease (ICD-10)", hierarchical: true })
      .returning({ id: s.vocabularySet.id })

    await importIcd10Terms(db, [C34])

    const sets = await db.select().from(s.vocabularySet)
    expect(sets.map((set) => [set.id, set.labelEn])).toEqual([[seeded?.id, "Disease (ICD-10)"]])
    expect((await terms()).map((one) => one.setId)).toEqual([seeded?.id])
  })

  it("keeps a term's identity across imports, and takes the titles again", async () => {
    await importIcd10Terms(db, [C34, C349])
    const before = await icd10TermIds(db)

    await importIcd10Terms(db, [{ ...C34, titleEn: "Renamed root" }, { ...C349, titleJa: null }])

    expect(await icd10TermIds(db)).toEqual(before)
    const held = await terms()
    expect(held.find((one) => one.code === "C34")?.labelEn).toBe("Renamed root")
    expect(held.find((one) => one.code === "C349")?.labelJa).toBeNull()
    expect(held.find((one) => one.code === "C349")?.parentId).toBe(before.get("C34"))
  })

  it("names a code held in one language only in both, since English is required", async () => {
    await importIcd10Terms(db, [{ code: "U07", titleEn: null, titleJa: "緊急使用" }])

    const one = (await terms())[0]
    expect(one?.labelEn).toBe("緊急使用")
    expect(one?.labelJa).toBe("緊急使用")
  })

  it("makes a root for a four-character code neither distribution roots, named by its code", async () => {
    await importIcd10Terms(db, [C349])

    const held = await terms()
    const root = held.find((one) => one.code === "C34")
    expect(root?.labelEn).toBe("C34")
    expect(root?.labelJa).toBeNull()
    expect(held.find((one) => one.code === "C349")?.parentId).toBe(root?.id)
  })

  it("takes no code longer than four characters", async () => {
    await importIcd10Terms(db, [
      { code: "K75", titleEn: "Other inflammatory liver diseases", titleJa: null },
      { code: "K758", titleEn: "Other specified inflammatory liver diseases", titleJa: null },
      { code: "K7581", titleEn: "Nonalcoholic steatohepatitis", titleJa: null },
    ])

    expect((await terms()).map((one) => one.code).sort()).toEqual(["K75", "K758"])
  })

  it("reads back every code with its identity, and counts what is in", async () => {
    await importIcd10Terms(db, [C34, C349, { code: "U07", titleEn: null, titleJa: "緊急使用" }])

    const ids = await icd10TermIds(db)
    expect([...ids.keys()].sort()).toEqual(["C34", "C349", "U07"])
    expect(await icd10VocabularySize(db)).toEqual({ roots: 2, children: 1, withJa: 3 })
  })

  it("leaves the other vocabularies alone", async () => {
    const [assay] = await db.insert(s.vocabularySet)
      .values({ code: "assay", labelJa: "手法", labelEn: "Assay" })
      .returning({ id: s.vocabularySet.id })
    await db.insert(s.vocabularyTerm).values({ setId: assay?.id ?? "", code: "wgs", labelEn: "WGS" })

    await importIcd10Terms(db, [C34])

    expect((await terms()).map((one) => one.code).sort()).toEqual(["C34", "wgs"])
    expect(await icd10TermIds(db)).toEqual(new Map([["C34", expect.any(String)]]))
  })
})
