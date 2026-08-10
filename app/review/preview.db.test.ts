import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createDatasetInDraft,
  createResearchWithDraft,
  reissueShareToken,
  saveDatasetEntry,
  saveDraftContent,
  setDraftSharing,
} from "~/admin/drafts.server"
import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DatasetContent, ResearchContent } from "~/content/types"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { PRIVATE_BUCKET, PUBLIC_BUCKET, privatePrefix, publicPrefix } from "~/files/box"
import { clearPrefix, putTestObject } from "~/files/_store"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import {
  PREVIEW_HEADERS,
  previewAction,
  previewDatasetPage,
  previewResearchPage,
} from "./preview.server"
import { RESEARCH } from "./anchors"
import { readThreads } from "./comments.server"

/**
 * The pages a share link opens.
 *
 * Two things are being held down. **A preview keeps what is unsettled**, which
 * is the whole reason the link exists: the first thing a provider is asked is
 * to fill exactly those in, and the published face would hide the question. And
 * **the token is checked where the data is fetched**, so a link that is private
 * or has been reissued opens nothing however it is reached.
 */
const db = getDb()

const UNKNOWN = { state: "unknown" as const }

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

function get(): Request {
  return new Request("http://localhost/preview/token")
}

function post(fields: Record<string, string>): Request {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.set(name, value)
  return new Request("http://localhost/preview/token", { method: "POST", body: form })
}

function titled(ja: string, en: ResearchContent["title"]["en"] = filled("")): ResearchContent {
  return { ...emptyResearchContent(), title: { ja: filled(ja), en } }
}

async function tokenOf(draftId: string): Promise<string> {
  const [row] = await db
    .select({ token: s.researchDraft.shareToken })
    .from(s.researchDraft)
    .where(eq(s.researchDraft.id, draftId))
  if (row === undefined) throw new Error("no draft")
  return row.token
}

async function sharedDraft(content: ResearchContent = titled("題目")): Promise<{
  researchId: string
  draftId: string
  token: string
}> {
  const created = await createResearchWithDraft(db)
  await saveDraftContent(db, { draftId: created.draftId, revision: 1 }, { note: "", content })
  await setDraftSharing(db, created.draftId, { enabled: true, expiresAt: null })
  return { ...created, token: await tokenOf(created.draftId) }
}

async function publish(researchId: string, number: number, content: ResearchContent): Promise<void> {
  const [snapshot] = await db
    .insert(s.contentSnapshot)
    .values({ researchId, content })
    .returning({ id: s.contentSnapshot.id })
  if (snapshot === undefined) throw new Error("no snapshot")
  await db.insert(s.researchVersion).values({
    researchId,
    number,
    snapshotId: snapshot.id,
    releaseDate: "2026-01-01",
  })
}

async function status(run: Promise<unknown>): Promise<number> {
  try {
    await run
  } catch (thrown) {
    if (thrown instanceof Response) return thrown.status
    throw thrown
  }
  throw new Error("expected a response to be thrown")
}

describe("opening a preview", () => {
  it("answers as a page that is not there when the link is private", async () => {
    const { draftId, token } = await sharedDraft()
    await setDraftSharing(db, draftId, { enabled: false, expiresAt: null })

    expect(await status(previewResearchPage(get(), "ja", token))).toBe(404)
  })

  it("answers as a page that is not there when the token has been reissued", async () => {
    const { draftId, token } = await sharedDraft()
    await reissueShareToken(db, draftId)

    expect(await status(previewResearchPage(get(), "ja", token))).toBe(404)
  })

  it("says not to index it and not to pass the address on", () => {
    expect(PREVIEW_HEADERS["X-Robots-Tag"]).toContain("noindex")
    expect(PREVIEW_HEADERS["Referrer-Policy"]).toBe("no-referrer")
  })

  /**
   * The language being read is the one that was asked about, so nothing fills
   * it in from the other side: the question is what the reader is being shown.
   */
  it("keeps a value that has not been settled, as the empty frame it is", async () => {
    const asked: ResearchContent = {
      ...emptyResearchContent(),
      title: { ja: UNKNOWN, en: filled("Title") },
    }
    const { token } = await sharedDraft(asked)

    const view = await previewResearchPage(get(), "ja", token)
    expect(view.view.title).toEqual({ state: "unsettled" })
  })
})

describe("what a preview marks", () => {
  it("marks nothing while the research has no published version to differ from", async () => {
    const { token } = await sharedDraft(titled("題目"))

    const view = await previewResearchPage(get(), "ja", token)
    expect(view.publishedNumber).toBe(null)
    expect(view.changed).toEqual([])
  })

  it("marks the places that differ, and holds what the published version says there", async () => {
    const { researchId, token } = await sharedDraft(titled("新しい題目"))
    await publish(researchId, 3, titled("前の題目"))

    const view = await previewResearchPage(get(), "ja", token)
    expect(view.publishedNumber).toBe(3)
    expect(view.changed).toContain("title")
    expect(view.previous.title).toEqual({
      kind: "field",
      field: { state: "plain", text: "前の題目", untranslated: false },
    })
  })

  /**
   * The memo never reaches a preview and the short summary is not drawn there,
   * so neither can be a place the reader is told to look at.
   */
  it("marks only places the page draws", async () => {
    const short = { ...emptyResearchContent().summaryShort, methods: { ja: filled([[{ text: "手法" }]]), en: filled([]) } }
    const { researchId, token } = await sharedDraft({ ...titled("題目"), summaryShort: short })
    await publish(researchId, 1, titled("題目"))

    const view = await previewResearchPage(get(), "ja", token)
    expect(view.changed).toEqual([])
  })
})

describe("a dataset preview", () => {
  async function withDataset(content: DatasetContent): Promise<{
    token: string
    datasetId: string
    draftId: string
  }> {
    const { draftId, researchId, token } = await sharedDraft()
    const created = await createDatasetInDraft(db, { draftId, revision: 2 }, researchId)
    if (created.status !== "created") throw new Error("the dataset was not created")
    await saveDatasetEntry(db, { draftId, datasetId: created.datasetId, revision: null }, content)
    return { token, datasetId: created.datasetId, draftId }
  }

  it("shows a dataset the version lists, addressed by identity because it has no id yet", async () => {
    const { token, datasetId } = await withDataset({
      ...emptyDatasetContent(),
      experiments: [{ id: "e1", label: filled("Exome"), values: [] }],
    })

    const view = await previewDatasetPage(get(), "ja", token, datasetId)
    expect(view.datasetLabel).toBe(null)
    expect(view.view.experiments.map((row) => row.label))
      .toEqual([{ state: "plain", text: "Exome", untranslated: false }])
  })

  it("keeps an unsettled label as the question it is", async () => {
    const { token, datasetId } = await withDataset({
      ...emptyDatasetContent(),
      experiments: [{ id: "e1", label: UNKNOWN, values: [] }],
    })

    const view = await previewDatasetPage(get(), "ja", token, datasetId)
    expect(view.view.experiments[0]?.label).toEqual({ state: "unsettled" })
  })

  it("answers as a page that is not there for a dataset this version does not list", async () => {
    const { token } = await sharedDraft()
    const stranger = "00000000-0000-0000-0000-000000000009"

    expect(await status(previewDatasetPage(get(), "ja", token, stranger))).toBe(404)
  })
})

describe("writing from a share link", () => {
  it("takes a comment signed with a typed name and hangs it where it was written", async () => {
    const { draftId, token } = await sharedDraft()

    const outcome = await previewAction(
      post({ intent: "comment", path: "summary.aims", name: " 提供者 ", body: " 対象は何名ですか " }),
      token,
      RESEARCH,
    )

    expect(outcome).toBeInstanceOf(Response)
    const [thread] = await readThreads(db, draftId)
    expect(thread?.anchor).toEqual({ kind: "research-field", path: "summary.aims" })
    expect(thread?.comments[0]?.authorName).toBe("提供者")
    expect(thread?.comments[0]?.body).toBe("対象は何名ですか")
    expect(thread?.comments[0]?.bySignedIn).toBe(false)
  })

  it("refuses a comment nobody can be asked about, and writes nothing", async () => {
    const { draftId, token } = await sharedDraft()

    expect(await previewAction(
      post({ intent: "comment", path: "title", name: "  ", body: "text" }),
      token,
      RESEARCH,
    )).toEqual({ status: "invalid", problem: "name-required" })
    expect(await readThreads(db, draftId)).toEqual([])
  })

  it("refuses an anchor that leads nowhere in the draft it claims to be about", async () => {
    const { draftId, token } = await sharedDraft()

    expect(await status(previewAction(
      post({ intent: "comment", path: "nowhere.at.all", name: "提供者", body: "text" }),
      token,
      RESEARCH,
    ))).toBe(400)
    expect(await readThreads(db, draftId)).toEqual([])
  })

  it("refuses to comment on a dataset this version does not list", async () => {
    const { token } = await sharedDraft()
    const stranger = "00000000-0000-0000-0000-000000000009"

    expect(await status(previewAction(
      post({ intent: "comment", path: "values.k1", name: "提供者", body: "text" }),
      token,
      { kind: "dataset", datasetId: stranger },
    ))).toBe(400)
  })

  it("records that a reader has looked at the draft", async () => {
    const { draftId, token } = await sharedDraft()

    await previewAction(post({ intent: "acknowledge", name: "提供者" }), token, RESEARCH)

    const rows = await db
      .select({ name: s.reviewAcknowledgement.actorName })
      .from(s.reviewAcknowledgement)
      .where(eq(s.reviewAcknowledgement.draftId, draftId))
    expect(rows).toEqual([{ name: "提供者" }])
  })

  it("writes nothing at all once the link is private", async () => {
    const { draftId, token } = await sharedDraft()
    await setDraftSharing(db, draftId, { enabled: false, expiresAt: null })

    expect(await status(previewAction(
      post({ intent: "comment", path: "title", name: "提供者", body: "text" }),
      token,
      RESEARCH,
    ))).toBe(404)
    expect(await readThreads(db, draftId)).toEqual([])
  })
})

describe("the download list a share link shows", () => {
  const HUM = "hum6001"
  let opened = ""

  afterEach(async () => {
    await clearPrefix(PUBLIC_BUCKET, publicPrefix(HUM))
    if (opened !== "") await clearPrefix(PRIVATE_BUCKET, privatePrefix(opened))
    opened = ""
  })

  it("shows what is still private, because at draft time that is all there is", async () => {
    const shared = await sharedDraft()
    opened = shared.researchId
    await db.insert(s.labelPin)
      .values({ kind: "hum", label: HUM, researchId: shared.researchId, isPrimary: true })
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(shared.researchId)}closed.zip`, "1")
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(HUM)}open.zip`, "12")

    const view = await previewResearchPage(get(), "ja", shared.token)

    expect(view.view.files.rows).toEqual([
      { name: "closed.zip", size: 1, isPublic: false },
      { name: "open.zip", size: 2, isPublic: true },
    ])
  })

  it("keeps a dataset's selection of a file nobody has made public yet", async () => {
    const shared = await sharedDraft()
    opened = shared.researchId
    await db.insert(s.labelPin)
      .values({ kind: "hum", label: HUM, researchId: shared.researchId, isPrimary: true })
    const created = await createDatasetInDraft(db, { draftId: shared.draftId, revision: 2 }, shared.researchId)
    if (created.status !== "created") throw new Error("expected a dataset")
    await saveDatasetEntry(
      db,
      { draftId: shared.draftId, datasetId: created.datasetId, revision: null },
      { ...emptyDatasetContent(), fileSelection: ["closed.zip"] },
    )
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(shared.researchId)}closed.zip`, "1")

    const view = await previewDatasetPage(get(), "ja", shared.token, created.datasetId)

    expect(view.view.files).toEqual([{ name: "closed.zip", size: 1, isPublic: false }])
  })
})
