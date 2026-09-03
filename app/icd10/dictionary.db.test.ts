import { beforeAll, describe, expect, it } from "vitest"

import { getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { replaceDictionary, searchDictionary } from "./dictionary.server"
import { resolveTypedCode } from "./entry.server"

/** These run against the test database, so they need `docker compose up`. */
const db = getDb()

let setId = ""

function only<T>(rows: T[]): T {
  const [row] = rows
  if (row === undefined) throw new Error("expected exactly one row")
  return row
}

beforeAll(async () => {
  await emptyDatabase(getOwnerDb())
  await replaceDictionary(db, [
    { code: "A00", titleEn: "Cholera", titleJa: "コレラ" },
    { code: "C34", titleEn: "Malignant neoplasm of bronchus and lung", titleJa: "気管支及び肺" },
    { code: "C349", titleEn: "Bronchus or lung, unspecified", titleJa: "気管支又は肺，部位不明" },
    { code: "A085A", titleEn: null, titleJa: "伝染性下痢症" },
  ])
  setId = only(await db
    .insert(s.vocabularySet)
    .values({ code: "icd10", labelJa: "ICD10", labelEn: "ICD10", hierarchical: true })
    .returning({ id: s.vocabularySet.id })).id
  const parent = only(await db
    .insert(s.vocabularyTerm)
    .values({ setId, code: "C34", labelEn: "Lung", labelJa: "肺がん" })
    .returning({ id: s.vocabularyTerm.id })).id
  await db.insert(s.vocabularyTerm).values([
    { setId, code: "C349", labelEn: "Lung, unspecified", labelJa: "肺がん 詳細不明", parentId: parent },
    { setId, code: "C50", labelEn: "Breast", labelJa: "乳がん", active: false },
  ])
})

describe("replacing the dictionary", () => {
  it("does not touch the vocabulary", async () => {
    const before = await db.select().from(s.vocabularyTerm)

    await replaceDictionary(db, [{ code: "A00", titleEn: "Cholera", titleJa: "コレラ" }])
    await replaceDictionary(db, [
      { code: "A00", titleEn: "Cholera", titleJa: "コレラ" },
      { code: "C34", titleEn: "Malignant neoplasm of bronchus and lung", titleJa: "気管支及び肺" },
      { code: "C349", titleEn: "Bronchus or lung, unspecified", titleJa: "気管支又は肺，部位不明" },
      { code: "A085A", titleEn: null, titleJa: "伝染性下痢症" },
    ])

    // This is what lets every term be editable: a label somebody corrected
    // cannot be overwritten by the next import, because the import writes a
    // different table.
    expect(await db.select().from(s.vocabularyTerm)).toEqual(before)
  })

  it("holds a code that only one distribution names", async () => {
    const held = await searchDictionary(db, "A085A", 10)
    expect(held).toEqual([{ code: "A085A", titleEn: null, titleJa: "伝染性下痢症" }])
  })
})

describe("searching the dictionary", () => {
  it("finds a code by its code and by either title", async () => {
    expect((await searchDictionary(db, "c34", 10)).map((one) => one.code)).toEqual(["C34", "C349"])
    expect((await searchDictionary(db, "bronchus", 10)).map((one) => one.code))
      .toEqual(["C34", "C349"])
    expect((await searchDictionary(db, "気管支", 10)).map((one) => one.code)).toEqual(["C34", "C349"])
  })

  it("answers an empty box with nothing rather than with an arbitrary handful", async () => {
    expect(await searchDictionary(db, "   ", 10)).toEqual([])
  })

  it("orders by code, so a root comes before what rolls up into it", async () => {
    expect((await searchDictionary(db, "C3", 10)).map((one) => one.code)).toEqual(["C34", "C349"])
  })
})

describe("a typed code", () => {
  it("names a value of the vocabulary, however it was written", async () => {
    expect(await resolveTypedCode(db, setId, "c34.9")).toEqual({ status: "found", code: "C349" })
  })

  // Telling these two apart is the whole reason the dictionary is read from the
  // public side: without it both would come back as an empty result.
  it("is told to be a real code that nothing published carries", async () => {
    expect(await resolveTypedCode(db, setId, "A00")).toEqual({ status: "no-data", code: "A00" })
  })

  it("is told not to exist when the classification does not hold it", async () => {
    expect(await resolveTypedCode(db, setId, "Z99")).toEqual({ status: "unknown" })
    expect(await resolveTypedCode(db, setId, "肺がん")).toEqual({ status: "unknown" })
  })

  it("does not name a deactivated value", async () => {
    // C50 is a term, but a deactivated one, and the dictionary does not hold
    // the code either — so it reads as unknown rather than as choosable.
    expect(await resolveTypedCode(db, setId, "C50")).toEqual({ status: "unknown" })
  })
})
