import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { grantAdmin } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { createSession, sessionCookie } from "~/auth/session.server"
import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { ContentValue } from "~/content/types"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { seedVersion } from "~/db/seed"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { catalogAction, catalogPage, fieldTermsPage } from "./catalog.server"
import { saveDatasetEntry } from "./drafts.server"

/**
 * The catalog screens with their guard on, against the development database.
 *
 * What is worth watching here is the line between what an administrator may
 * change and what only a development change may: a type, and anything the data
 * already points at. What the data brings in is editable; the settled
 * vocabularies — the portal's own, and ICD10 as the classification put in
 * whole — are read here and refused every write.
 */
const db = getDb()

const CURATOR = { sub: "0f3a-1b2c", name: "curator", idToken: "an-id-token" }
const READER = { sub: "9c8b-7a6d", name: "somebody", idToken: "another-id-token" }

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

function only<T>(rows: T[]): T {
  const [row] = rows
  if (row === undefined) throw new Error("expected exactly one row")
  return row
}

async function signIn(person: typeof CURATOR, admin: boolean): Promise<string> {
  const token = await createSession(db, person)
  if (admin) await grantAdmin(db, BOOTSTRAP_ACTOR, person)
  return token
}

function get(token: string | null, path: string): Request {
  const headers = new Headers()
  if (token !== null) headers.set("cookie", sessionCookie(token).split(";")[0] ?? "")
  return new Request(`http://localhost:8080${path}`, { headers })
}

function post(token: string, fields: Record<string, string>): Request {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" })
  headers.set("cookie", sessionCookie(token).split(";")[0] ?? "")
  return new Request("http://localhost:8080/admin/experiment-fields", {
    method: "POST",
    headers,
    body: new URLSearchParams(fields).toString(),
  })
}

async function thrown(work: () => Promise<unknown>): Promise<Response> {
  const result = await work().then(() => null, (error: unknown) => error)
  if (!(result instanceof Response)) throw new Error("expected a Response to be thrown")
  return result
}

async function vocabulary(code: string): Promise<string> {
  const { id } = only(await db.insert(s.vocabularySet)
    .values({ code, labelJa: code, labelEn: code })
    .returning({ id: s.vocabularySet.id }))
  return id
}

/**
 * The field a vocabulary belongs to. The terms are addressed through it, so a
 * vocabulary without one is not reachable at all (`admin/urls.ts`).
 */
async function fieldFor(code: string, setId: string): Promise<void> {
  await db.insert(s.contentKey).values({
    code,
    scope: "experiment",
    valueType: "vocabulary",
    labelJa: code,
    labelEn: code,
    vocabularySetId: setId,
  })
}

async function term(setId: string, code: string): Promise<string> {
  const { id } = only(await db.insert(s.vocabularyTerm)
    .values({ setId, code, labelEn: code })
    .returning({ id: s.vocabularyTerm.id }))
  return id
}

async function freeTextKey(code: string): Promise<string> {
  const { id } = only(await db.insert(s.contentKey)
    .values({ code, scope: "experiment", valueType: "text", labelJa: code, labelEn: code })
    .returning({ id: s.contentKey.id }))
  return id
}

/**
 * The value a published dataset is given. A disease keeps its identities one
 * level deeper than a vocabulary value does, which is the shape "is this term
 * in use" has to read as well.
 */
function diseaseOrTerm(value: { termId?: string, asDisease?: boolean }): ContentValue {
  if (value.termId === undefined) {
    return { kind: "text", text: { ja: filled([[{ text: "x" }]]), en: filled([]) } }
  }
  return value.asDisease === true
    ? { kind: "disease", diseases: filled([{ termIds: [value.termId], nameJa: null, nameEn: null }]) }
    : { kind: "vocabulary", termIds: filled([value.termId]) }
}

/**
 * A published dataset with one value, so that "in use" means something.
 * Each call is a research of its own, so a second one needs labels of its own.
 */
async function publishedValue(
  value: { keyId: string, termId?: string, asDisease?: boolean },
  labels: { hum: string, dataset: string } = { hum: "hum0001", dataset: "JGAD000001" },
): Promise<void> {
  const { id: researchId } = only(await db.insert(s.research).values({})
    .returning({ id: s.research.id }))
  const { id: datasetId } = only(await db.insert(s.dataset).values({ researchId })
    .returning({ id: s.dataset.id }))
  await seedVersion(db, {
    researchId,
    number: 1,
    datasets: [{
      datasetId,
      content: {
        ...emptyDatasetContent(),
        experiments: [{
          id: "experiment-1",
          label: filled("WGS"),
          values: [{
            keyId: value.keyId,
            value: diseaseOrTerm(value),
          }],
        }],
      },
    }],
  })
  await db.insert(s.labelPin)
    .values({ kind: "hum", label: labels.hum, researchId, isPrimary: true })
  await db.insert(s.labelPin)
    .values({ kind: "dataset", label: labels.dataset, datasetId, isPrimary: true })
  // "In use" is asked of the published rows, which is where a publish would
  // have put this value.
  await rebuildSearchDocs(db)
}

/**
 * A draft holding one value, published nowhere: what "in use" has to see and
 * the public listing never shows.
 */
async function draftedValue(value: { keyId: string, termId?: string, asDisease?: boolean }): Promise<void> {
  const { id: researchId } = only(await db.insert(s.research).values({})
    .returning({ id: s.research.id }))
  const { id: datasetId } = only(await db.insert(s.dataset).values({ researchId })
    .returning({ id: s.dataset.id }))
  const { id: draftId } = only(await db.insert(s.researchDraft)
    .values({ researchId, content: emptyResearchContent(), shareToken: `share-${researchId}` })
    .returning({ id: s.researchDraft.id }))
  await db.insert(s.draftDatasetEntry).values({
    draftId,
    datasetId,
    content: {
      ...emptyDatasetContent(),
      values: [{
        keyId: value.keyId,
        value: diseaseOrTerm(value),
      }],
    },
  })
}

describe("who may read the catalog", () => {
  it("refuses somebody who is signed in but not an administrator", async () => {
    const token = await signIn(READER, false)

    const answer = await thrown(() => catalogPage(get(token, "/admin/experiment-fields")))
    expect(answer.status).toBe(403)
  })
})

describe("putting a key where a row was dropped", () => {
  it("moves the key to that place and renumbers the rest", async () => {
    const token = await signIn(CURATOR, true)
    const a = await freeTextKey("a")
    const b = await freeTextKey("b")
    const c = await freeTextKey("c")
    await db.update(s.contentKey).set({ position: 0 }).where(eq(s.contentKey.id, a))
    await db.update(s.contentKey).set({ position: 1 }).where(eq(s.contentKey.id, b))
    await db.update(s.contentKey).set({ position: 2 }).where(eq(s.contentKey.id, c))

    expect(await catalogAction(post(token, { intent: "move-key-to", keyId: c, to: "0" })))
      .toEqual({ status: "ok", did: "move-key-to", moved: { id: c, from: 2, to: 0, of: 3 } })

    const view = await catalogPage(get(token, "/admin/experiment-fields"))
    expect(view.keys.map((key) => [key.code, key.position])).toEqual([["c", 0], ["a", 1], ["b", 2]])
  })

  it("does nothing for a place past the end, and refuses one that is not a number", async () => {
    const token = await signIn(CURATOR, true)
    const a = await freeTextKey("a")
    await freeTextKey("b")

    // Nothing moved, so there is nothing to take back.
    expect(await catalogAction(post(token, { intent: "move-key-to", keyId: a, to: "5" }))).toEqual({ status: "ok", did: "move-key-to" })
    expect(await catalogAction(post(token, { intent: "move-key-to", keyId: a, to: "first" }))).toEqual({ status: "unknown-target" })
    const view = await catalogPage(get(token, "/admin/experiment-fields"))
    expect(view.keys.map((key) => key.code)).toEqual(["a", "b"])
  })
})

describe("whether a key can still go", () => {
  it("reports a key is in use when a published dataset holds a value under it", async () => {
    const token = await signIn(CURATOR, true)
    const keyId = await freeTextKey("coverage")
    await freeTextKey("depth")
    await publishedValue({ keyId })

    const view = await catalogPage(get(token, "/admin/experiment-fields"))
    expect(view.keys.map((key) => [key.code, key.used, key.inUse])).toEqual([["coverage", 1, true], ["depth", 0, false]])
  })

  it("reports a key is in use when only a draft holds a value under it, though no dataset counts", async () => {
    const token = await signIn(CURATOR, true)
    const keyId = await freeTextKey("coverage")
    await draftedValue({ keyId })

    const view = await catalogPage(get(token, "/admin/experiment-fields"))
    expect(view.keys.map((key) => [key.used, key.inUse])).toEqual([[0, true]])
  })

  it("counts each published dataset once under the key", async () => {
    const token = await signIn(CURATOR, true)
    const keyId = await freeTextKey("coverage")
    await publishedValue({ keyId })
    await publishedValue({ keyId }, { hum: "hum0002", dataset: "JGAD000002" })

    const view = await catalogPage(get(token, "/admin/experiment-fields"))
    expect(view.keys.map((key) => key.used)).toEqual([2])
  })
})

describe("the keys an administrator may add", () => {
  it("adds a free-text key under a code made from its English label, and puts it last", async () => {
    const token = await signIn(CURATOR, true)
    await freeTextKey("coverage")

    const result = await catalogAction(post(token, {
      intent: "create-key",
      // Nothing reads a typed code: the form has no box for one.
      code: "typed-by-hand",
      scope: "experiment",
      labelJa: "深度",
      labelEn: "Read depth",
    }))

    expect(result).toMatchObject({ status: "ok" })
    const added = only(await db.select().from(s.contentKey).where(eq(s.contentKey.code, "read-depth")))
    expect(added.valueType).toBe("text")
    expect(added.position).toBe(1)
    expect(await db.select().from(s.contentKey).where(eq(s.contentKey.code, "typed-by-hand"))).toHaveLength(0)
  })

  it("moves a key off the name of a field the search owns rather than refusing the label", async () => {
    const token = await signIn(CURATOR, true)

    const result = await catalogAction(post(token, {
      intent: "create-key",
      scope: "experiment",
      labelJa: "題目",
      labelEn: "Title",
    }))

    expect(result).toMatchObject({ status: "ok" })
    expect(only(await db.select().from(s.contentKey)).code).toBe("title-2")
  })

  it("takes the next free code when the label reads the same as a key already there", async () => {
    const token = await signIn(CURATOR, true)
    await freeTextKey("coverage")

    const result = await catalogAction(post(token, {
      intent: "create-key",
      scope: "experiment",
      labelJa: "深度",
      labelEn: "Coverage",
    }))

    expect(result).toMatchObject({ status: "ok" })
    expect((await db.select().from(s.contentKey)).map((one) => one.code).sort()).toEqual(["coverage", "coverage-2"])
  })

  it("refuses a label that nothing a code can hold can be made from", async () => {
    const token = await signIn(CURATOR, true)

    const result = await catalogAction(post(token, {
      intent: "create-key",
      scope: "experiment",
      labelJa: "深度",
      labelEn: "深度",
    }))

    expect(result).toEqual({ status: "no-code" })
    expect(await db.select().from(s.contentKey)).toHaveLength(0)
  })
})

describe("the keys an administrator may take away", () => {
  it("keeps a key a dataset still holds a value under", async () => {
    const token = await signIn(CURATOR, true)
    const keyId = await freeTextKey("coverage")
    await publishedValue({ keyId })

    const result = await catalogAction(post(token, { intent: "delete-key", keyId }))

    expect(result).toEqual({ status: "in-use" })
    expect(await db.select().from(s.contentKey)).toHaveLength(1)
  })

  it("keeps a typed key, because taking a facet away is a development change", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("assay")
    const { id: keyId } = only(await db.insert(s.contentKey)
      .values({ code: "assay", scope: "experiment", valueType: "vocabulary", labelJa: "手法", labelEn: "Assay", vocabularySetId: setId })
      .returning({ id: s.contentKey.id }))

    const result = await catalogAction(post(token, { intent: "delete-key", keyId }))

    expect(result).toEqual({ status: "not-editable" })
  })

  it("takes away one nothing points at", async () => {
    const token = await signIn(CURATOR, true)
    const keyId = await freeTextKey("coverage")

    expect(await catalogAction(post(token, { intent: "delete-key", keyId })))
      .toMatchObject({ status: "ok" })
    expect(await db.select().from(s.contentKey)).toHaveLength(0)
  })
})

describe("the terms of a vocabulary", () => {
  it("refuses to reword an ICD10 term: its heading is the classification's, not the portal's", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("icd10")
    const termId = await term(setId, "C91")
    const before = only(await db.select().from(s.vocabularyTerm))

    // A code filed under the wrong disease is corrected on the value that identifies
    // it, not by renaming the classification.
    expect(await catalogAction(post(token, {
      intent: "update-term",
      termId,
      labelEn: "Lymphoma",
      labelJa: "リンパ腫",
    }))).toEqual({ status: "not-editable" })
    expect(only(await db.select().from(s.vocabularyTerm))).toEqual(before)
  })

  it("refuses to delete a term in use, and keeps it for the data that identifies it", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("assay")
    const termId = await term(setId, "wgs")
    const { id: keyId } = only(await db.insert(s.contentKey)
      .values({ code: "assay", scope: "experiment", valueType: "vocabulary", labelJa: "手法", labelEn: "Assay", vocabularySetId: setId })
      .returning({ id: s.contentKey.id }))
    await publishedValue({ keyId, termId })

    expect(await catalogAction(post(token, { intent: "delete-term", termId })))
      .toEqual({ status: "in-use" })

    expect(only(await db.select().from(s.vocabularyTerm)).id).toBe(termId)
  })

  it("counts a term only a disease names as in use, which is a shape of its own", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("icd10")
    const termId = await term(setId, "K758")
    const { id: keyId } = only(await db.insert(s.contentKey)
      .values({ code: "disease", scope: "experiment", valueType: "disease", labelJa: "疾患", labelEn: "Disease", vocabularySetId: setId })
      .returning({ id: s.contentKey.id }))
    await publishedValue({ keyId, termId, asDisease: true })

    // The screen reads it as in use, the way a term a vocabulary value names is.
    const view = await fieldTermsPage(get(token, "/admin/experiment-fields/disease"), "disease")
    expect(view?.terms.find((row) => row.id === termId)?.inUse).toBe(true)
  })

  it("renames a term without touching what points at it", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("assay")
    const termId = await term(setId, "wgs")
    const { id: keyId } = only(await db.insert(s.contentKey)
      .values({ code: "assay", scope: "experiment", valueType: "vocabulary", labelJa: "手法", labelEn: "Assay", vocabularySetId: setId })
      .returning({ id: s.contentKey.id }))
    await publishedValue({ keyId, termId })
    const before = only(await db.select().from(s.researchVersion)).content

    expect(await catalogAction(post(token, {
      intent: "update-term",
      termId,
      labelEn: "Whole genome sequencing",
      labelJa: "全ゲノムシークエンス",
    }))).toMatchObject({ status: "ok" })

    expect(only(await db.select().from(s.researchVersion)).content).toEqual(before)
    expect(only(await db.select().from(s.vocabularyTerm)).labelEn).toBe("Whole genome sequencing")
  })

  it("counts the published datasets that have a term, and not the research rows beside them", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("assay")
    const termId = await term(setId, "wgs")
    const { id: keyId } = only(await db.insert(s.contentKey)
      .values({ code: "assay", scope: "experiment", valueType: "vocabulary", labelJa: "手法", labelEn: "Assay", vocabularySetId: setId })
      .returning({ id: s.contentKey.id }))
    // Two researches of one dataset each: four search rows have the term, and
    // the public listing the count opens shows two.
    await publishedValue({ keyId, termId })
    await publishedValue({ keyId, termId }, { hum: "hum0002", dataset: "JGAD000002" })
    // The search rows are what usage is counted from, and a catalog write is
    // what rebuilds them.
    await catalogAction(post(token, { intent: "update-term", termId, labelEn: "WGS" }))
    expect(await db.select().from(s.searchFacetTerm)).toHaveLength(4)

    const view = await fieldTermsPage(get(token, "/admin/experiment-fields/assay"), "assay")
    expect(view?.terms.map((row) => row.used)).toEqual([2])
  })

  it("reports a term is in use when only a draft points at it, though no dataset counts", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("assay")
    const termId = await term(setId, "wgs")
    await term(setId, "wes")
    const { id: keyId } = only(await db.insert(s.contentKey)
      .values({ code: "assay", scope: "experiment", valueType: "vocabulary", labelJa: "手法", labelEn: "Assay", vocabularySetId: setId })
      .returning({ id: s.contentKey.id }))
    await draftedValue({ keyId, termId })

    const view = await fieldTermsPage(get(token, "/admin/experiment-fields/assay"), "assay")
    expect(view?.terms.map((row) => [row.code, row.used, row.inUse]))
      .toEqual([["wes", 0, false], ["wgs", 0, true]])
  })

  it("lists every term, whatever an address kept from before queries about their state", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("assay")
    await fieldFor("assay", setId)
    await term(setId, "wgs")
    await term(setId, "wes")

    for (const asked of ["", "?state=active", "?state=inactive", "?state=active&state=inactive"]) {
      const view = await fieldTermsPage(get(token, `/admin/experiment-fields/assay${asked}`), "assay")
      expect(view?.terms.map((row) => row.code), asked).toEqual(["wes", "wgs"])
    }
  })

  it("paginates the terms at the page size asked for, and at the default for any other", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("assay")
    await fieldFor("assay", setId)
    for (let at = 0; at < 21; at += 1) await term(setId, `t${String(at).padStart(2, "0")}`)
    const paged = async (search: string) => {
      const view = await fieldTermsPage(get(token, `/admin/experiment-fields/assay${search}`), "assay")
      return [view?.size, view?.terms.length, view?.pageCount, view?.rangeFrom, view?.rangeTo]
    }

    expect(await paged("")).toEqual([20, 20, 2, 1, 20])
    expect(await paged("?page=2")).toEqual([20, 1, 2, 21, 21])
    expect(await paged("?size=50")).toEqual([50, 21, 1, 1, 21])
    // Past the last page of a larger size is that last page, not an empty one.
    expect(await paged("?size=100&page=2")).toEqual([100, 21, 1, 1, 21])
    for (const asked of ["?size=21", "?size=0", "?size=-20", "?size=abc", "?size="]) {
      expect(await paged(asked), asked).toEqual([20, 20, 2, 1, 20])
    }
  })
})

describe("the ICD10 vocabulary", () => {
  it("opens with nothing to press, and refuses every write", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("icd10")
    await fieldFor("disease", setId)
    const termId = await term(setId, "C34")
    const other = await term(setId, "C349")

    const view = await fieldTermsPage(get(token, "/admin/experiment-fields/disease"), "disease")
    expect(view?.editable).toBe(false)

    expect(await catalogAction(post(token, { intent: "create-term", setId, labelEn: "Bronchus or lung, unspecified" })))
      .toEqual({ status: "not-editable" })
    expect(await catalogAction(post(token, { intent: "delete-term", termId })))
      .toEqual({ status: "not-editable" })
    expect(await catalogAction(post(token, { intent: "merge-term", termId, intoId: other })))
      .toEqual({ status: "not-editable" })
    expect((await db.select().from(s.vocabularyTerm)).map((row) => row.id).sort())
      .toEqual([termId, other].sort())
  })

  it("leaves a flat vocabulary flat", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("assay")

    await catalogAction(post(token, { intent: "create-term", setId, code: "wgs", labelEn: "WGS" }))

    expect(only(await db.select().from(s.vocabularyTerm)).parentId).toBeNull()
  })
})

describe("narrowing the fields listing", () => {
  /** Three fields: one of each type the listing's axis offers but `disease`. */
  async function threeFields(): Promise<string> {
    const box = only(await db.insert(s.facetCategory)
      .values({ code: "experiment", labelJa: "実験", labelEn: "Experiment", position: 0 })
      .returning({ id: s.facetCategory.id })).id
    await freeTextKey("targets")
    await db.insert(s.contentKey).values([
      {
        code: "platform",
        scope: "experiment",
        valueType: "vocabulary",
        labelJa: "プラットフォーム",
        labelEn: "Platform",
        position: 1,
        facetCategoryId: box,
      },
      {
        code: "read-length",
        scope: "experiment",
        valueType: "number",
        labelJa: "リード長",
        labelEn: "Read length",
        position: 2,
        facetCategoryId: box,
      },
    ])
    return box
  }

  it("counts each axis over the fields the other conditions leave", async () => {
    const token = await signIn(CURATOR, true)
    await threeFields()

    const view = await catalogPage(get(token, "/admin/experiment-fields?type=number"))

    expect(view.keys.map((one) => one.code)).toEqual(["read-length"])
    // The type axis is counted with its own condition lifted, so all three.
    expect(view.counts.types).toEqual({ text: 1, vocabulary: 1, number: 1, disease: 0 })
  })

  it("drops a condition the address has that identifies nothing", async () => {
    const token = await signIn(CURATOR, true)
    await threeFields()

    const view = await catalogPage(
      get(token, "/admin/experiment-fields?type=nonesuch"),
    )

    expect(view.types).toEqual([])
    expect(view.keys).toHaveLength(3)
  })

  it("keeps the fields in the order the public table has them", async () => {
    const token = await signIn(CURATOR, true)
    await threeFields()

    const view = await catalogPage(get(token, "/admin/experiment-fields"))
    expect(view.keys.map((one) => one.code)).toEqual(["targets", "platform", "read-length"])
  })
})

describe("merging one term into another", () => {
  /** A vocabulary with two spellings of the same thing, and the field for it. */
  async function twoSpellings(): Promise<{ setId: string, keyId: string, from: string, into: string }> {
    const setId = await vocabulary("assay")
    const from = await term(setId, "wgs")
    const into = await term(setId, "whole-genome-sequencing")
    const { id: keyId } = only(await db.insert(s.contentKey)
      .values({
        code: "assay",
        scope: "experiment",
        valueType: "vocabulary",
        labelJa: "手法",
        labelEn: "Assay",
        vocabularySetId: setId,
      })
      .returning({ id: s.contentKey.id }))
    return { setId, keyId, from, into }
  }

  function chosenIn(content: unknown): string[] {
    const held = JSON.stringify(content)
    return [...held.matchAll(/"termIds":\{"state":"value","value":\[([^\]]*)\]/g)]
      .flatMap((match) => (match[1] ?? "").split(",").filter((one) => one !== ""))
      .map((one) => one.replaceAll("\"", ""))
  }

  it("rewrites a published version to point at the term that is kept", async () => {
    const token = await signIn(CURATOR, true)
    const { keyId, from, into } = await twoSpellings()
    await publishedValue({ keyId, termId: from })

    expect(await catalogAction(post(token, { intent: "merge-term", termId: from, intoId: into })))
      .toMatchObject({ status: "ok" })

    const version = only(await db.select().from(s.researchVersion))
    expect(chosenIn(version.content)).toEqual([into])
    // The merged term is gone, which is what makes this different from
    // turning one off.
    expect(await db.select().from(s.vocabularyTerm).where(eq(s.vocabularyTerm.id, from)))
      .toHaveLength(0)
  })

  it("rewrites a draft and moves its revision on, so an open editor is refused", async () => {
    const token = await signIn(CURATOR, true)
    const { keyId, from, into } = await twoSpellings()
    const { id: researchId } = only(await db.insert(s.research).values({})
      .returning({ id: s.research.id }))
    const { id: datasetId } = only(await db.insert(s.dataset).values({ researchId })
      .returning({ id: s.dataset.id }))
    const { id: draftId } = only(await db.insert(s.researchDraft)
      .values({
        researchId,
        content: emptyResearchContent(),
        shareToken: `share-${researchId}`,
      })
      .returning({ id: s.researchDraft.id }))
    await db.insert(s.draftDatasetEntry).values({
      draftId,
      datasetId,
      content: {
        ...emptyDatasetContent(),
        values: [{ keyId, value: { kind: "vocabulary", termIds: filled([from]) } }],
      },
    })

    await catalogAction(post(token, { intent: "merge-term", termId: from, intoId: into }))

    const entry = only(await db.select().from(s.draftDatasetEntry))
    expect(chosenIn(entry.content)).toEqual([into])
    expect(entry.revision).toBe(2)
  })

  it("refuses the save of an editor who was holding the row when it was merged", async () => {
    const token = await signIn(CURATOR, true)
    const { keyId, from, into } = await twoSpellings()
    const { id: researchId } = only(await db.insert(s.research).values({})
      .returning({ id: s.research.id }))
    const { id: datasetId } = only(await db.insert(s.dataset).values({ researchId })
      .returning({ id: s.dataset.id }))
    const { id: draftId } = only(await db.insert(s.researchDraft)
      .values({
        researchId,
        content: emptyResearchContent(),
        shareToken: `share-${researchId}`,
      })
      .returning({ id: s.researchDraft.id }))
    const pointing = {
      ...emptyDatasetContent(),
      values: [{ keyId, value: { kind: "vocabulary" as const, termIds: filled([from]) } }],
    }
    const opened = await saveDatasetEntry(db, { draftId, datasetId, revision: null }, pointing)
    if (opened.status !== "saved") throw new Error("expected the first save to land")

    await catalogAction(post(token, { intent: "merge-term", termId: from, intoId: into }))

    // **This is what the merge rests on.** The editor is still holding the
    // description it read, which identifies a term that no longer exists; saving it
    // would put the merged value back and undo the merge in that one row.
    const stale = await saveDatasetEntry(
      db,
      { draftId, datasetId, revision: opened.revision },
      pointing,
    )
    expect(stale).toEqual({ status: "conflict" })
    expect(chosenIn(only(await db.select().from(s.draftDatasetEntry)).content)).toEqual([into])
  })

  /**
   * The merge read a row, combined it and wrote it back by id. A save committed in
   * between was written over with what the merge had read, and its revision
   * came out as the one the editor already held — so nothing refused the
   * editor's next save either.
   */
  it("merges a save that lands while it runs rather than writing over it", async () => {
    const token = await signIn(CURATOR, true)
    const { keyId, from, into } = await twoSpellings()
    const { id: researchId } = only(await db.insert(s.research).values({})
      .returning({ id: s.research.id }))
    const { id: datasetId } = only(await db.insert(s.dataset).values({ researchId })
      .returning({ id: s.dataset.id }))
    const { id: draftId } = only(await db.insert(s.researchDraft)
      .values({ researchId, content: emptyResearchContent(), shareToken: `share-${researchId}` })
      .returning({ id: s.researchDraft.id }))
    const pointing = {
      ...emptyDatasetContent(),
      values: [{ keyId, value: { kind: "vocabulary" as const, termIds: filled([from]) } }],
    }
    const opened = await saveDatasetEntry(db, { draftId, datasetId, revision: null }, pointing)
    if (opened.status !== "saved") throw new Error("expected the first save to land")

    // The editor's save, written and not yet committed: it adds a value.
    const edited = {
      ...pointing,
      values: [...pointing.values, { keyId: "note", value: { kind: "text" as const, text: { ja: filled([[{ text: "足した" }]]), en: filled([[{ text: "added" }]]) } } }],
    }
    let commit = (): void => undefined
    const committing = new Promise<void>((resolve) => {
      commit = resolve
    })
    let written = (): void => undefined
    const isWritten = new Promise<void>((resolve) => {
      written = resolve
    })
    const saving = db.transaction(async (tx) => {
      await tx.update(s.draftDatasetEntry)
        .set({ content: edited, revision: opened.revision + 1 })
        .where(eq(s.draftDatasetEntry.draftId, draftId))
      written()
      await committing
    })
    await isWritten
    const merging = catalogAction(post(token, { intent: "merge-term", termId: from, intoId: into }))
    await new Promise((resolve) => setTimeout(resolve, 200))
    commit()
    await saving
    await merging

    const entry = only(await db.select().from(s.draftDatasetEntry))
    expect(entry.content.values.map((one) => one.keyId)).toEqual([keyId, "note"])
    expect(chosenIn(entry.content)).toEqual([into])
    expect(entry.revision).toBe(opened.revision + 2)
  })

  it("leaves one identity where a description named both spellings", async () => {
    const token = await signIn(CURATOR, true)
    const { keyId, from, into } = await twoSpellings()
    const { id: researchId } = only(await db.insert(s.research).values({})
      .returning({ id: s.research.id }))
    const { id: datasetId } = only(await db.insert(s.dataset).values({ researchId })
      .returning({ id: s.dataset.id }))
    await seedVersion(db, {
      researchId,
      number: 1,
      datasets: [{
        datasetId,
        content: {
          ...emptyDatasetContent(),
          values: [{ keyId, value: { kind: "vocabulary", termIds: filled([from, into]) } }],
        },
      }],
    })

    await catalogAction(post(token, { intent: "merge-term", termId: from, intoId: into }))

    // Counted twice, the facet would report the dataset holds this value twice.
    expect(chosenIn(only(await db.select().from(s.researchVersion)).content)).toEqual([into])
  })

  it("refuses to merge across two vocabularies", async () => {
    const token = await signIn(CURATOR, true)
    const { from } = await twoSpellings()
    const elsewhere = await term(await vocabulary("platform"), "hiseq")

    expect(await catalogAction(post(token, {
      intent: "merge-term",
      termId: from,
      intoId: elsewhere,
    }))).toEqual({ status: "unknown-target" })
    expect(await db.select().from(s.vocabularyTerm)).toHaveLength(3)
  })

  it("refuses to merge a term of a settled vocabulary", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("sex")
    const from = await term(setId, "male")
    const into = await term(setId, "mixed")

    expect(await catalogAction(post(token, { intent: "merge-term", termId: from, intoId: into })))
      .toEqual({ status: "not-editable" })
  })

  it("refuses to merge a term into itself", async () => {
    const token = await signIn(CURATOR, true)
    const { from } = await twoSpellings()

    expect(await catalogAction(post(token, { intent: "merge-term", termId: from, intoId: from })))
      .toEqual({ status: "unknown-target" })
    expect(await db.select().from(s.vocabularyTerm)).toHaveLength(2)
  })
})

describe("what the terms screen opens on", () => {
  it("opens a settled vocabulary to be read, rather than responding with 404", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("sex")
    await term(setId, "male")
    await fieldFor("sex", setId)

    const view = await fieldTermsPage(get(token, "/admin/experiment-fields/sex"), "sex")
    expect(view?.terms.map((row) => row.code)).toEqual(["male"])
    // The screen reads it and offers nothing; the write paths refuse anyway.
    expect(view?.editable).toBe(false)
  })

  it("names the term a merge is aimed from, wherever it sits in the pages", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("assay")
    const aimed = await term(setId, "wgs")
    await fieldFor("assay", setId)

    const view = await fieldTermsPage(
      get(token, `/admin/experiment-fields/assay?mergeFrom=${aimed}`),
      "assay",
    )
    expect(view?.mergeFrom?.code).toBe("wgs")
  })

  it("names nothing when the address points at a term of another vocabulary", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("assay")
    await fieldFor("assay", setId)
    const elsewhere = await term(await vocabulary("platform"), "hiseq")

    const view = await fieldTermsPage(
      get(token, `/admin/experiment-fields/assay?mergeFrom=${elsewhere}`),
      "assay",
    )
    expect(view?.mergeFrom).toBeNull()
  })

  it("names nothing when the address has something that is not an id", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("assay")
    await fieldFor("assay", setId)

    const view = await fieldTermsPage(
      get(token, "/admin/experiment-fields/assay?mergeFrom=not-a-uuid"),
      "assay",
    )
    expect(view?.mergeFrom).toBeNull()
  })
})
