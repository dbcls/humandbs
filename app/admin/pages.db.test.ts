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

import { createDatasetInDraft, createResearchWithDraft, saveDraftContent } from "./drafts.server"
import { researchContentInput, type DraftInput } from "./form"
import {
  createResearchAction,
  datasetEditorPage,
  datasetLabelAction,
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
    expect(view.rows[0]?.flags.noHumLabel).toBe(true)
  })

  it("reads what a research is missing from the draft somebody is working on", async () => {
    const token = await signIn(CURATOR, true)
    const { draftId } = await createResearchWithDraft(db)
    await saveDraftContent(db, { draftId, revision: 1 }, {
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
    // The other axis is counted inside what the status left, which is nothing.
    expect(view.counts.flags.noHumLabel).toBe(0)

    // With the word in force and no status, the flags are counted within it.
    const narrowed = await researchListPage(get(token, "/admin/research?q=糖尿病"), "ja")

    expect(narrowed.counts.flags.untranslated).toBe(1)
    expect(narrowed.counts.statuses).toEqual({ published: 0, unpublished: 1 })
  })

  async function pinHum(researchId: string, label: string): Promise<void> {
    await db.insert(s.labelPin).values({ kind: "hum", label, researchId, isPrimary: true })
  }

  async function pinDataset(datasetId: string, label: string): Promise<void> {
    await db.insert(s.labelPin).values({ kind: "dataset", label, datasetId, isPrimary: true })
  }

  async function flagsOfTheOnlyRow(token: string) {
    const view = await researchListPage(get(token, "/admin/research"), "ja")
    return only(view.rows).flags
  }

  it("flags a shortcoming when a dataset of the research carries no pinned id", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    await pinHum(researchId, "hum0001")
    await db.insert(s.dataset).values({ researchId })

    expect((await flagsOfTheOnlyRow(token)).noDatasetLabel).toBe(true)
  })

  it("flags a shortcoming when a pinned accession is absent from the upstream ledger", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    await pinHum(researchId, "hum0001")
    const dataset = only(await db.insert(s.dataset).values({ researchId })
      .returning({ id: s.dataset.id }))
    await pinDataset(dataset.id, "JGAD000001")

    const flags = await flagsOfTheOnlyRow(token)
    expect(flags.upstreamMismatch).toBe(true)
    expect(flags.noDatasetLabel).toBe(false)
  })

  it("flags a shortcoming when a pinned accession's upstream hum disagrees with the pinned one", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    await pinHum(researchId, "hum0001")
    const dataset = only(await db.insert(s.dataset).values({ researchId })
      .returning({ id: s.dataset.id }))
    await pinDataset(dataset.id, "JGAD000001")
    await db.insert(s.humAccession)
      .values({ accession: "JGAD000001", humLabel: "hum0002", kind: "jga-dataset" })

    expect((await flagsOfTheOnlyRow(token)).upstreamMismatch).toBe(true)
  })

  it("settles both the pin and the upstream shortcoming when every pin matches upstream", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    await pinHum(researchId, "hum0001")
    const dataset = only(await db.insert(s.dataset).values({ researchId })
      .returning({ id: s.dataset.id }))
    await pinDataset(dataset.id, "JGAD000001")
    await db.insert(s.humAccession)
      .values({ accession: "JGAD000001", humLabel: "hum0001", kind: "jga-dataset" })

    const flags = await flagsOfTheOnlyRow(token)
    expect(flags.noDatasetLabel).toBe(false)
    expect(flags.upstreamMismatch).toBe(false)
  })

  it("leaves an id the portal issued out of the upstream check, even absent from the ledger", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId } = await createResearchWithDraft(db)
    await pinHum(researchId, "hum0001")
    const dataset = only(await db.insert(s.dataset).values({ researchId })
      .returning({ id: s.dataset.id }))
    await pinDataset(dataset.id, "hum0001-NHA001")

    const flags = await flagsOfTheOnlyRow(token)
    expect(flags.noDatasetLabel).toBe(false)
    expect(flags.upstreamMismatch).toBe(false)
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
    // Publishing is what clears `originDraftId`; after that the draft that made
    // it may no longer destroy it.
    await db.update(s.dataset).set({ originDraftId: null }).where(eq(s.dataset.id, datasetId))
    expect(await draftDatasetListAction(
      postForm(token, "/x", { intent: "delete-dataset", datasetId, revision: String(view.revision) }),
      "ja",
      params,
    )).toEqual({ status: "refused" })
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
    expect(pinned.datasetIdSuggestion).toBeNull()
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

  it("proposes an id under the research's hum label while the dataset has none", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    await researchDetailAction(postForm(token, "/x", { intent: "pin", label: "hum0042", isPrimary: "on" }), "ja", researchId)
    await draftDatasetListAction(postForm(token, "/x", { intent: "create-dataset", revision: "1" }), "ja", { researchId, draftId })
    const datasetId = (await draftDatasetListPage(get(token, "/x"), "ja", { researchId, draftId })).rows[0]?.id ?? ""

    const view = await datasetEditorPage(get(token, "/x"), "ja", { researchId, draftId, datasetId })

    expect(view.datasetIdSuggestion).toBe("hum0042-NHA001")
  })

  it("decides what the version lists, and in what order, from the listing screen", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    const params = { researchId, draftId }
    await draftDatasetListAction(postForm(token, "/x", { intent: "create-dataset", revision: "1" }), "ja", params)
    await draftDatasetListAction(postForm(token, "/x", { intent: "create-dataset", revision: "2" }), "ja", params)
    const made = await draftDatasetListPage(get(token, "/x"), "ja", params)
    const [a, b] = made.listedIds
    expect(made.revision).toBe(3)

    expect(await draftDatasetListAction(
      postForm(token, "/x", { intent: "move-dataset", datasetId: b ?? "", by: "-1", revision: "3" }),
      "ja",
      params,
    )).toBeInstanceOf(Response)
    expect((await draftDatasetListPage(get(token, "/x"), "ja", params)).listedIds).toEqual([b, a])

    expect(await draftDatasetListAction(
      postForm(token, "/x", { intent: "unlist-dataset", datasetId: a ?? "", revision: "4" }),
      "ja",
      params,
    )).toBeInstanceOf(Response)
    const unlisted = await draftDatasetListPage(get(token, "/x"), "ja", params)
    expect(unlisted.listedIds).toEqual([b])
    expect(unlisted.rows.find((row) => row.id === a)?.listed).toBe(false)

    // A stale screen changes nothing.
    expect(await draftDatasetListAction(
      postForm(token, "/x", { intent: "list-dataset", datasetId: a ?? "", revision: "4" }),
      "ja",
      params,
    )).toEqual({ status: "conflict" })
    expect(await draftDatasetListAction(
      postForm(token, "/x", { intent: "list-dataset", datasetId: a ?? "", revision: "5" }),
      "ja",
      params,
    )).toBeInstanceOf(Response)
    expect((await draftDatasetListPage(get(token, "/x"), "ja", params)).listedIds).toEqual([b, a])
  })

  it("refuses to list a dataset of another research, and a step that names no direction", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)
    const other = await createResearchWithDraft(db)
    await draftDatasetListAction(
      postForm(token, "/x", { intent: "create-dataset", revision: "1" }),
      "ja",
      { researchId: other.researchId, draftId: other.draftId },
    )
    const theirs = (await draftDatasetListPage(get(token, "/x"), "ja", other)).rows[0]?.id ?? ""

    const refused = await thrown(() => draftDatasetListAction(
      postForm(token, "/x", { intent: "list-dataset", datasetId: theirs, revision: "1" }),
      "ja",
      { researchId, draftId },
    ))
    expect(refused.status).toBe(400)
    const sideways = await thrown(() => draftDatasetListAction(
      postForm(token, "/x", { intent: "move-dataset", datasetId: theirs, by: "2", revision: "1" }),
      "ja",
      { researchId, draftId },
    ))
    expect(sideways.status).toBe(400)
    expect((await readDraft(db, draftId))?.content.datasetIds).toEqual([])
  })

  it("records who is editing and answers with everybody, marking the one who asked", async () => {
    const token = await signIn(CURATOR, true)
    const { researchId, draftId } = await createResearchWithDraft(db)

    const answer = await presenceAction(postForm(token, "/x", {}), { researchId, draftId })

    expect(answer.present).toEqual([{ name: "curator", isSelf: true }])
    expect(await db.select().from(s.draftPresence)).toHaveLength(1)
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
