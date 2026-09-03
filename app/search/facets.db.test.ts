import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { countTermChildren, countTerms, dateBounds, numberBounds } from "./counts.server"
import { parseQuery, type QueryNode } from "./dsl"
import { queryFields, type FacetField } from "./fields"
import { searchDocs, type SearchTarget } from "./query.server"

/**
 * These run against the test database, so they need `docker compose up`.
 *
 * The rows are written directly rather than derived: what is under test is the
 * query over them, and how they come to exist is `rebuild.db.test.ts`.
 */
const db = getDb()

const identities: Record<string, string> = {}
let fields = queryFields([])

function only<T>(rows: T[]): T {
  const [row] = rows
  if (row === undefined) throw new Error("expected exactly one row")
  return row
}

function ast(input: string): QueryNode | null {
  const parsed = parseQuery(input, fields)
  if (!parsed.ok) throw new Error(`${parsed.error.code} at ${parsed.error.column}`)
  return parsed.ast
}

async function labels(input: string, target: SearchTarget = "dataset"): Promise<string[]> {
  const result = await searchDocs(db, {
    target, ast: ast(input), fields, sort: "id", order: "asc", page: 1,
  })
  return result.hits.map((hit) => hit.datasetLabel ?? hit.humLabel)
}

async function set(code: string, hierarchical: boolean): Promise<string> {
  const { id } = only(await db.insert(s.vocabularySet)
    .values({ code, labelJa: code, labelEn: code, hierarchical })
    .returning({ id: s.vocabularySet.id }))
  return id
}

async function term(setId: string, code: string, parentId?: string): Promise<string> {
  const { id } = only(await db.insert(s.vocabularyTerm)
    .values({ setId, code, labelEn: code, labelJa: null, parentId })
    .returning({ id: s.vocabularyTerm.id }))
  return id
}

async function key(
  code: string,
  valueType: "vocabulary" | "number",
  setId: string | null,
): Promise<string> {
  const { id } = only(await db.insert(s.contentKey)
    .values({
      code,
      scope: "experiment",
      valueType,
      labelJa: code,
      labelEn: code,
      vocabularySetId: setId,
      multiple: true,
    })
    .returning({ id: s.contentKey.id }))
  return id
}

/** One dataset row, with the facet values it carries. */
async function doc(input: {
  label: string
  terms: { keyId: string, termId: string, ancestorIds?: string[] }[]
  numbers?: { keyId: string, value: number }[]
  /** Columns of the row rather than facet values, which is the whole point. */
  published?: string
  modified?: string
}): Promise<void> {
  const { id: researchId } = only(await db.insert(s.research).values({})
    .returning({ id: s.research.id }))
  const { id: docId } = only(await db.insert(s.searchDoc).values({
    targetType: "dataset",
    targetId: crypto.randomUUID(),
    researchId,
    humLabel: "hum0001",
    datasetLabel: input.label,
    title: "",
    textJa: input.label,
    textEn: "",
    datePublished: input.published,
    dateModified: input.modified,
  }).returning({ id: s.searchDoc.id }))
  for (const one of input.terms) {
    await db.insert(s.searchFacetTerm).values({
      docId,
      keyId: one.keyId,
      termId: one.termId,
      ancestorIds: one.ancestorIds ?? [],
    })
  }
  for (const one of input.numbers ?? []) {
    await db.insert(s.searchFacetNumber).values({ docId, keyId: one.keyId, value: one.value })
  }
}

beforeAll(async () => {
  await emptyDatabase(getOwnerDb())

  const icd10 = await set("icd10", true)
  const assay = await set("assay", false)
  const lung = await term(icd10, "C34")
  const lungUnspecified = await term(icd10, "C349", lung)
  const lungUpper = await term(icd10, "C341", lung)
  const prostate = await term(icd10, "C61")
  const wgs = await term(assay, "wgs")
  const rna = await term(assay, "rna-seq")

  const disease = await key("disease", "vocabulary", icd10)
  const method = await key("assay", "vocabulary", assay)
  const readLength = await key("read-length", "number", null)
  Object.assign(identities, { disease, method, readLength, lung, lungUnspecified, prostate })

  fields = queryFields([
    { code: "disease", keyId: disease, kind: "vocabulary", setId: icd10 },
    { code: "assay", keyId: method, kind: "vocabulary", setId: assay },
    { code: "read-length", keyId: readLength, kind: "number", setId: null },
  ] satisfies FacetField[])

  await doc({
    label: "JGAD000001",
    terms: [
      { keyId: disease, termId: lungUnspecified, ancestorIds: [lung] },
      { keyId: method, termId: wgs },
    ],
    numbers: [{ keyId: readLength, value: 150 }],
    published: "2015-06-01",
    modified: "2020-01-31",
  })
  await doc({
    label: "JGAD000002",
    terms: [
      { keyId: disease, termId: lungUpper, ancestorIds: [lung] },
      { keyId: method, termId: rna },
    ],
    numbers: [{ keyId: readLength, value: 100 }],
    published: "2021-01-05",
    // No modification date, which is the state the dataset dates are in until
    // the application system is reachable.
  })
  await doc({
    label: "JGAD000003",
    terms: [{ keyId: disease, termId: prostate }, { keyId: method, termId: wgs }],
    numbers: [{ keyId: readLength, value: 250 }],
    published: "2018-03-20",
  })
})

afterAll(async () => {
  await emptyDatabase(getOwnerDb())
  await closePools()
})

describe("filtering by a facet", () => {
  it("matches the rows filed under a broader term as well as under the term itself", async () => {
    // The whole point of the tree: nobody files a dataset under a 3-character
    // ICD10 code, and asking for one has to find the 4-character codes below it.
    expect(await labels("disease:C34")).toEqual(["JGAD000001", "JGAD000002"])
    expect(await labels("disease:C349")).toEqual(["JGAD000001"])
  })

  it("takes several values of one facet as alternatives and two facets as both", async () => {
    expect(await labels("disease:C349 OR disease:C61")).toEqual(["JGAD000001", "JGAD000003"])
    expect(await labels("disease:C34 assay:wgs")).toEqual(["JGAD000001"])
  })

  it("matches nothing for a value the vocabulary does not hold", async () => {
    expect(await labels("disease:Z99")).toEqual([])
  })

  it("does not let a value of one facet answer for another", async () => {
    expect(await labels("assay:C34")).toEqual([])
  })

  it("holds a numeric range at one end or at both", async () => {
    expect(await labels("read-length:[100 TO 150]")).toEqual(["JGAD000001", "JGAD000002"])
    expect(await labels("read-length:[200 TO *]")).toEqual(["JGAD000003"])
    expect(await labels("read-length:[* TO 100]")).toEqual(["JGAD000002"])
    expect(await labels("read-length:150")).toEqual(["JGAD000001"])
  })

  it("counts a row with no value under the facet as not matching", async () => {
    expect(await labels("NOT disease:C34")).toEqual(["JGAD000003"])
  })
})

describe("counting the facets of a result", () => {
  const query = (input: string) => ({ target: "dataset" as const, ast: ast(input), fields })

  it("counts a hierarchical vocabulary at the root of its tree", async () => {
    const counts = await countTerms(db, query(""), [identities.disease ?? ""])

    expect(counts.map((row) => [row.code, row.count])).toEqual([["C34", 2], ["C61", 1]])
  })

  it("counts a flat vocabulary at the term itself", async () => {
    const counts = await countTerms(db, query(""), [identities.method ?? ""])

    expect(counts.map((row) => [row.code, row.count])).toEqual([["wgs", 2], ["rna-seq", 1]])
  })

  it("counts only what the rest of the search leaves", async () => {
    const counts = await countTerms(db, query("assay:wgs"), [identities.disease ?? ""])

    expect(counts.map((row) => [row.code, row.count])).toEqual([["C34", 1], ["C61", 1]])
  })

  it("counts a row once under a root however many of its children it carries", async () => {
    await doc({
      label: "JGAD000004",
      terms: [
        { keyId: identities.disease ?? "", termId: identities.lungUnspecified ?? "", ancestorIds: [identities.lung ?? ""] },
        { keyId: identities.disease ?? "", termId: identities.prostate ?? "" },
      ],
    })
    const counts = await countTerms(db, query(""), [identities.disease ?? ""])

    expect(counts.map((row) => [row.code, row.count])).toEqual([["C34", 3], ["C61", 2]])
  })

  it("counts what sits underneath a root only when the facet is opened", async () => {
    const children = await countTermChildren(db, query(""), identities.disease ?? "")

    const under = children
      .filter((row) => row.rootId === identities.lung)
      .map((row) => [row.code, row.count])
    expect(under).toEqual([["C349", 2], ["C341", 1]])
  })

  it("gives the span a numeric facet covers in the result", async () => {
    expect(await numberBounds(db, query(""), [identities.readLength ?? ""]))
      .toEqual([{ keyId: identities.readLength, min: 100, max: 250 }])
    expect(await numberBounds(db, query("assay:rna-seq"), [identities.readLength ?? ""]))
      .toEqual([{ keyId: identities.readLength, min: 100, max: 100 }])
  })

  it("gives the span of days the result covers, narrowing with the result", async () => {
    expect(await dateBounds(db, query(""))).toEqual({
      date_published: { min: "2015-06-01", max: "2021-01-05" },
      date_modified: { min: "2020-01-31", max: "2020-01-31" },
    })
    expect(await dateBounds(db, query("assay:wgs"))).toEqual({
      date_published: { min: "2015-06-01", max: "2018-03-20" },
      date_modified: { min: "2020-01-31", max: "2020-01-31" },
    })
  })

  it("says nothing about a date the result never carries", async () => {
    // The panel draws no control at all for this, rather than two empty boxes
    // over a span that does not exist.
    expect(await dateBounds(db, query("assay:rna-seq"))).toEqual({
      date_published: { min: "2021-01-05", max: "2021-01-05" },
      date_modified: null,
    })
  })
})

describe("filtering by a date, which is a column rather than a facet row", () => {
  it("holds a date range at one end or at both", async () => {
    expect(await labels("date_published:[2015-01-01 TO 2019-12-31]"))
      .toEqual(["JGAD000001", "JGAD000003"])
    expect(await labels("date_published:[2019-01-01 TO *]")).toEqual(["JGAD000002"])
    expect(await labels("date_published:[* TO 2016-12-31]")).toEqual(["JGAD000001"])
    expect(await labels("date_published:2018-03-20")).toEqual(["JGAD000003"])
  })

  it("leaves out a row with no date, whichever way the range is open", async () => {
    expect(await labels("date_modified:[* TO 2030-01-01]")).toEqual(["JGAD000001"])
    expect(await labels("date_modified:[2000-01-01 TO *]")).toEqual(["JGAD000001"])
  })

  it("takes a date and a facet as two conditions on the same row", async () => {
    expect(await labels("date_published:[2015-01-01 TO 2019-12-31] assay:wgs"))
      .toEqual(["JGAD000001", "JGAD000003"])
    expect(await labels("date_published:[2019-01-01 TO *] assay:wgs")).toEqual([])
  })
})
