import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { grantAdmin } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { createSession, sessionCookie } from "~/auth/session.server"
import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { createResearchWithDraft, saveDraftContent } from "./drafts.server"
import { researchContentInput, type DraftInput } from "./form"
import {
  createResearchAction,
  datasetEditorPage,
  draftDatasetListAction,
  draftDatasetListPage,
  draftEditorPage,
  presenceAction,
  publishAction,
  researchDetailAction,
  researchDetailPage,
  researchListPage,
  saveDatasetAction,
  saveDraftAction,
  undoSnapshotLoader,
} from "./pages.server"
import { readDraft, readUndoStack } from "./queries.server"

/**
 * The management screens with their guards on, against the development
 * database.
 *
 * These are the wiring: the parts are tested on their own, and what can still
 * break is a screen that reads unpublished content without asking for the
 * capability, or a save that writes something the author never sent.
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

function postJson(token: string, path: string, payload: unknown): Request {
  const headers = new Headers({ "content-type": "application/json" })
  headers.set("cookie", sessionCookie(token).split(";")[0] ?? "")
  return new Request(`http://localhost:8080${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })
}

function postForm(
  token: string,
  path: string,
  fields: Record<string, string>,
  fileNames: string[] = [],
): Request {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" })
  headers.set("cookie", sessionCookie(token).split(";")[0] ?? "")
  const body = new URLSearchParams(fields)
  for (const name of fileNames) body.append("fileName", name)
  return new Request(`http://localhost:8080${path}`, {
    method: "POST",
    headers,
    body: body.toString(),
  })
}

async function thrown(work: () => Promise<unknown>): Promise<Response> {
  const result = await work().then(() => null, (error: unknown) => error)
  if (!(result instanceof Response)) throw new Error("expected a Response to be thrown")
  return result
}

function payloadOf(revision: number, input: DraftInput) {
  return { revision, note: input.note, content: input.content }
}

const draftInput = (): DraftInput => ({
  note: "",
  content: researchContentInput(emptyResearchContent()),
})

describe("who may open the management screens", () => {
  it("sends somebody who is not signed in to sign in", async () => {
    const response = await thrown(() => researchListPage(get(null, "/admin/research"), "ja"))

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("/auth/login?redirect=%2Fadmin%2Fresearch")
  })

  it("refuses somebody signed in without the capability, rather than asking again", async () => {
    const token = await signIn(READER, false)
    const { researchId, draftId } = await createResearchWithDraft(db)

    expect((await thrown(() => researchListPage(get(token, "/admin/research"), "ja"))).status)
      .toBe(403)
    expect((await thrown(() =>
      researchDetailPage(get(token, "/x"), "ja", researchId))).status).toBe(403)
    expect((await thrown(() =>
      draftEditorPage(get(token, "/x"), "ja", { researchId, draftId }))).status).toBe(403)
  })

  it("refuses a save from somebody signed in without the capability", async () => {
    const token = await signIn(READER, false)
    const { researchId, draftId } = await createResearchWithDraft(db)

    const response = await thrown(() => saveDraftAction(
      postJson(token, "/x", payloadOf(1, draftInput())),
      { researchId, draftId },
    ))

    expect(response.status).toBe(403)
    expect((await readDraft(db, draftId))?.revision).toBe(1)
  })
})

describe("the listing", () => {
  it("shows a research that has never been published, which no public path does", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)

    const view = await researchListPage(get(token, "/admin/research"), "ja")

    expect(view.rows.map((row) => row.researchId)).toEqual([researchId])
    expect(view.rows[0]?.status).toBe("unpublished")
    expect(view.rows[0]?.flags.noHumLabel).toBe(true)
  })

  it("reads what a research is missing from the draft somebody is working on", async () => {
    const token = await signIn(CURATOR, true)
    const { draftId } = await createResearchWithDraft(db)
    await saveDraftContent(db, { draftId, revision: 1 }, {
      note: "",
      content: { ...emptyResearchContent(), title: { ja: filled("題目"), en: filled("") } },
    })

    const view = await researchListPage(get(token, "/admin/research"), "ja")

    expect(view.rows[0]?.flags.untranslated).toBe(true)
    expect(view.rows[0]?.title).toBe("題目")
  })

  it("narrows to what was typed into the box", async () => {
    const token = await signIn(CURATOR, true)
    const { draftId } = await createResearchWithDraft(db)
    await createResearchWithDraft(db)
    await saveDraftContent(db, { draftId, revision: 1 }, {
      note: "",
      content: { ...emptyResearchContent(), title: { ja: filled("糖尿病"), en: filled("") } },
    })

    expect((await researchListPage(get(token, "/admin/research?q=糖尿病"), "ja")).rows)
      .toHaveLength(1)
    expect((await researchListPage(get(token, "/admin/research?q=肝臓"), "ja")).rows)
      .toHaveLength(0)
  })
})

describe("opening a draft", () => {
  it("answers a draft reached under a different research as one that is not there", async () => {
    const token = await signIn(CURATOR, true)
    const { draftId } = await createResearchWithDraft(db)
    const other = await createResearchWithDraft(db)

    const response = await thrown(() =>
      draftEditorPage(get(token, "/x"), "ja", { researchId: other.researchId, draftId }))

    expect(response.status).toBe(404)
  })

  it("answers an address that cannot name a row the same way", async () => {
    const token = await signIn(CURATOR, true)

    expect((await thrown(() =>
      researchDetailPage(get(token, "/x"), "ja", "hum0001"))).status).toBe(404)
  })

  it("offers only the datasets of that research", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    const mine = only(await db.insert(s.dataset).values({ researchId })
      .returning({ id: s.dataset.id }))
    const other = await createResearchWithDraft(db)
    await db.insert(s.dataset).values({ researchId: other.researchId })

    const view = await draftEditorPage(get(token, "/x"), "ja", { researchId, draftId })

    expect(view.datasets.map((row) => row.id)).toEqual([mine.id])
  })
})

describe("saving a draft", () => {
  it("writes what was sent and moves the revision on", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    const input = draftInput()
    input.content.title.ja = { state: "value", text: "書いたもの" }

    const result = await saveDraftAction(
      postJson(token, "/x", payloadOf(1, input)),
      { researchId, draftId },
    )

    expect(result).toEqual({ status: "saved", revision: 2 })
    expect((await readDraft(db, draftId))?.content.title.ja).toEqual(filled("書いたもの"))
  })

  it("hands back what the draft holds now when the revision no longer matches", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    const theirs = draftInput()
    theirs.content.title.ja = { state: "value", text: "theirs" }
    await saveDraftAction(postJson(token, "/x", payloadOf(1, theirs)), { researchId, draftId })

    const mine = draftInput()
    mine.content.title.ja = { state: "value", text: "mine" }
    const result = await saveDraftAction(
      postJson(token, "/x", payloadOf(1, mine)),
      { researchId, draftId },
    )

    expect(result.status).toBe("conflict")
    if (result.status !== "conflict") return
    expect(result.revision).toBe(2)
    expect(result.current.content.title.ja.text).toBe("theirs")
    expect((await readDraft(db, draftId))?.content.title.ja).toEqual(filled("theirs"))
  })

  it("writes nothing at all when prose holds markup the tree cannot keep", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    const input = draftInput()
    input.content.title.ja = { state: "value", text: "この題目は保存されない" }
    input.content.summary.aims.en = { state: "value", text: "# a heading" }

    const result = await saveDraftAction(
      postJson(token, "/x", payloadOf(1, input)),
      { researchId, draftId },
    )

    expect(result.status).toBe("invalid")
    if (result.status !== "invalid") return
    expect(result.problems).toEqual([{ path: "summary.aims.en", syntax: "heading", line: 1 }])
    const draft = await readDraft(db, draftId)
    expect(draft?.revision).toBe(1)
    expect(draft?.content).toEqual(emptyResearchContent())
  })

  it("refuses a version that lists a dataset belonging to another research", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    const other = await createResearchWithDraft(db)
    const stranger = only(await db.insert(s.dataset).values({ researchId: other.researchId })
      .returning({ id: s.dataset.id }))
    await db.insert(s.datasetContent)
      .values({ datasetId: stranger.id, content: emptyDatasetContent() })
    const input = draftInput()
    input.content.datasetIds = [stranger.id]

    const response = await thrown(() => saveDraftAction(
      postJson(token, "/x", payloadOf(1, input)),
      { researchId, draftId },
    ))

    expect(response.status).toBe(400)
    expect((await readDraft(db, draftId))?.revision).toBe(1)
  })

  it("refuses a payload that is not the shape the editor sends", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)

    const response = await thrown(() => saveDraftAction(
      postJson(token, "/x", { revision: 1, note: "", content: { title: "just a string" } }),
      { researchId, draftId },
    ))

    expect(response.status).toBe(400)
  })
})

describe("the research screen's forms", () => {
  it("opens a new research and sends the browser to the draft it was given", async () => {
    const token = await signIn(CURATOR, true)

    const response = await createResearchAction(postForm(token, "/admin/research", {}), "en")

    expect(response.status).toBe(302)
    expect(response.headers.get("location"))
      .toMatch(/^\/en\/admin\/research\/[0-9a-f-]{36}\/draft\/[0-9a-f-]{36}$/)
  })

  it("opens a draft of an existing research and sends the browser to it", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)

    const response = await researchDetailAction(
      postForm(token, "/x", { intent: "create-draft" }),
      "ja",
      researchId,
    )

    expect(response).toBeInstanceOf(Response)
    expect(await db.select().from(s.researchDraft)).toHaveLength(2)
  })

  it("discards a draft and comes back to the research", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)

    const response = await researchDetailAction(
      postForm(token, "/x", { intent: "discard-draft", draftId, revision: "1" }),
      "ja",
      researchId,
    )

    expect(response).toBeInstanceOf(Response)
    if (!(response instanceof Response)) return
    expect(response.headers.get("location")).toBe(`/admin/research/${researchId}`)
    expect(await readDraft(db, draftId)).toBeNull()
  })

  it("does not discard a draft somebody has edited since the screen was drawn", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    await saveDraftContent(db, { draftId, revision: 1 }, {
      note: "",
      content: emptyResearchContent(),
    })

    const result = await researchDetailAction(
      postForm(token, "/x", { intent: "discard-draft", draftId, revision: "1" }),
      "ja",
      researchId,
    )

    expect(result).toEqual({ status: "conflict" })
    expect(await readDraft(db, draftId)).not.toBeNull()
  })

  it("does not discard a draft of another research", async () => {
    const token = await signIn(CURATOR, true)
    const { draftId } = await createResearchWithDraft(db)
    const other = await createResearchWithDraft(db)

    const response = await thrown(() => researchDetailAction(
      postForm(token, "/x", { intent: "discard-draft", draftId, revision: "1" }),
      "ja",
      other.researchId,
    ))

    expect(response.status).toBe(404)
    expect(await readDraft(db, draftId)).not.toBeNull()
  })
})

describe("the dataset screens of a draft", () => {
  async function seedCatalog(): Promise<{ textKey: string, vocabKey: string, terms: string[] }> {
    const set = only(await db.insert(s.vocabularySet)
      .values({ code: "access", labelJa: "アクセス制限", labelEn: "Access", source: "portal" })
      .returning({ id: s.vocabularySet.id }))
    const terms = await db.insert(s.vocabularyTerm).values([
      { setId: set.id, code: "open", labelEn: "Unrestricted", source: "portal" },
      { setId: set.id, code: "closed", labelEn: "Controlled", source: "portal" },
    ]).returning({ id: s.vocabularyTerm.id })
    const keys = await db.insert(s.contentKey).values([
      {
        code: "type-of-data",
        scope: "dataset",
        valueType: "text",
        labelJa: "データの種類",
        labelEn: "Type of data",
      },
      {
        code: "access-criteria",
        scope: "dataset",
        valueType: "vocabulary",
        labelJa: "アクセス制限",
        labelEn: "Access type",
        vocabularySetId: set.id,
      },
      {
        code: "coverage",
        scope: "experiment",
        valueType: "text",
        labelJa: "深度",
        labelEn: "Coverage",
      },
    ]).returning({ id: s.contentKey.id, code: s.contentKey.code })

    const byCode = new Map(keys.map((key) => [key.code, key.id]))
    return {
      textKey: byCode.get("type-of-data") ?? "",
      vocabKey: byCode.get("access-criteria") ?? "",
      terms: terms.map((term) => term.id),
    }
  }

  async function datasetOf(researchId: string, published = false): Promise<string> {
    const row = only(await db.insert(s.dataset).values({ researchId })
      .returning({ id: s.dataset.id }))
    if (published) {
      await db.insert(s.datasetContent).values({
        datasetId: row.id,
        content: { ...emptyDatasetContent(), releaseDate: "2024-03-01" },
      })
    }
    return row.id
  }

  function datasetPayload(revision: number | null, values: unknown[] = [], experiments: unknown[] = []) {
    return {
      revision,
      content: { releaseDate: "", fileSelection: [], values, experiments },
    }
  }

  function textValue(keyId: string, ja: string) {
    return {
      keyId,
      value: {
        kind: "text",
        text: { ja: { state: "value", text: ja }, en: { state: "value", text: "" } },
      },
    }
  }

  it("refuses the editor and the save from somebody without the capability", async () => {
    const token = await signIn(READER, false)
    const { researchId, draftId } = await createResearchWithDraft(db)
    const datasetId = await datasetOf(researchId)
    const params = { researchId, draftId, datasetId }

    expect((await thrown(() => datasetEditorPage(get(token, "/x"), "ja", params))).status).toBe(403)
    expect((await thrown(() =>
      saveDatasetAction(postJson(token, "/x", datasetPayload(null)), params))).status).toBe(403)
  })

  it("shows the published description until the draft has written one of its own", async () => {
    const token = await signIn(CURATOR, true)
    await seedCatalog()
    const { researchId, draftId } = await createResearchWithDraft(db)
    const datasetId = await datasetOf(researchId, true)
    const params = { researchId, draftId, datasetId }

    const before = await datasetEditorPage(get(token, "/x"), "ja", params)
    expect(before.revision).toBeNull()
    expect(before.input.releaseDate).toBe("2024-03-01")

    await saveDatasetAction(postJson(token, "/x", datasetPayload(null)), params)

    const after = await datasetEditorPage(get(token, "/x"), "ja", params)
    expect(after.revision).toBe(1)
    expect(after.input.releaseDate).toBe("")
  })

  it("refuses a dataset of another research as a dataset of this draft", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    const other = await createResearchWithDraft(db)
    const datasetId = await datasetOf(other.researchId)

    expect((await thrown(() =>
      datasetEditorPage(get(token, "/x"), "ja", { researchId, draftId, datasetId }))).status)
      .toBe(404)
  })

  it("refuses a value the catalog would not recognise, rather than storing it", async () => {
    const token = await signIn(CURATOR, true)
    const catalog = await seedCatalog()
    const { researchId, draftId } = await createResearchWithDraft(db)
    const datasetId = await datasetOf(researchId)
    const params = { researchId, draftId, datasetId }
    const refused = async (payload: unknown) =>
      (await thrown(() => saveDatasetAction(postJson(token, "/x", payload), params))).status

    // A key nobody has heard of.
    expect(await refused(datasetPayload(null, [
      textValue("00000000-0000-0000-0000-0000000000ff", "値"),
    ]))).toBe(400)
    // A key of the experiment level used at the dataset level.
    expect(await refused(datasetPayload(null, [], [
      { id: "exp-1", label: { state: "value", text: "" }, values: [textValue(catalog.textKey, "値")] },
    ]))).toBe(400)
    // A kind that disagrees with the key's type.
    expect(await refused(datasetPayload(null, [
      { keyId: catalog.vocabKey, value: { kind: "text", text: { ja: { state: "value", text: "x" }, en: { state: "value", text: "" } } } },
    ]))).toBe(400)
    // Two terms under a key that takes one.
    expect(await refused(datasetPayload(null, [
      { keyId: catalog.vocabKey, value: { kind: "vocabulary", state: "value", termIds: catalog.terms } },
    ]))).toBe(400)

    expect(await db.select().from(s.draftDatasetEntry)).toHaveLength(0)
  })

  it("answers refused markup with the field it was written in, and writes nothing", async () => {
    const token = await signIn(CURATOR, true)
    const catalog = await seedCatalog()
    const { researchId, draftId } = await createResearchWithDraft(db)
    const datasetId = await datasetOf(researchId)
    const params = { researchId, draftId, datasetId }

    const result = await saveDatasetAction(
      postJson(token, "/x", datasetPayload(null, [textValue(catalog.textKey, "# 見出し")])),
      params,
    )

    expect(result.status).toBe("invalid")
    expect(await db.select().from(s.draftDatasetEntry)).toHaveLength(0)
  })

  it("answers a stale save with what the entry holds now, and leaves it alone", async () => {
    const token = await signIn(CURATOR, true)
    const catalog = await seedCatalog()
    const { researchId, draftId } = await createResearchWithDraft(db)
    const datasetId = await datasetOf(researchId)
    const params = { researchId, draftId, datasetId }

    await saveDatasetAction(postJson(token, "/x", datasetPayload(null, [textValue(catalog.textKey, "theirs")])), params)
    const result = await saveDatasetAction(
      postJson(token, "/x", datasetPayload(null, [textValue(catalog.textKey, "mine")])),
      params,
    )

    expect(result.status).toBe("conflict")
    if (result.status !== "conflict") return
    expect(result.revision).toBe(1)
    const theirs = result.current.values[0]?.value
    expect(theirs?.kind === "text" && theirs.text.ja.text).toBe("theirs")
  })

  it("lists a dataset it creates, and refuses to destroy one that is published", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    const params = { researchId, draftId }

    const created = await draftDatasetListAction(
      postForm(token, "/x", { intent: "create-dataset", revision: "1" }),
      "ja",
      params,
    )
    expect(created).toBeInstanceOf(Response)

    const view = await draftDatasetListPage(get(token, "/x"), "ja", params)
    expect(view.rows).toHaveLength(1)
    expect(view.rows[0]?.listed).toBe(true)
    expect(view.rows[0]?.isOwn).toBe(true)

    const datasetId = view.rows[0]?.id ?? ""
    await db.insert(s.datasetContent).values({ datasetId, content: emptyDatasetContent() })
    expect(await draftDatasetListAction(
      postForm(token, "/x", { intent: "delete-dataset", datasetId, revision: String(view.revision) }),
      "ja",
      params,
    )).toEqual({ status: "refused" })
  })

  it("records who is editing and answers with everybody, marking the one who asked", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)

    const answer = await presenceAction(postForm(token, "/x", {}), { researchId, draftId })

    expect(answer.present).toEqual([{ name: "curator", isSelf: true }])
    expect(await db.select().from(s.draftPresence)).toHaveLength(1)
  })

  it("hands over an undo entry without writing anything back", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    await saveDraftContent(db, { draftId, revision: 1 }, {
      note: "before",
      content: emptyResearchContent(),
    })
    const stack = await readUndoStack(db, draftId)
    const undoId = stack[0]?.id ?? ""

    const snapshot = await undoSnapshotLoader(get(token, "/x"), { researchId, draftId, undoId })

    expect(snapshot.reason).toBe("before-save")
    expect((await readDraft(db, draftId))?.note).toBe("before")
    expect(await readUndoStack(db, draftId)).toHaveLength(1)
  })
})

describe("making the files a version needs public", () => {
  it("queues them from the publish screen without publishing the version", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)

    const answer = await publishAction(
      postForm(token, "/x", { intent: "publish-files" }, ["a.zip", "b.zip"]),
      "ja",
      { researchId, draftId },
    )

    expect(answer).toBeInstanceOf(Response)
    const queued = await db.select().from(s.filePublishJob)
    expect(queued.map((row) => row.fileName).toSorted()).toEqual(["a.zip", "b.zip"])
    expect(queued.every((row) => row.action === "publish")).toBe(true)
    expect(await db.select().from(s.researchVersion)).toHaveLength(0)
  })

  it("is refused to somebody who may edit but not manage files", async () => {
    const token = await signIn(READER, false)
    const { researchId, draftId } = await createResearchWithDraft(db)

    const refusal = await thrown(() => publishAction(
      postForm(token, "/x", { intent: "publish-files" }, ["a.zip"]),
      "ja",
      { researchId, draftId },
    ))

    expect(refusal.status).toBe(403)
    expect(await db.select().from(s.filePublishJob)).toHaveLength(0)
  })
})
