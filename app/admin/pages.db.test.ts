import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { grantAdmin } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { createSession, sessionCookie } from "~/auth/session.server"
import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { seedDataset, seedVersion } from "~/db/seed"

import {
  createDatasetInDraft,
  createEmptyDraft,
  createResearchWithDraft,
  saveDraftContent,
} from "./drafts.server"
import { researchContentInput, type DraftInput } from "./form"
import {
  createResearchAction,
  datasetEditorPage,
  datasetLabelAction,
  draftDatasetListAction,
  draftDatasetListPage,
  draftEditorPage,
  publishAction,
  publishPage,
  researchDetailAction,
  researchDetailPage,
  researchListPage,
  saveDatasetAction,
  saveDraftAction,
  versionDatasetListPage,
} from "./pages.server"
import { pinLabel } from "./labels.server"
import { readDraft } from "./queries.server"
import { fieldText } from "~/public/view.server"

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
  return { revision, content: input.content }
}

const draftInput = (): DraftInput => ({
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
  })

  it("names a research that has never been out by its draft", async () => {
    const token = await signIn(CURATOR, true)
    const { draftId } = await createResearchWithDraft(db)
    await saveDraftContent(db, { draftId, revision: 1 }, {
      content: { ...emptyResearchContent(), title: { ja: filled("題目"), en: filled("") } },
    })

    const view = await researchListPage(get(token, "/admin/research"), "ja")

    expect(view.rows[0]?.title).toBe("題目")
  })

  it("names a published research by its latest version while its draft is still empty", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    await seedVersion(db, { researchId, number: 1, body: { title: { ja: filled("最初の題目"), en: filled("") } } })
    await seedVersion(db, { researchId, number: 2, body: { title: { ja: filled("いまの題目"), en: filled("") } } })

    const view = await researchListPage(get(token, "/admin/research"), "ja")

    expect(only(view.rows).title).toBe("いまの題目")
    expect(only(view.rows).draftCount).toBe(1)
  })

  it("keeps naming by the version when the draft carries a title of its own", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    await seedVersion(db, { researchId, number: 1, body: { title: { ja: filled("公開の題目"), en: filled("") } } })
    await saveDraftContent(db, { draftId, revision: 1 }, {
      content: { ...emptyResearchContent(), title: { ja: filled("下書きの題目"), en: filled("") } },
    })

    const view = await researchListPage(get(token, "/admin/research"), "ja")

    expect(only(view.rows).title).toBe("公開の題目")
  })

  it("matches the box against the title the row shows, not against a draft's", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    await seedVersion(db, { researchId, number: 1, body: { title: { ja: filled("公開の題目"), en: filled("") } } })
    await saveDraftContent(db, { draftId, revision: 1 }, {
      content: { ...emptyResearchContent(), title: { ja: filled("下書きの題目"), en: filled("") } },
    })

    expect((await researchListPage(get(token, "/admin/research?q=公開の題目"), "ja")).rows)
      .toHaveLength(1)
    expect((await researchListPage(get(token, "/admin/research?q=下書きの題目"), "ja")).rows)
      .toHaveLength(0)
  })

  it("says which datasets a reader can open: the ones with a search row, in label order", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    await pinHum(researchId, "hum0001")
    const out = only(await db.insert(s.dataset).values({ researchId }).returning({ id: s.dataset.id }))
    const held = only(await db.insert(s.dataset).values({ researchId }).returning({ id: s.dataset.id }))
    await pinDataset(out.id, "JGAD000002")
    await pinDataset(held.id, "JGAD000001")
    await db.insert(s.searchDoc).values({
      targetType: "dataset",
      targetId: out.id,
      researchId,
      humLabel: "hum0001",
      datasetLabel: "JGAD000002",
      content: emptyDatasetContent(),
      title: "",
      textJa: "",
      textEn: "",
    })

    const row = only((await researchListPage(get(token, "/admin/research"), "ja")).rows)

    expect(row.datasets).toEqual([
      { label: "JGAD000001", published: false },
      { label: "JGAD000002", published: true },
    ])
  })

  it("narrows to what was typed into the box", async () => {
    const token = await signIn(CURATOR, true)
    const { draftId } = await createResearchWithDraft(db)
    await createResearchWithDraft(db)
    await saveDraftContent(db, { draftId, revision: 1 }, {
      content: { ...emptyResearchContent(), title: { ja: filled("糖尿病"), en: filled("") } },
    })

    expect((await researchListPage(get(token, "/admin/research?q=糖尿病"), "ja")).rows)
      .toHaveLength(1)
    expect((await researchListPage(get(token, "/admin/research?q=肝臓"), "ja")).rows)
      .toHaveLength(0)
  })

  it("counts an axis with that axis's own condition lifted, and the others still on", async () => {
    const token = await signIn(CURATOR, true)
    const { draftId } = await createResearchWithDraft(db)
    await createResearchWithDraft(db)
    await saveDraftContent(db, { draftId, revision: 1 }, {
      content: { ...emptyResearchContent(), title: { ja: filled("糖尿病"), en: filled("") } },
    })

    // Nothing here is published, so narrowing to what is leaves no rows — and
    // the status axis still has to say what the other value would give.
    const view = await researchListPage(get(token, "/admin/research?status=published"), "ja")

    expect(view.rows).toHaveLength(0)
    expect(view.counts.statuses).toEqual({ published: 0, unpublished: 2 })

    // With the word in force, the status is counted within it.
    const narrowed = await researchListPage(get(token, "/admin/research?q=糖尿病"), "ja")

    expect(narrowed.counts.statuses).toEqual({ published: 0, unpublished: 1 })
  })

  async function pinHum(researchId: string, label: string): Promise<void> {
    await db.insert(s.labelPin).values({ kind: "hum", label, researchId, isPrimary: true })
  }

  async function pinDataset(datasetId: string, label: string): Promise<void> {
    await db.insert(s.labelPin).values({ kind: "dataset", label, datasetId, isPrimary: true })
  }

  it("reads an address that still asks for a shortcoming as asking for nothing", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    await db.insert(s.dataset).values({ researchId })

    const view = await researchListPage(get(token, "/admin/research?flag=noHumLabel&flag=noDatasetLabel"), "ja")

    expect(view.rows.map((row) => row.researchId)).toEqual([researchId])
    expect(Object.keys(view.counts)).toEqual(["statuses"])
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

  it("writes prose holding markup the tree cannot keep as the characters typed", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    const input = draftInput()
    input.content.title.ja = { state: "value", text: "この題目は保存される" }
    input.content.summary.aims.en = { state: "value", text: "# a heading" }

    const result = await saveDraftAction(
      postJson(token, "/x", payloadOf(1, input)),
      { researchId, draftId },
    )

    expect(result.status).toBe("saved")
    const draft = await readDraft(db, draftId)
    expect(draft?.content.title.ja).toEqual(filled("この題目は保存される"))
    expect(draft?.content.summary.aims.en).toEqual({ state: "value", value: [[{ text: "# a heading" }]] })
  })

  it("refuses a version that lists a dataset belonging to another research", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    const other = await createResearchWithDraft(db)
    const stranger = only(await db.insert(s.dataset).values({ researchId: other.researchId })
      .returning({ id: s.dataset.id }))
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
  it("opens a new research and sends the browser to the research itself, not into its draft", async () => {
    const token = await signIn(CURATOR, true)

    // The language is passed in and makes no difference: the management area
    // has one address and it carries no prefix (`public/urls.ts` の `href`).
    const response = await createResearchAction(postForm(token, "/admin/research", {}), "en")

    expect(response.status).toBe(302)
    const location = response.headers.get("location") ?? ""
    expect(location).toMatch(/^\/admin\/research\/[0-9a-f-]{36}$/)

    // The draft it will be written in is already there, waiting as the one row.
    const researchId = location.slice("/admin/research/".length)
    const drafts = await db.select({ id: s.researchDraft.id }).from(s.researchDraft)
      .where(eq(s.researchDraft.researchId, researchId))
    expect(drafts).toHaveLength(1)
  })

  it("opens an empty draft whatever is published, and sends the browser to it", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    await seedVersion(db, { researchId, number: 1, body: { title: { ja: filled("出ている"), en: filled("") } } })

    const response = await researchDetailAction(
      postForm(token, "/x", { intent: "create-draft" }),
      "ja",
      researchId,
    )

    expect(response).toBeInstanceOf(Response)
    if (!(response instanceof Response)) return
    const opened = response.headers.get("location")?.split("/").at(-1) ?? ""
    const draft = await readDraft(db, opened)
    expect(draft?.content).toEqual(emptyResearchContent())
    expect(await db.select().from(s.researchDraft)).toHaveLength(2)
  })

  it("copies a version into a new draft each time, and sends the browser to it", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    await seedVersion(db, { researchId, number: 2, body: { title: { ja: filled("v2 の題"), en: filled("") } } })

    const copy = () => researchDetailAction(
      postForm(token, "/x", { intent: "copy-version", number: "2" }),
      "ja",
      researchId,
    )
    const first = await copy()
    const again = await copy()

    if (!(first instanceof Response) || !(again instanceof Response)) throw new Error("expected redirects")
    expect(first.headers.get("location")).toMatch(new RegExp(`^/admin/research/${researchId}/draft/`))
    expect(again.headers.get("location")).not.toBe(first.headers.get("location"))
    const opened = await readDraft(db, first.headers.get("location")?.split("/").at(-1) ?? "")
    expect(opened?.content.title.ja).toEqual(filled("v2 の題"))
    expect(await db.select().from(s.researchDraft)).toHaveLength(3)
  })

  it("edits a version by opening the draft it is updated in, and leaves the version out", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    const versionId = await seedVersion(db, { researchId, number: 2, body: { title: { ja: filled("出ている"), en: filled("") } } })

    const edit = () => researchDetailAction(
      postForm(token, "/x", { intent: "edit-version", versionId }),
      "ja",
      researchId,
    )
    const response = await edit()
    const again = await edit()

    if (!(response instanceof Response) || !(again instanceof Response)) throw new Error("expected redirects")
    const opened = response.headers.get("location")?.split("/").at(-1) ?? ""
    expect(response.headers.get("location")).toBe(`/admin/research/${researchId}/draft/${opened}`)
    // The same draft the second time: the update is one thing.
    expect(again.headers.get("location")).toBe(response.headers.get("location"))
    const draft = await readDraft(db, opened)
    expect(draft?.content.title.ja).toEqual(filled("出ている"))
    expect(draft?.updating).toEqual({ versionId, number: 2 })
    // The version is untouched; the draft is the one it is updated in.
    expect(await db.select().from(s.researchVersion)).toHaveLength(1)
    expect(await db.select().from(s.researchDraft)).toHaveLength(2)
  })

  it("refuses to withdraw a version while it is being updated, and the version stays", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    const versionId = await seedVersion(db, { researchId, number: 2 })
    await researchDetailAction(
      postForm(token, "/x", { intent: "edit-version", versionId }),
      "ja",
      researchId,
    )

    const result = await researchDetailAction(
      postForm(token, "/x", { intent: "withdraw-version", versionId }),
      "ja",
      researchId,
    )

    expect(result).toEqual({ status: "updating" })
    expect(await db.select().from(s.researchVersion)).toHaveLength(1)
  })

  it("answers not found for a version the research does not hold", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    await seedVersion(db, { researchId, number: 1 })

    const response = await thrown(() => researchDetailAction(
      postForm(token, "/x", { intent: "copy-version", number: "3" }),
      "ja",
      researchId,
    ))

    expect(response.status).toBe(404)
    expect(await db.select().from(s.researchDraft)).toHaveLength(1)
  })

  it("makes a secondary research ID primary and keeps the old one as secondary", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    await researchDetailAction(postForm(token, "/x", { intent: "pin", label: "hum0001", isPrimary: "on" }), "ja", researchId)
    await researchDetailAction(postForm(token, "/x", { intent: "pin", label: "hum0002" }), "ja", researchId)
    const before = await researchDetailPage(get(token, "/x"), "ja", researchId)
    const second = before.labels.find((label) => label.label === "hum0002")
    expect(second?.isPrimary).toBe(false)

    const response = await researchDetailAction(
      postForm(token, "/x", { intent: "make-primary", pinId: second?.id ?? "" }),
      "ja",
      researchId,
    )

    expect(response).toBeInstanceOf(Response)
    const after = await researchDetailPage(get(token, "/x"), "ja", researchId)
    expect(after.labels.map((label) => [label.label, label.isPrimary]))
      .toEqual([["hum0002", true], ["hum0001", false]])
    expect(after.humLabel).toBe("hum0002")
  })

  it("pins only research IDs on the research screen, so a dataset id is malformed there", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)

    const answer = await researchDetailAction(
      postForm(token, "/x", { intent: "pin", label: "JGAD000001", kind: "dataset" }),
      "ja",
      researchId,
    )

    expect(answer).toEqual({ status: "malformed" })
    expect(await db.select().from(s.labelPin)).toEqual([])
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

describe("the research screen's table", () => {
  it("counts a draft's datasets and carries what its publish gate would stop", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)

    const before = await researchDetailPage(get(token, "/x"), "ja", researchId)
    const empty = before.reviews.find((row) => row.draftId === draftId)
    expect(empty?.datasets).toBe(0)
    // No research ID is pinned yet, which the gate always stops on.
    expect(empty?.blocks).toBeGreaterThan(0)

    await createDatasetInDraft(db, { draftId, revision: 1 }, researchId)

    const after = await researchDetailPage(get(token, "/x"), "ja", researchId)
    expect(after.reviews.find((row) => row.draftId === draftId)?.datasets).toBe(1)
  })

  it("counts a published version's own datasets, and an updating one's draft instead", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    const first = await seedDataset(db, researchId, "JGAD000001")
    const second = await seedDataset(db, researchId, "JGAD000002")
    const versionId = await seedVersion(db, {
      researchId,
      number: 1,
      datasets: [{ datasetId: first }, { datasetId: second }],
    })

    const published = await researchDetailPage(get(token, "/x"), "ja", researchId)
    expect(published.versions.find((row) => row.id === versionId)?.datasets).toBe(2)

    await researchDetailAction(
      postForm(token, "/x", { intent: "edit-version", versionId }),
      "ja",
      researchId,
    )
    const updating = only(await db
      .select({ id: s.researchDraft.id })
      .from(s.researchDraft)
      .where(eq(s.researchDraft.replacesVersionId, versionId)))
    // The update starts as a copy of the two published, then a third is added.
    await createDatasetInDraft(db, { draftId: updating.id, revision: 1 }, researchId)

    const view = await researchDetailPage(get(token, "/x"), "ja", researchId)
    // The version's own row still says what is published — two — while the
    // count that moved is read off the updating draft the same way a plain
    // draft's is, not stored a second time on the version.
    expect(view.versions.find((row) => row.id === versionId)?.datasets).toBe(2)
    expect(view.reviews.find((row) => row.draftId === updating.id)?.datasets).toBe(3)
  })
})

describe("the datasets of a version", () => {
  it("lists what the version lists, in the version's order, under the ids they carry now", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    const first = await seedDataset(db, researchId, "JGAD000001")
    const second = await seedDataset(db, researchId, "JGAD000002")
    // The research has a third, which this version does not list.
    await seedDataset(db, researchId, "JGAD000003")
    await seedVersion(db, { researchId, number: 1, datasets: [{ datasetId: second }, { datasetId: first }] })
    await seedVersion(db, { researchId, number: 2, datasets: [{ datasetId: first }] })

    const view = await versionDatasetListPage(get(token, "/x"), "ja", { researchId, number: "1" })

    expect(view.number).toBe(1)
    expect(view.rows.map(({ id, label }) => ({ id, label })))
      .toEqual([{ id: second, label: "JGAD000002" }, { id: first, label: "JGAD000001" }])
  })

  it("gives each row the public page's cells, and none to a dataset that is no longer published", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    const shown = await seedDataset(db, researchId, "JGAD000001")
    const gone = await seedDataset(db, researchId, "JGAD000002")
    await seedVersion(db, { researchId, number: 1, datasets: [{ datasetId: shown }, { datasetId: gone }] })
    await db.insert(s.searchDoc).values({
      targetType: "dataset",
      targetId: shown,
      researchId,
      humLabel: "hum0001",
      datasetLabel: "JGAD000001",
      datePublished: "2023-05-01",
      content: emptyDatasetContent(),
      title: "",
      textJa: "",
      textEn: "",
    })

    const [one, two] = (await versionDatasetListPage(get(token, "/x"), "ja", { researchId, number: "1" })).rows

    expect(one?.shown).toMatchObject({ id: shown, label: "JGAD000001", datePublished: "2023-05-01" })
    expect(two?.shown).toBeNull()
  })

  it("lists an empty version as empty rather than as the research's datasets", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    await seedDataset(db, researchId, "JGAD000001")
    await seedVersion(db, { researchId, number: 1 })

    const view = await versionDatasetListPage(get(token, "/x"), "ja", { researchId, number: "1" })

    expect(view.rows).toEqual([])
  })

  it("answers 404 for a number the research has no version of, and for what is not a number", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    await seedVersion(db, { researchId, number: 1 })

    for (const number of ["2", "0", "01", "v1", "1.5", "-1", "", undefined]) {
      expect((await thrown(() =>
        versionDatasetListPage(get(token, "/x"), "ja", { researchId, number }))).status).toBe(404)
    }
  })

  it("answers 404 under another research, even for a number that one has", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    const { researchId: other } = await createResearchWithDraft(db)
    await seedVersion(db, { researchId, number: 1 })

    expect((await thrown(() =>
      versionDatasetListPage(get(token, "/x"), "ja", { researchId: other, number: "1" }))).status).toBe(404)
  })

  it("refuses somebody signed in without the capability", async () => {
    const token = await signIn(READER, false)
    const { researchId } = await createResearchWithDraft(db)
    await seedVersion(db, { researchId, number: 1 })

    expect((await thrown(() =>
      versionDatasetListPage(get(token, "/x"), "ja", { researchId, number: "1" }))).status).toBe(403)
  })
})

describe("the dataset screens of a draft", () => {
  async function seedCatalog(): Promise<{
    textKey: string
    vocabKey: string
    diseaseKey: string
    terms: string[]
    diseaseTerm: string
  }> {
    const set = only(await db.insert(s.vocabularySet)
      .values({ code: "access", labelJa: "アクセス制限", labelEn: "Access" })
      .returning({ id: s.vocabularySet.id }))
    const icd10 = only(await db.insert(s.vocabularySet)
      .values({ code: "icd10", labelJa: "ICD10", labelEn: "ICD10", hierarchical: true })
      .returning({ id: s.vocabularySet.id }))
    const terms = await db.insert(s.vocabularyTerm).values([
      { setId: set.id, code: "open", labelEn: "Unrestricted" },
      { setId: set.id, code: "closed", labelEn: "Controlled" },
    ]).returning({ id: s.vocabularyTerm.id })
    const diseaseTerm = only(await db.insert(s.vocabularyTerm)
      .values({ setId: icd10.id, code: "K758", labelEn: "Other inflammatory liver diseases" })
      .returning({ id: s.vocabularyTerm.id }))
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
        code: "disease",
        scope: "dataset",
        valueType: "disease",
        labelJa: "疾患",
        labelEn: "Disease",
        vocabularySetId: icd10.id,
        multiple: true,
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
      diseaseKey: byCode.get("disease") ?? "",
      terms: terms.map((term) => term.id),
      diseaseTerm: diseaseTerm.id,
    }
  }

  async function datasetOf(researchId: string, published = false): Promise<string> {
    const row = only(await db.insert(s.dataset).values({ researchId })
      .returning({ id: s.dataset.id }))
    if (published) {
      await seedVersion(db, {
        researchId,
        number: 1,
        datasets: [{
          datasetId: row.id,
          content: { ...emptyDatasetContent(), releaseDate: "2024-03-01" },
        }],
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
    // A disease naming a term of another vocabulary.
    expect(await refused(datasetPayload(null, [
      {
        keyId: catalog.diseaseKey,
        value: {
          kind: "disease",
          state: "value",
          diseases: [{ termIds: catalog.terms.slice(0, 1), nameJa: "", nameEn: "" }],
        },
      },
    ]))).toBe(400)

    expect(await db.select().from(s.draftDatasetEntry)).toHaveLength(0)
  })

  it("stores a disease with the name somebody wrote, and one with no code at all", async () => {
    const token = await signIn(CURATOR, true)
    const catalog = await seedCatalog()
    const { researchId, draftId } = await createResearchWithDraft(db)
    const datasetId = await datasetOf(researchId)

    const answer = await saveDatasetAction(
      postJson(token, "/x", datasetPayload(null, [{
        keyId: catalog.diseaseKey,
        value: {
          kind: "disease",
          state: "value",
          diseases: [
            { termIds: [catalog.diseaseTerm], nameJa: "NASH", nameEn: "NASH" },
            { termIds: [], nameJa: "健常人由来iPS細胞", nameEn: "" },
          ],
        },
      }])),
      { researchId, draftId, datasetId },
    )

    expect(answer.status).toBe("saved")
    const entry = only(await db.select().from(s.draftDatasetEntry))
    expect(entry.content.values[0]?.value).toEqual({
      kind: "disease",
      diseases: {
        state: "value",
        value: [
          { termIds: [catalog.diseaseTerm], nameJa: "NASH", nameEn: "NASH" },
          { termIds: [], nameJa: "健常人由来iPS細胞", nameEn: null },
        ],
      },
    })
  })

  it("refuses a file selection on a dataset an archive issued, which the picker never offers", async () => {
    const token = await signIn(CURATOR, true)
    await seedCatalog()
    const { researchId, draftId } = await createResearchWithDraft(db)
    const datasetId = await datasetOf(researchId)
    await db.insert(s.labelPin).values({ kind: "dataset", label: "JGAD000123", datasetId, isPrimary: true })
    const params = { researchId, draftId, datasetId }

    const payload = {
      revision: null,
      content: { releaseDate: "", fileSelection: ["a.fastq.gz"], values: [], experiments: [] },
    }

    expect((await thrown(() => saveDatasetAction(postJson(token, "/x", payload), params))).status).toBe(400)
    expect(await db.select().from(s.draftDatasetEntry)).toHaveLength(0)
  })

  it("writes a text value holding markup the tree cannot keep as the characters typed", async () => {
    const token = await signIn(CURATOR, true)
    const catalog = await seedCatalog()
    const { researchId, draftId } = await createResearchWithDraft(db)
    const datasetId = await datasetOf(researchId)
    const params = { researchId, draftId, datasetId }

    const result = await saveDatasetAction(
      postJson(token, "/x", datasetPayload(null, [textValue(catalog.textKey, "# 見出し")])),
      params,
    )

    expect(result.status).toBe("saved")
    const entries = await db.select().from(s.draftDatasetEntry)
    expect(entries).toHaveLength(1)
    expect(JSON.stringify(entries[0]?.content)).toContain("# 見出し")
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

  it("gives each listed dataset the public table's cells, read from what the draft wrote", async () => {
    const token = await signIn(CURATOR, true)
    const catalog = await seedCatalog()
    const { researchId, draftId } = await createResearchWithDraft(db)
    const params = { researchId, draftId }
    await draftDatasetListAction(postForm(token, "/x", { intent: "create-dataset", revision: "1" }), "ja", params)
    const once = await draftDatasetListPage(get(token, "/x"), "ja", params)
    await draftDatasetListAction(
      postForm(token, "/x", { intent: "create-dataset", revision: String(once.revision) }),
      "ja",
      params,
    )
    const [written, untouched] = (await draftDatasetListPage(get(token, "/x"), "ja", params)).rows
    const [closed] = catalog.terms.slice(1)

    const saved = await saveDatasetAction(postJson(token, "/x", {
      revision: null,
      content: {
        releaseDate: "2024-03-01",
        fileSelection: [],
        values: [
          textValue(catalog.textKey, "NGS (WGS)"),
          { keyId: catalog.vocabKey, value: { kind: "vocabulary", state: "value", termIds: [closed] } },
        ],
        experiments: [],
      },
    }), { ...params, datasetId: written?.id ?? "" })
    expect(saved.status).toBe("saved")

    const rows = (await draftDatasetListPage(get(token, "/x"), "ja", params)).rows
    const shownOf = (id: string | undefined) => rows.find((row) => row.id === id)?.shown
    const one = shownOf(written?.id)
    expect(one?.typeOfData === null || one?.typeOfData === undefined ? null : fieldText(one.typeOfData))
      .toBe("NGS (WGS)")
    expect(one?.accessType?.label).toBe("Controlled")
    expect(one?.datePublished).toBe("2024-03-01")
    // Nothing written and nothing published: the cells are there and empty.
    expect(shownOf(untouched?.id)).toMatchObject({ typeOfData: null, accessType: null, datePublished: null })
  })

  it("carries a dataset it creates, and takes a published one out of the research", async () => {
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
    expect(view.rows[0]?.isOwn).toBe(true)

    const datasetId = view.rows[0]?.id ?? ""
    // Publishing is what clears `originDraftId`. A dataset belongs to the
    // research either way, so it is still this draft's to take out.
    await db.update(s.dataset).set({ originDraftId: null }).where(eq(s.dataset.id, datasetId))
    expect(await draftDatasetListAction(
      postForm(token, "/x", { intent: "delete-dataset", datasetId, revision: String(view.revision) }),
      "ja",
      params,
    )).toBeInstanceOf(Response)
    expect(await db.select().from(s.dataset)).toEqual([])
  })

  it("pins a dataset's id from its own screen and takes it off again, leaving the entry alone", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    await draftDatasetListAction(postForm(token, "/x", { intent: "create-dataset", revision: "1" }), "ja", { researchId, draftId })
    const listing = await draftDatasetListPage(get(token, "/x"), "ja", { researchId, draftId })
    const datasetId = listing.rows[0]?.id ?? ""
    const params = { researchId, draftId, datasetId }

    expect(await datasetLabelAction(postForm(token, "/x", { intent: "pin", label: "JGAD000777" }), params))
      .toEqual({ status: "pinned" })
    const pinned = await datasetEditorPage(get(token, "/x"), "ja", params)
    expect(pinned.datasetLabel).toBe("JGAD000777")
    expect(pinned.datasetPinId).not.toBeNull()
    // The ledger moved; the draft's rows did not.
    expect((await readDraft(db, draftId))?.revision).toBe(listing.revision)

    expect(await datasetLabelAction(
      postForm(token, "/x", { intent: "unpin", pinId: pinned.datasetPinId ?? "" }),
      params,
    )).toEqual({ status: "unpinned" })
    expect((await datasetEditorPage(get(token, "/x"), "ja", params)).datasetLabel).toBeNull()
  })

  it("refuses an id another dataset holds, and an unpin naming another dataset's row", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    await draftDatasetListAction(postForm(token, "/x", { intent: "create-dataset", revision: "1" }), "ja", { researchId, draftId })
    await draftDatasetListAction(postForm(token, "/x", { intent: "create-dataset", revision: "2" }), "ja", { researchId, draftId })
    const [one, two] = (await draftDatasetListPage(get(token, "/x"), "ja", { researchId, draftId })).rows
    const first = { researchId, draftId, datasetId: one?.id ?? "" }
    const second = { researchId, draftId, datasetId: two?.id ?? "" }
    await datasetLabelAction(postForm(token, "/x", { intent: "pin", label: "JGAD000777" }), first)
    const firstPin = (await datasetEditorPage(get(token, "/x"), "ja", first)).datasetPinId ?? ""

    expect(await datasetLabelAction(postForm(token, "/x", { intent: "pin", label: "JGAD000777" }), second))
      .toEqual({ status: "taken" })
    const refused = await thrown(() => datasetLabelAction(
      postForm(token, "/x", { intent: "unpin", pinId: firstPin }),
      second,
    ))
    expect(refused.status).toBe(404)
    expect((await datasetEditorPage(get(token, "/x"), "ja", first)).datasetLabel).toBe("JGAD000777")
  })

  it("issues the next NHA id from the dataset's own screen, and refuses one typed in that shape", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    await draftDatasetListAction(postForm(token, "/x", { intent: "create-dataset", revision: "1" }), "ja", { researchId, draftId })
    await draftDatasetListAction(postForm(token, "/x", { intent: "create-dataset", revision: "2" }), "ja", { researchId, draftId })
    const [one, two] = (await draftDatasetListPage(get(token, "/x"), "ja", { researchId, draftId })).rows
    const first = { researchId, draftId, datasetId: one?.id ?? "" }
    const second = { researchId, draftId, datasetId: two?.id ?? "" }

    expect(await datasetLabelAction(postForm(token, "/x", { intent: "pin", label: "NHA000001" }), first))
      .toEqual({ status: "reserved" })
    // What the box shows before anything is pinned, and what reading it reserves: nothing.
    expect((await datasetEditorPage(get(token, "/x"), "ja", first)).nextNhaId).toBe("NHA000001")
    expect((await datasetEditorPage(get(token, "/x"), "ja", second)).nextNhaId).toBe("NHA000001")
    expect(await datasetLabelAction(postForm(token, "/x", { intent: "issue" }), first))
      .toEqual({ status: "issued", label: "NHA000001" })
    const issued = await datasetEditorPage(get(token, "/x"), "ja", first)
    expect(issued.datasetLabel).toBe("NHA000001")
    expect(issued.nextNhaId).toBeNull()
    expect(issued.portalIssued).toBe(true)

    // A dataset that has an id is not offered issuing, so asking is not an input the screen made.
    expect((await thrown(() => datasetLabelAction(postForm(token, "/x", { intent: "issue" }), first))).status)
      .toBe(400)
    // The one the second screen showed was overtaken; the answer names the one given.
    expect(await datasetLabelAction(postForm(token, "/x", { intent: "issue" }), second))
      .toEqual({ status: "issued", label: "NHA000002" })
    expect((await datasetEditorPage(get(token, "/x"), "ja", second)).datasetLabel).toBe("NHA000002")
  })

  it("puts the research's datasets in order from the dataset screen", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    const params = { researchId, draftId }
    await draftDatasetListAction(postForm(token, "/x", { intent: "create-dataset", revision: "1" }), "ja", params)
    await draftDatasetListAction(postForm(token, "/x", { intent: "create-dataset", revision: "2" }), "ja", params)
    const made = await draftDatasetListPage(get(token, "/x"), "ja", params)
    const [a, b] = made.rows.map((row) => row.id)
    expect(made.revision).toBe(3)

    expect(await draftDatasetListAction(
      postForm(token, "/x", { intent: "move-dataset", datasetId: b ?? "", by: "-1", revision: "3" }),
      "ja",
      params,
    )).toBeInstanceOf(Response)
    const moved = await draftDatasetListPage(get(token, "/x"), "ja", params)
    expect(moved.rows.map((row) => row.id)).toEqual([b, a])

    // A stale screen changes nothing.
    expect(await draftDatasetListAction(
      postForm(token, "/x", { intent: "move-dataset", datasetId: a ?? "", by: "-1", revision: "3" }),
      "ja",
      params,
    )).toEqual({ status: "conflict" })
    expect((await draftDatasetListPage(get(token, "/x"), "ja", params)).rows.map((row) => row.id))
      .toEqual([b, a])
  })

  it("carries a published dataset without anybody listing it, and never another draft's", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    // One that is out: `originDraftId` is null, which is what publishing leaves.
    const out = only(await db.insert(s.dataset).values({ researchId }).returning({ id: s.dataset.id }))
    const otherDraftId = await createEmptyDraft(db, researchId)
    const theirs = only(await db.insert(s.dataset)
      .values({ researchId, originDraftId: otherDraftId })
      .returning({ id: s.dataset.id }))

    const view = await draftDatasetListPage(get(token, "/x"), "ja", { researchId, draftId })

    expect(view.rows.map((row) => row.id)).toEqual([out.id])
    expect(view.rows.map((row) => row.id)).not.toContain(theirs.id)
    // Nothing was written to say so: the order stays empty until somebody moves a row.
    expect((await readDraft(db, draftId))?.content.datasetIds).toEqual([])
  })

  it("refuses a step that names no direction, and one aimed at another research's dataset", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    const other = await createResearchWithDraft(db)
    await draftDatasetListAction(
      postForm(token, "/x", { intent: "create-dataset", revision: "1" }),
      "ja",
      { researchId: other.researchId, draftId: other.draftId },
    )
    const theirs = (await draftDatasetListPage(get(token, "/x"), "ja", other)).rows[0]?.id ?? ""

    const sideways = await thrown(() => draftDatasetListAction(
      postForm(token, "/x", { intent: "move-dataset", datasetId: theirs, by: "2", revision: "1" }),
      "ja",
      { researchId, draftId },
    ))
    expect(sideways.status).toBe(400)

    // A step aimed at a dataset this research does not have moves nothing.
    expect(await draftDatasetListAction(
      postForm(token, "/x", { intent: "move-dataset", datasetId: theirs, by: "-1", revision: "1" }),
      "ja",
      { researchId, draftId },
    )).toBeInstanceOf(Response)
    expect((await readDraft(db, draftId))?.content.datasetIds).toEqual([])
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

describe("the publish screen", () => {
  it("names each dataset that has none as its row, and issues an NHA id to it from there", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    await pinLabel(db, { kind: "hum", label: "hum0001", subjectId: researchId, isPrimary: true }, BOOTSTRAP_ACTOR)
    await createDatasetInDraft(db, { draftId, revision: 1 }, researchId)
    await createDatasetInDraft(db, { draftId, revision: 2 }, researchId)

    const view = await publishPage(get(token, "/x"), "ja", { researchId, draftId })

    expect(view.blocks).toHaveLength(2)
    // Each dataset it names is drawn as its row, not left to its identity.
    for (const block of view.blocks) expect(view.datasetRows[block.datasetId ?? ""]).toBeDefined()

    expect(view.nextNhaId).toBe("NHA000001")
    const datasetId = view.blocks[0]?.datasetId ?? ""
    expect(await publishAction(postForm(token, "/x", { intent: "issue", datasetId }), "ja", { researchId, draftId }))
      .toEqual({ status: "issued", label: "NHA000001" })
    const after = await publishPage(get(token, "/x"), "ja", { researchId, draftId })
    expect(after.blocks.map((block) => block.datasetId)).not.toContain(datasetId)
    expect(after.nextNhaId).toBe("NHA000002")
    const [pin] = await db.select({ label: s.labelPin.label }).from(s.labelPin)
      .where(eq(s.labelPin.datasetId, datasetId))
    expect(pin?.label).toBe("NHA000001")
  })

  it("refuses an update that would change nothing, and lets a new release date through as a change", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    const versionId = await seedVersion(db, { researchId, number: 1, releaseDate: "2024-05-01" })
    await researchDetailAction(postForm(token, "/x", { intent: "edit-version", versionId }), "ja", researchId)
    const [update] = await db
      .select({ id: s.researchDraft.id })
      .from(s.researchDraft)
      .where(eq(s.researchDraft.replacesVersionId, versionId))
    const at = { researchId, draftId: update?.id ?? "" }

    const same = await publishAction(
      postForm(token, "/x", { intent: "publish", revision: "1", releaseDate: "2024-05-01" }),
      "ja",
      at,
    )
    expect(same).toEqual({ status: "unchanged" })

    const moved = await publishAction(
      postForm(token, "/x", { intent: "publish", revision: "1", releaseDate: "2024-06-01" }),
      "ja",
      at,
    )
    expect(moved).not.toEqual({ status: "unchanged" })
  })
})
