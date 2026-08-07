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
  draftEditorPage,
  researchDetailAction,
  researchDetailPage,
  researchListPage,
  saveDraftAction,
} from "./pages.server"
import { readDraft } from "./queries.server"

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

function postForm(token: string, path: string, fields: Record<string, string>): Request {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" })
  headers.set("cookie", sessionCookie(token).split(";")[0] ?? "")
  return new Request(`http://localhost:8080${path}`, {
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
