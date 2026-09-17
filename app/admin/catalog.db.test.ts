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
 * already points at. Every vocabulary value is editable — ICD10 arrives as a
 * dictionary that seeds and checks the terms rather than as a vocabulary of its
 * own.
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

/** A published dataset carrying one value, so that "in use" means something. */
async function publishedValue(
  value: { keyId: string, termId?: string, asDisease?: boolean },
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
    .values({ kind: "hum", label: "hum0001", researchId, isPrimary: true })
  await db.insert(s.labelPin)
    .values({ kind: "dataset", label: "JGAD000001", datasetId, isPrimary: true })
  // "In use" is asked of the published rows, which is where a publish would
  // have put this value.
  await rebuildSearchDocs(db)
}

describe("who may read the catalog", () => {
  it("refuses somebody who is signed in but not an administrator", async () => {
    const token = await signIn(READER, false)

    const answer = await thrown(() => catalogPage(get(token, "/admin/experiment-fields")))
    expect(answer.status).toBe(403)
  })
})

describe("the keys an administrator may add", () => {
  it("adds a free-text key and puts it last", async () => {
    const token = await signIn(CURATOR, true)
    await freeTextKey("coverage")

    const result = await catalogAction(post(token, {
      intent: "create-key",
      code: "read-depth",
      scope: "experiment",
      labelJa: "深度",
      labelEn: "Read depth",
    }))

    expect(result).toEqual({ status: "ok" })
    const added = only(await db.select().from(s.contentKey).where(eq(s.contentKey.code, "read-depth")))
    expect(added.valueType).toBe("text")
    expect(added.position).toBe(1)
  })

  it("refuses a code that is the name of a field the search already owns", async () => {
    const token = await signIn(CURATOR, true)

    const result = await catalogAction(post(token, {
      intent: "create-key",
      code: "title",
      scope: "experiment",
      labelJa: "題目",
      labelEn: "Title",
    }))

    expect(result).toEqual({ status: "reserved-code" })
    expect(await db.select().from(s.contentKey)).toHaveLength(0)
  })

  it("refuses a code the catalog already holds rather than failing on the constraint", async () => {
    const token = await signIn(CURATOR, true)
    await freeTextKey("coverage")

    const result = await catalogAction(post(token, {
      intent: "create-key",
      code: "coverage",
      scope: "experiment",
      labelJa: "深度",
      labelEn: "Coverage",
    }))

    expect(result).toEqual({ status: "duplicate-code" })
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
      .toEqual({ status: "ok" })
    expect(await db.select().from(s.contentKey)).toHaveLength(0)
  })
})

describe("the terms of a vocabulary", () => {
  it("lets the label of an ICD10 term be corrected", async () => {
    const token = await signIn(CURATOR, true)
    const { id: setId } = only(await db.insert(s.vocabularySet)
      .values({ code: "icd10", labelJa: "ICD10", labelEn: "ICD10", hierarchical: true })
      .returning({ id: s.vocabularySet.id }))
    const termId = await term(setId, "C91")

    // The dictionary seeds the label; it never owns it. v1 filed C91 as
    // "Lymphoma" when the code is lymphoid leukaemia, and that has to be
    // fixable in place.
    expect(await catalogAction(post(token, {
      intent: "update-term",
      termId,
      labelEn: "Lymphoid leukaemia",
      labelJa: "リンパ性白血病",
    }))).toEqual({ status: "ok" })
    const held = only(await db.select().from(s.vocabularyTerm))
    expect(held.labelEn).toBe("Lymphoid leukaemia")
    expect(held.labelJa).toBe("リンパ性白血病")
  })

  it("refuses to delete a term in use, and keeps it for the data that names it", async () => {
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

    // Deleting it would leave a published disease pointing at nothing.
    expect(await catalogAction(post(token, { intent: "delete-term", termId })))
      .toEqual({ status: "in-use" })
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
    }))).toEqual({ status: "ok" })

    expect(only(await db.select().from(s.researchVersion)).content).toEqual(before)
    expect(only(await db.select().from(s.vocabularyTerm)).labelEn).toBe("Whole genome sequencing")
  })

  it("shows how many published objects carry a term", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("assay")
    const termId = await term(setId, "wgs")
    const { id: keyId } = only(await db.insert(s.contentKey)
      .values({ code: "assay", scope: "experiment", valueType: "vocabulary", labelJa: "手法", labelEn: "Assay", vocabularySetId: setId })
      .returning({ id: s.contentKey.id }))
    await publishedValue({ keyId, termId })
    // The search rows are what usage is counted from, and a catalog write is
    // what rebuilds them.
    await catalogAction(post(token, { intent: "update-term", termId, labelEn: "WGS" }))

    const view = await fieldTermsPage(get(token, "/admin/experiment-fields/assay"), "assay")
    expect(view?.terms.map((row) => row.used)).toEqual([2])
  })

  it("lists every term, whatever an address kept from before asks about their state", async () => {
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

  it("cuts the terms at the page size asked for, and at the default for any other", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("assay")
    await fieldFor("assay", setId)
    for (let at = 0; at < 21; at += 1) await term(setId, `t${String(at).padStart(2, "0")}`)
    const cut = async (search: string) => {
      const view = await fieldTermsPage(get(token, `/admin/experiment-fields/assay${search}`), "assay")
      return [view?.size, view?.terms.length, view?.pageCount, view?.rangeFrom, view?.rangeTo]
    }

    expect(await cut("")).toEqual([20, 20, 2, 1, 20])
    expect(await cut("?page=2")).toEqual([20, 1, 2, 21, 21])
    expect(await cut("?size=50")).toEqual([50, 21, 1, 1, 21])
    // Past the last page of a larger size is that last page, not an empty one.
    expect(await cut("?size=100&page=2")).toEqual([100, 21, 1, 1, 21])
    for (const asked of ["?size=21", "?size=0", "?size=-20", "?size=abc", "?size="]) {
      expect(await cut(asked), asked).toEqual([20, 20, 2, 1, 20])
    }
  })
})

describe("the ICD10 dictionary", () => {
  async function icd10(): Promise<string> {
    const { id } = only(await db.insert(s.vocabularySet)
      .values({ code: "icd10", labelJa: "ICD10", labelEn: "ICD10", hierarchical: true })
      .returning({ id: s.vocabularySet.id }))
    await db.insert(s.icd10Reference).values([
      { code: "C34", titleEn: "Malignant neoplasm of bronchus and lung", titleJa: "気管支及び肺の悪性新生物" },
      { code: "C349", titleEn: "Bronchus or lung, unspecified", titleJa: "気管支又は肺，部位不明" },
    ])
    return id
  }

  it("offers the codes it holds, and says which the vocabulary already has", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await icd10()
    await fieldFor("disease", setId)
    await term(setId, "C34")

    const view = await fieldTermsPage(
      get(token, "/admin/experiment-fields/disease?dictionary=bronchus"),
      "disease",
    )

    expect(view?.dictionary?.rows).toEqual([
      {
        code: "C34",
        titleEn: "Malignant neoplasm of bronchus and lung",
        titleJa: "気管支及び肺の悪性新生物",
        held: true,
      },
      {
        code: "C349",
        titleEn: "Bronchus or lung, unspecified",
        titleJa: "気管支又は肺，部位不明",
        held: false,
      },
    ])
  })

  it("is not offered on a vocabulary that is not ICD10", async () => {
    const token = await signIn(CURATOR, true)
    await fieldFor("assay", await vocabulary("assay"))

    const view = await fieldTermsPage(get(token, "/admin/experiment-fields/assay"), "assay")

    expect(view?.dictionary).toBeNull()
  })

  it("files a new four-character code under its root, making the root if it is missing", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await icd10()

    expect(await catalogAction(post(token, {
      intent: "create-term",
      setId,
      code: "C349",
      labelEn: "Bronchus or lung, unspecified",
      labelJa: "気管支又は肺，部位不明",
    }))).toEqual({ status: "ok" })

    // Without the root the four-character code would count as a root itself,
    // and "the disease facet is counted by three characters" would quietly stop
    // holding for it. The root is named from the dictionary, so nothing is
    // invented by making it.
    const terms = await db.select().from(s.vocabularyTerm)
    const root = terms.find((one) => one.code === "C34")
    const child = terms.find((one) => one.code === "C349")
    expect(root?.labelEn).toBe("Malignant neoplasm of bronchus and lung")
    expect(root?.labelJa).toBe("気管支及び肺の悪性新生物")
    expect(child?.parentId).toBe(root?.id)
  })

  it("hangs a new code under the root that is already there rather than a second one", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await icd10()
    const rootId = await term(setId, "C34")

    await catalogAction(post(token, { intent: "create-term", setId, code: "C349", labelEn: "x" }))

    const terms = await db.select().from(s.vocabularyTerm)
    expect(terms).toHaveLength(2)
    expect(terms.find((one) => one.code === "C349")?.parentId).toBe(rootId)
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
    // The name of the screen counts every field, not the ones left standing.
    expect(view.total).toBe(3)
    // The type axis is counted with its own condition lifted, so all three.
    expect(view.counts.types).toEqual({ text: 1, vocabulary: 1, number: 1, disease: 0 })
  })

  it("drops a condition the address carries that names nothing", async () => {
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

describe("folding one term into another", () => {
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
      .toEqual({ status: "ok" })

    const version = only(await db.select().from(s.researchVersion))
    expect(chosenIn(version.content)).toEqual([into])
    // The folded term is gone, which is what makes this different from
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

  it("refuses the save of an editor who was holding the row when it was folded", async () => {
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
    // description it read, which names a term that no longer exists; saving it
    // would put the folded value back and undo the merge in that one row.
    const stale = await saveDatasetEntry(
      db,
      { draftId, datasetId, revision: opened.revision },
      pointing,
    )
    expect(stale).toEqual({ status: "conflict" })
    expect(chosenIn(only(await db.select().from(s.draftDatasetEntry)).content)).toEqual([into])
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

    // Counted twice, the facet would say the dataset holds this value twice.
    expect(chosenIn(only(await db.select().from(s.researchVersion)).content)).toEqual([into])
  })

  it("refuses to fold across two vocabularies", async () => {
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

  it("refuses to fold a term of a settled vocabulary", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("sex")
    const from = await term(setId, "male")
    const into = await term(setId, "mixed")

    expect(await catalogAction(post(token, { intent: "merge-term", termId: from, intoId: into })))
      .toEqual({ status: "not-editable" })
  })

  it("refuses to fold a term into itself", async () => {
    const token = await signIn(CURATOR, true)
    const { from } = await twoSpellings()

    expect(await catalogAction(post(token, { intent: "merge-term", termId: from, intoId: from })))
      .toEqual({ status: "unknown-target" })
    expect(await db.select().from(s.vocabularyTerm)).toHaveLength(2)
  })
})

describe("what the terms screen opens on", () => {
  it("opens a settled vocabulary to be read, rather than answering 404", async () => {
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

  it("names nothing when the address carries something that is not an id", async () => {
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
