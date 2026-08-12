import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { grantAdmin } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { createSession, sessionCookie } from "~/auth/session.server"
import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { catalogAction, catalogPage, vocabularyPage } from "./catalog.server"

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
  return new Request("http://localhost:8080/admin/catalog", {
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

/** A published dataset carrying one value, so that "in use" means something. */
async function publishedValue(value: { keyId: string, termId?: string }): Promise<void> {
  const { id: researchId } = only(await db.insert(s.research).values({})
    .returning({ id: s.research.id }))
  const { id: datasetId } = only(await db.insert(s.dataset).values({ researchId })
    .returning({ id: s.dataset.id }))
  await db.insert(s.datasetContent).values({
    datasetId,
    content: {
      ...emptyDatasetContent(),
      experiments: [{
        id: "experiment-1",
        label: filled("WGS"),
        values: [{
          keyId: value.keyId,
          value: value.termId === undefined
            ? { kind: "text", text: { ja: filled([[{ text: "x" }]]), en: filled([]) } }
            : { kind: "vocabulary", termIds: filled([value.termId]) },
        }],
      }],
    },
  })
  const { id: snapshotId } = only(await db.insert(s.contentSnapshot)
    .values({ researchId, content: { ...emptyResearchContent(), datasetIds: [datasetId] } })
    .returning({ id: s.contentSnapshot.id }))
  await db.insert(s.researchVersion)
    .values({ researchId, number: 1, snapshotId, releaseDate: "2020-01-01" })
  await db.insert(s.labelPin)
    .values({ kind: "hum", label: "hum0001", researchId, isPrimary: true })
  await db.insert(s.labelPin)
    .values({ kind: "dataset", label: "JGAD000001", datasetId, isPrimary: true })
}

describe("who may read the catalog", () => {
  it("refuses somebody who is signed in but not an administrator", async () => {
    const token = await signIn(READER, false)

    const answer = await thrown(() => catalogPage(get(token, "/admin/catalog")))
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

  it("deactivates a term in use rather than letting it be deleted", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("assay")
    const termId = await term(setId, "wgs")
    const { id: keyId } = only(await db.insert(s.contentKey)
      .values({ code: "assay", scope: "experiment", valueType: "vocabulary", labelJa: "手法", labelEn: "Assay", vocabularySetId: setId })
      .returning({ id: s.contentKey.id }))
    await publishedValue({ keyId, termId })

    expect(await catalogAction(post(token, { intent: "delete-term", termId })))
      .toEqual({ status: "in-use" })
    expect(await catalogAction(post(token, { intent: "set-term-active", termId, active: "false" })))
      .toEqual({ status: "ok" })

    // Deactivated, and still resolvable for the data that names it.
    const held = only(await db.select().from(s.vocabularyTerm))
    expect(held.active).toBe(false)
  })

  it("renames a term without touching what points at it", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await vocabulary("assay")
    const termId = await term(setId, "wgs")
    const { id: keyId } = only(await db.insert(s.contentKey)
      .values({ code: "assay", scope: "experiment", valueType: "vocabulary", labelJa: "手法", labelEn: "Assay", vocabularySetId: setId })
      .returning({ id: s.contentKey.id }))
    await publishedValue({ keyId, termId })
    const before = only(await db.select().from(s.datasetContent)).content

    expect(await catalogAction(post(token, {
      intent: "update-term",
      termId,
      labelEn: "Whole genome sequencing",
      labelJa: "全ゲノムシークエンス",
    }))).toEqual({ status: "ok" })

    expect(only(await db.select().from(s.datasetContent)).content).toEqual(before)
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

    const view = await vocabularyPage(get(token, "/admin/catalog/vocabulary/assay"), "assay")
    expect(view?.terms.map((row) => row.used)).toEqual([2])
  })
})

describe("changing what a key shows", () => {
  it("rebuilds the search rows, so hiding a key takes its words out of the index", async () => {
    const token = await signIn(CURATOR, true)
    const keyId = await freeTextKey("internal-note")
    await db.update(s.contentKey).set({ showOnPublicPage: true }).where(eq(s.contentKey.id, keyId))
    await publishedValue({ keyId })
    await catalogAction(post(token, {
      intent: "update-key",
      keyId,
      labelJa: "メモ",
      labelEn: "Note",
      showOnPublicPage: "on",
    }))
    const shown = await db.select({ textJa: s.searchDoc.textJa }).from(s.searchDoc)
    expect(shown.some((row) => row.textJa.includes("x"))).toBe(true)

    await catalogAction(post(token, {
      intent: "update-key",
      keyId,
      labelJa: "メモ",
      labelEn: "Note",
    }))

    const hidden = await db.select({ textJa: s.searchDoc.textJa }).from(s.searchDoc)
    expect(hidden.every((row) => !row.textJa.includes("x"))).toBe(true)
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
    await term(setId, "C34")

    const view = await vocabularyPage(
      get(token, "/admin/catalog/vocabulary/icd10?dictionary=bronchus"),
      "icd10",
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
    await vocabulary("assay")

    const view = await vocabularyPage(get(token, "/admin/catalog/vocabulary/assay"), "assay")

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
