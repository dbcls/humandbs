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
 * change and what only a development change may: a type, an external
 * vocabulary, and anything the data already points at.
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

async function portalSet(code: string): Promise<string> {
  const { id } = only(await db.insert(s.vocabularySet)
    .values({ code, labelJa: code, labelEn: code, source: "portal" })
    .returning({ id: s.vocabularySet.id }))
  return id
}

async function term(setId: string, code: string, source: "portal" | "external"): Promise<string> {
  const { id } = only(await db.insert(s.vocabularyTerm)
    .values({ setId, code, labelEn: code, source })
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
    const setId = await portalSet("assay")
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
  it("refuses to change one that came from an external standard", async () => {
    const token = await signIn(CURATOR, true)
    const { id: setId } = only(await db.insert(s.vocabularySet)
      .values({ code: "icd10", labelJa: "ICD10", labelEn: "ICD10", source: "external", hierarchical: true })
      .returning({ id: s.vocabularySet.id }))
    const termId = await term(setId, "C34", "external")

    expect(await catalogAction(post(token, { intent: "update-term", termId, labelEn: "Lung" })))
      .toEqual({ status: "not-editable" })
    expect(await catalogAction(post(token, { intent: "delete-term", termId })))
      .toEqual({ status: "not-editable" })
    expect(await catalogAction(post(token, {
      intent: "create-term",
      setId,
      code: "C61",
      labelEn: "Prostate",
    }))).toEqual({ status: "not-editable" })
  })

  it("deactivates a term in use rather than letting it be deleted", async () => {
    const token = await signIn(CURATOR, true)
    const setId = await portalSet("assay")
    const termId = await term(setId, "wgs", "portal")
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
    const setId = await portalSet("assay")
    const termId = await term(setId, "wgs", "portal")
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
    const setId = await portalSet("assay")
    const termId = await term(setId, "wgs", "portal")
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
