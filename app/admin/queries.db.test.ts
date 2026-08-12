import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import {
  findTerms,
  loadCatalogWithTerms,
  loadEditableCatalog,
  TERM_CANDIDATES,
  termsByIds,
} from "./queries.server"

/**
 * How an editing screen learns about a vocabulary, against the development
 * database.
 *
 * **The weight of a screen must not follow the size of the catalog.** A
 * vocabulary holds anything from three values to several hundred, so what is
 * chosen is resolved by identity and the rest is searched for; nothing sends a
 * vocabulary whole to a page.
 */
const db = getDb()

const held: Record<string, string> = {}
let setId = ""

function only<T>(rows: T[]): T {
  const [row] = rows
  if (row === undefined) throw new Error("expected exactly one row")
  return row
}

beforeAll(async () => {
  await emptyDatabase(getOwnerDb())
  setId = only(await db
    .insert(s.vocabularySet)
    .values({ code: "icd10", labelJa: "ICD10", labelEn: "ICD10", hierarchical: true })
    .returning({ id: s.vocabularySet.id })).id
  const rows = await db.insert(s.vocabularyTerm).values([
    { setId, code: "C34", labelEn: "Bronchus and lung", labelJa: "気管支及び肺" },
    { setId, code: "C349", labelEn: "Bronchus or lung, unspecified", labelJa: "気管支又は肺" },
    { setId, code: "C50", labelEn: "Breast", labelJa: "乳房" },
    { setId, code: "C61", labelEn: "Prostate", labelJa: "前立腺", active: false },
  ]).returning({ id: s.vocabularyTerm.id, code: s.vocabularyTerm.code })
  for (const row of rows) held[row.code] = row.id
  await db.insert(s.contentKey).values({
    code: "disease-icd10",
    scope: "experiment",
    valueType: "vocabulary",
    labelJa: "疾患",
    labelEn: "Disease",
    vocabularySetId: setId,
  })
})

afterAll(async () => {
  await closePools()
})

describe("the catalog an editing screen gets", () => {
  it("carries the keys and no terms at all", async () => {
    const catalog = await loadEditableCatalog(db)

    expect(catalog.keys.map((key) => key.code)).toEqual(["disease-icd10"])
    expect(catalog).not.toHaveProperty("terms")
  })

  it("carries every term when what asks is matching against upstream", async () => {
    // Only the server side may ask for this: nothing of it reaches a page.
    const catalog = await loadCatalogWithTerms(db)

    expect(catalog.terms.map((term) => term.code).sort()).toEqual(["C34", "C349", "C50"])
  })
})

describe("resolving what a document names", () => {
  it("answers only what was asked for, once each", async () => {
    const wanted = [held.C34, held.C34, held.C50].filter((id) => id !== undefined)

    const terms = await termsByIds(db, wanted)

    expect(terms.map((term) => term.code).sort()).toEqual(["C34", "C50"])
  })

  // Taking a term out of the candidates is not taking it out of the documents:
  // a value that already names one still has to be readable.
  it("answers a deactivated term as well as an active one", async () => {
    expect((await termsByIds(db, [held.C61 ?? ""])).map((term) => term.code)).toEqual(["C61"])
  })

  it("asks nothing of the database when nothing is named", async () => {
    expect(await termsByIds(db, [])).toEqual([])
  })
})

describe("the candidates for what was typed", () => {
  const codesOf = async (needle: string) =>
    (await findTerms(db, setId, needle)).map((term) => term.code)

  it("matches on the code and on either label", async () => {
    expect(await codesOf("C34")).toEqual(["C34", "C349"])
    expect(await codesOf("breast")).toEqual(["C50"])
    expect(await codesOf("気管支")).toEqual(["C34", "C349"])
  })

  it("answers an empty box with nothing rather than with an arbitrary handful", async () => {
    expect(await codesOf("")).toEqual([])
    expect(await codesOf("   ")).toEqual([])
  })

  it("leaves out a deactivated term, which is what deactivating is for", async () => {
    expect(await codesOf("prostate")).toEqual([])
  })

  it("stops at the cap however many match", async () => {
    const many = Array.from({ length: TERM_CANDIDATES + 5 }, (_, i) => ({
      setId,
      code: `Z${String(i).padStart(2, "0")}`,
      labelEn: `filler ${i}`,
    }))
    await db.insert(s.vocabularyTerm).values(many)

    expect(await codesOf("filler")).toHaveLength(TERM_CANDIDATES)
  })
})
