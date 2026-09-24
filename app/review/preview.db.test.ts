import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createDatasetInDraft,
  createEmptyDraft,
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
import { seedVersion } from "~/db/seed"

import {
  drawDraft,
  PREVIEW_HEADERS,
  previewAction,
  previewDatasetPage,
  previewResearchPage,
} from "./preview.server"
import { anchorOf, RESEARCH } from "./anchors"
import { NAME_LIMIT, unresolvedCount } from "./comments"
import { postAboutDraft, readComments, setCommentResolved } from "./comments.server"

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
  await saveDraftContent(db, { draftId: created.draftId, revision: 1 }, { content })
  await setDraftSharing(db, created.draftId, { enabled: true, expiresAt: null })
  return { ...created, token: await tokenOf(created.draftId) }
}

async function publish(researchId: string, number: number, content: ResearchContent): Promise<void> {
  const { datasetIds, ...body } = content
  await seedVersion(db, {
    researchId,
    number,
    releaseDate: "2026-01-01",
    body,
    datasets: datasetIds.map((datasetId) => ({ datasetId })),
  })
}

/** Something said at a place, put there directly: what the page shows, not how it got there. */
async function saidAt(input: {
  draftId: string
  anchor: ReturnType<typeof anchorOf>
  author: { sub: string | null, name: string }
  body: string
}): Promise<{ status: "posted", commentId: string }> {
  const [row] = await db
    .insert(s.comment)
    .values({
      draftId: input.draftId,
      anchor: input.anchor,
      authorSub: input.author.sub,
      authorName: input.author.name,
      body: input.body,
    })
    .returning({ id: s.comment.id })
  if (row === undefined) throw new Error("the comment was not written")
  return { status: "posted", commentId: row.id }
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

  it("holds a section of elements as the page's table, every column of every row, on both sides", async () => {
    const grant = (id: string, title: string, grantIds: string[]) => ({
      id,
      title: { ja: filled(title), en: filled("") },
      agency: { name: { ja: filled("科研費"), en: filled("") } },
      grantIds,
    })
    const { researchId, token } = await sharedDraft({ ...titled("題目"), grants: [grant("g2", "新しい課題", ["B-2"])] })
    await publish(researchId, 1, { ...titled("題目"), grants: [grant("g1", "前の課題", ["A-1", "A-2"])] })

    const view = await previewResearchPage(get(), "ja", token)
    expect(view.changed).toContain("grants")
    expect(view.previous.grants).toEqual({
      kind: "rows",
      rows: {
        columns: ["科研費・助成金名", "研究課題名", "研究課題番号"],
        rows: [{ id: "g1", cells: ["科研費", "前の課題", "A-1\nA-2"] }],
      },
    })
    expect(view.current.grants).toEqual({
      kind: "rows",
      rows: {
        columns: ["科研費・助成金名", "研究課題名", "研究課題番号"],
        rows: [{ id: "g2", cells: ["科研費", "新しい課題", "B-2"] }],
      },
    })
  })

  /**
   * The memo never reaches a preview and the short summary is not drawn there,
   * so neither can be a place the reader is told to look at.
   */
  it("marks only places the page draws", async () => {
    const short = { ...emptyResearchContent().listingSummary, methods: { ja: filled([[{ text: "手法" }]]), en: filled([]) } }
    const { researchId, token } = await sharedDraft({ ...titled("題目"), listingSummary: short })
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

  /**
   * `app/search/rebuild.db.test.ts` resolves the same accession's date the same
   * way, through the same projection (`app/content/public.ts`); the numbers
   * here are chosen to match that test's so the two can be compared directly.
   */
  it("resolves the date the projection gives a portal-issued id, from the content", async () => {
    const { token, datasetId } = await withDataset({
      ...emptyDatasetContent(),
      releaseDate: "2020-05-05",
    })

    const view = await previewDatasetPage(get(), "ja", token, datasetId)
    expect(view.view.datePublished).toBe("2020-05-05")
  })

  it("resolves the date of an external accession from the archive cache", async () => {
    const { token, datasetId } = await withDataset(emptyDatasetContent())
    await db.insert(s.labelPin)
      .values({ kind: "dataset", label: "JGAD000001", datasetId, isPrimary: true })
    await db.insert(s.accessionDate).values({
      accession: "JGAD000001",
      source: "ddbj-search",
      datePublished: "2018-04-02",
      dateModified: "2023-11-15",
    })

    const view = await previewDatasetPage(get(), "ja", token, datasetId)
    expect(view.view.datePublished).toBe("2018-04-02")
    expect(view.view.dateModified).toBe("2023-11-15")
  })
})

describe("the listing row a draft is drawn with", () => {
  /** A key whose one term a dataset can hold. */
  async function keyWithTerm(
    code: string,
    scope: "dataset" | "experiment",
    term: string,
  ): Promise<{ keyId: string, termId: string }> {
    const [set] = await db.insert(s.vocabularySet)
      .values({ code, labelJa: code, labelEn: code })
      .returning({ id: s.vocabularySet.id })
    if (set === undefined) throw new Error("no vocabulary")
    const [made] = await db.insert(s.vocabularyTerm)
      .values({ setId: set.id, code: term, labelEn: term })
      .returning({ id: s.vocabularyTerm.id })
    const [key] = await db.insert(s.contentKey)
      .values({ code, scope, valueType: "vocabulary", labelJa: code, labelEn: code, vocabularySetId: set.id })
      .returning({ id: s.contentKey.id })
    if (made === undefined || key === undefined) throw new Error("no key")
    return { keyId: key.id, termId: made.id }
  }

  const holding = (keyId: string, termId: string) =>
    ({ keyId, value: { kind: "vocabulary" as const, termIds: { state: "value" as const, value: [termId] } } })

  /*
    The row has no search rows to be read from, so what can go wrong is reading
    the wrong things off the draft: a value under some other key counted as a
    platform, a dataset without an id listed as an empty label, or the saved
    content drawn where the form's unsaved one was asked for.
  */
  it("reads the summaries from the content it is given, and the platforms and access off the draft's datasets", async () => {
    const { researchId, draftId } = await sharedDraft()
    const platform = await keyWithTerm("platform", "experiment", "NovaSeq 6000")
    const access = await keyWithTerm("access-criteria", "dataset", "Controlled-access")
    const other = await keyWithTerm("sex", "experiment", "female")

    const listed = await createDatasetInDraft(db, { draftId, revision: 2 }, researchId)
    if (listed.status !== "created") throw new Error(listed.status)
    await saveDatasetEntry(db, { draftId, datasetId: listed.datasetId, revision: null }, {
      ...emptyDatasetContent(),
      values: [holding(access.keyId, access.termId)],
      experiments: [{
        id: "e1",
        label: filled("WGS"),
        values: [holding(platform.keyId, platform.termId), holding(other.keyId, other.termId)],
      }],
    })
    await db.insert(s.labelPin)
      .values({ kind: "dataset", label: "JGAD000001", datasetId: listed.datasetId, isPrimary: true })
    const unpinned = await createDatasetInDraft(db, { draftId, revision: 3 }, researchId)
    if (unpinned.status !== "created") throw new Error(unpinned.status)

    const saved = await db.select({ content: s.researchDraft.content }).from(s.researchDraft)
      .where(eq(s.researchDraft.id, draftId))
    const typed: ResearchContent = {
      ...(saved[0]?.content ?? emptyResearchContent()),
      listingSummary: {
        ...emptyResearchContent().listingSummary,
        methods: { ja: filled([[{ text: "まだ保存していない手法" }]]), en: filled([]) },
      },
    }

    const drawn = await drawDraft(get(), "ja", { researchId, draftId, content: typed, updating: null })

    expect(drawn.row.methods).toEqual(expect.objectContaining({ state: "rich" }))
    expect(JSON.stringify(drawn.row.methods)).toContain("まだ保存していない手法")
    expect(drawn.row.datasetLabels).toEqual(["JGAD000001"])
    expect(drawn.row.platforms.map((term) => term.label)).toEqual(["NovaSeq 6000"])
    expect(drawn.row.accessTypes.map((term) => term.label)).toEqual(["Controlled-access"])
    expect([drawn.row.datePublished, drawn.row.dateModified]).toEqual([null, null])
  })
})

describe("the comments a preview shows", () => {
  /**
   * This draft beside another draft of the same research. **A dataset another
   * draft made is not this one's**: it could be commented on from that draft's
   * editor, but no version and no preview page here draws it.
   */
  async function withAnotherDraftsDataset(): Promise<{
    draftId: string
    token: string
    carriedId: string
    otherId: string
  }> {
    const { draftId, researchId, token } = await sharedDraft()
    const carried = await createDatasetInDraft(db, { draftId, revision: 2 }, researchId)
    if (carried.status !== "created") throw new Error("expected this draft's dataset to be created")
    const otherDraftId = await createEmptyDraft(db, researchId)
    const theirs = await createDatasetInDraft(db, { draftId: otherDraftId, revision: 1 }, researchId)
    if (theirs.status !== "created") throw new Error("expected the other draft's dataset to be created")
    return { draftId, token, carriedId: carried.datasetId, otherId: theirs.datasetId }
  }

  it("returns research comments and the comments of the datasets it carries, and no others", async () => {
    const { draftId, token, carriedId, otherId } = await withAnotherDraftsDataset()
    await saidAt({
      draftId,
      anchor: anchorOf(RESEARCH, "title"),
      author: { sub: null, name: "reader" },
      body: "on research",
    })
    await saidAt({
      draftId,
      anchor: anchorOf({ kind: "dataset", datasetId: carriedId }, "values.k1"),
      author: { sub: null, name: "reader" },
      body: "on the dataset it carries",
    })
    await saidAt({
      draftId,
      anchor: anchorOf({ kind: "dataset", datasetId: otherId }, "values.k1"),
      author: { sub: null, name: "reader" },
      body: "on another draft's dataset",
    })

    const view = await previewResearchPage(get(), "ja", token)

    expect(view.comments.map((one) => one.body).sort()).toEqual([
      "on research",
      "on the dataset it carries",
    ])
  })

  /** What a share link is handed: the whole, never the memo. */
  it("returns what was said about the whole, and never a line of the memo", async () => {
    const { draftId, token } = await sharedDraft()
    await postAboutDraft(db, { draftId, kind: "draft", author: { sub: null, name: "reader" }, body: "on the whole" })
    await postAboutDraft(db, { draftId, kind: "memo", author: { sub: "admin", name: "curator" }, body: "for admins" })

    const view = await previewResearchPage(get(), "ja", token)

    expect(view.comments.map((one) => one.body)).toEqual(["on the whole"])
  })

  it("drops the comments of a dataset another draft made, resolved or not", async () => {
    const { draftId, token, otherId } = await withAnotherDraftsDataset()
    await saidAt({
      draftId,
      anchor: anchorOf({ kind: "dataset", datasetId: otherId }, "values.k1"),
      author: { sub: null, name: "reader" },
      body: "open",
    })
    const toResolve = await saidAt({
      draftId,
      anchor: anchorOf({ kind: "dataset", datasetId: otherId }, "values.k2"),
      author: { sub: null, name: "reader" },
      body: "resolved",
    })
    await setCommentResolved(db, {
      draftId,
      commentId: toResolve.commentId,
      resolved: true,
      actorSub: "keycloak|admin",
    })

    const view = await previewResearchPage(get(), "ja", token)

    expect(view.comments).toEqual([])
  })

  it("counts unresolved comments only among the ones the page draws", async () => {
    const { draftId, token, otherId } = await withAnotherDraftsDataset()
    await saidAt({
      draftId,
      anchor: anchorOf(RESEARCH, "title"),
      author: { sub: null, name: "reader" },
      body: "on research",
    })
    await saidAt({
      draftId,
      anchor: anchorOf({ kind: "dataset", datasetId: otherId }, "values.k1"),
      author: { sub: null, name: "reader" },
      body: "on another draft's dataset",
    })

    const view = await previewResearchPage(get(), "ja", token)

    expect(unresolvedCount(view.comments)).toBe(1)
  })

  it("returns a dataset preview only the comments addressed to that dataset", async () => {
    const { draftId, token, carriedId, otherId } = await withAnotherDraftsDataset()
    await saidAt({
      draftId,
      anchor: anchorOf(RESEARCH, "title"),
      author: { sub: null, name: "reader" },
      body: "on research",
    })
    await saidAt({
      draftId,
      anchor: anchorOf({ kind: "dataset", datasetId: carriedId }, "values.k1"),
      author: { sub: null, name: "reader" },
      body: "on this dataset",
    })
    await saidAt({
      draftId,
      anchor: anchorOf({ kind: "dataset", datasetId: otherId }, "values.k1"),
      author: { sub: null, name: "reader" },
      body: "on another dataset",
    })

    const view = await previewDatasetPage(get(), "ja", token, carriedId)

    expect(view.comments.map((one) => one.body)).toEqual(["on this dataset"])
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
    const [one] = await readComments(db, draftId)
    expect(one?.anchor).toEqual({ kind: "research-field", path: "summary.aims" })
    expect(one?.authorName).toBe("提供者")
    expect(one?.body).toBe("対象は何名ですか")
    expect(one?.bySignedIn).toBe(false)
  })

  it("refuses a comment nobody can be asked about, and writes nothing", async () => {
    const { draftId, token } = await sharedDraft()

    expect(await previewAction(
      post({ intent: "comment", path: "title", name: "  ", body: "text" }),
      token,
      RESEARCH,
    )).toEqual({ status: "invalid", problem: "name-required" })
    expect(await readComments(db, draftId)).toEqual([])
  })

  it("refuses an anchor that leads nowhere in the draft it claims to be about", async () => {
    const { draftId, token } = await sharedDraft()

    expect(await status(previewAction(
      post({ intent: "comment", path: "nowhere.at.all", name: "提供者", body: "text" }),
      token,
      RESEARCH,
    ))).toBe(400)
    expect(await readComments(db, draftId)).toEqual([])
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

  it("records which of the two marks a reader left, under their name", async () => {
    const { draftId, token } = await sharedDraft()

    // Answered on the same page rather than sent back: the page does not change
    // when a mark is pressed, and the answer is what says it arrived.
    expect(await previewAction(post({ intent: "acknowledge", kind: "commented", name: "提供者" }), token, RESEARCH))
      .toEqual({ status: "acknowledged", kind: "commented" })
    expect(await previewAction(post({ intent: "acknowledge", kind: "approved", name: "提供者" }), token, RESEARCH))
      .toEqual({ status: "acknowledged", kind: "approved" })

    const rows = await db
      .select({ kind: s.reviewAcknowledgement.kind, name: s.reviewAcknowledgement.actorName })
      .from(s.reviewAcknowledgement)
      .where(eq(s.reviewAcknowledgement.draftId, draftId))
    expect(rows).toEqual([{ kind: "commented", name: "提供者" }, { kind: "approved", name: "提供者" }])
  })

  it("sends a post made from the page back to the page, not to the address the router fetched", async () => {
    const { token } = await sharedDraft()
    const form = new FormData()
    for (const [name, value] of Object.entries({ intent: "comment", path: "summary.aims", at: "summary.aims", name: "提供者", body: "text" })) {
      form.set(name, value)
    }

    const outcome = await previewAction(
      new Request(`http://localhost/en/preview/${token}.data`, { method: "POST", body: form }),
      token,
      RESEARCH,
    )

    expect(outcome).toBeInstanceOf(Response)
    expect((outcome as Response).headers.get("location")).toBe(`/en/preview/${token}#summary.aims`)
  })

  /** A mark is written by anyone holding the link, as often as they like, so its name is held to a comment's limit. */
  it("refuses a mark under a name longer than a comment's, and writes nothing", async () => {
    const { draftId, token } = await sharedDraft()

    expect(await previewAction(post({ intent: "acknowledge", kind: "approved", name: "名".repeat(NAME_LIMIT + 1) }), token, RESEARCH))
      .toEqual({ status: "invalid", problem: "too-long" })
    expect(await db.select().from(s.reviewAcknowledgement).where(eq(s.reviewAcknowledgement.draftId, draftId)))
      .toEqual([])

    expect(await previewAction(post({ intent: "acknowledge", kind: "approved", name: "名".repeat(NAME_LIMIT) }), token, RESEARCH))
      .toEqual({ status: "acknowledged", kind: "approved" })
  })

  it("refuses a mark of a kind it does not know, and writes nothing", async () => {
    const { draftId, token } = await sharedDraft()

    expect(await status(previewAction(post({ intent: "acknowledge", kind: "lgtm", name: "提供者" }), token, RESEARCH)))
      .toBe(400)
    expect(await db.select().from(s.reviewAcknowledgement).where(eq(s.reviewAcknowledgement.draftId, draftId)))
      .toEqual([])
  })

  it("takes a comment on the draft as a whole, and refuses to write into the memo", async () => {
    const { draftId, token } = await sharedDraft()

    await previewAction(post({ intent: "comment", subject: "draft", name: "提供者", body: "全体について" }), token, RESEARCH)
    expect(await status(previewAction(post({ intent: "comment", subject: "memo", name: "提供者", body: "…" }), token, RESEARCH)))
      .toBe(400)

    expect((await readComments(db, draftId)).map((one) => [one.anchor, one.body]))
      .toEqual([[{ kind: "draft" }, "全体について"]])
  })

  it("writes nothing at all once the link is private", async () => {
    const { draftId, token } = await sharedDraft()
    await setDraftSharing(db, draftId, { enabled: false, expiresAt: null })

    expect(await status(previewAction(
      post({ intent: "comment", path: "title", name: "提供者", body: "text" }),
      token,
      RESEARCH,
    ))).toBe(404)
    expect(await readComments(db, draftId)).toEqual([])
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
      { name: "closed.zip", size: 1, isPublic: false, datasets: [] },
      { name: "open.zip", size: 2, isPublic: true, datasets: [] },
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
