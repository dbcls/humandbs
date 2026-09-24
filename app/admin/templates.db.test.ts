import { and, eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

/** The two systems outside v2, which docs/testing.md allows replacing. */
vi.mock("~/upstream/application-db.server", () => ({
  openApplicationDb: vi.fn(() => ({ end: vi.fn(() => Promise.resolve()) })),
  searchDsBranches: vi.fn(),
  fetchDsBranch: vi.fn(),
  fetchJgadRegistrations: vi.fn(),
  fetchAccessionBranchId: vi.fn(),
}))

vi.mock("~/upstream/dra.server", () => ({ fetchDraSubmission: vi.fn() }))

import { grantAdmin } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { createSession, sessionCookie } from "~/auth/session.server"
import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DatasetContent } from "~/content/types"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import {
  fetchAccessionBranchId,
  fetchDsBranch,
  fetchJgadRegistrations,
  searchDsBranches,
  type DsBranchDetail,
  type DsBranchRow,
} from "~/upstream/application-db.server"

import {
  addDatasetsFromUpstream,
  applyUpstreamToDraft,
  createResearchFromUpstream,
  createEmptyDraft,
  createResearchWithDraft,
  saveDraftContent,
} from "./drafts.server"
import { researchContentInput } from "./form"
import { readDatasetEntry, readDraft } from "./queries.server"
import {
  upstreamBranchAction,
  upstreamBranchPage,
  upstreamDatasetPage,
  upstreamResearchPage,
} from "./templates.server"
import { takeAction, takePage } from "./take.server"

/**
 * Writing a seeded draft, against the development database.
 *
 * The point of these is what must not happen: a label somebody else holds has to
 * leave nothing behind at all, because the identities and the pins are made
 * together and a half-made research is one nobody could find or finish
 * (docs/editing.md の「下書きを外から作る」).
 */
const db = getDb()

const CURATOR = { sub: "0f3a-1b2c", name: "curator" }

/** The approval branch every test here reads. */
const BRANCH = "J-DS000136-010"

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

function described(text: string): DatasetContent {
  return {
    ...emptyDatasetContent(),
    experiments: [{ id: "experiment-1", label: filled(text), values: [] }],
  }
}

const seed = (humLabel: string | null, accessions: string[]) => ({
  humLabel,
  content: emptyResearchContent(),
  datasets: accessions.map((label) => ({ label, content: described(label) })),
})

async function pinnedLabels(kind: "hum" | "dataset"): Promise<string[]> {
  const rows = await db
    .select({ label: s.labelPin.label })
    .from(s.labelPin)
    .where(eq(s.labelPin.kind, kind))
  return rows.map((row) => row.label).sort()
}

describe("starting a research from an application", () => {
  it("pins the hum label and every accession as the identities are made", async () => {
    const outcome = await createResearchFromUpstream(
      db,
      seed("hum0522", ["JGAD000891", "JGAD000892"]),
      CURATOR,
    )

    expect(outcome.status).toBe("created")
    expect(await pinnedLabels("hum")).toEqual(["hum0522"])
    expect(await pinnedLabels("dataset")).toEqual(["JGAD000891", "JGAD000892"])
  })

  it("lists the datasets it made, so none of them is created and then lost", async () => {
    const outcome = await createResearchFromUpstream(db, seed("hum0522", ["JGAD000891"]), CURATOR)
    if (outcome.status !== "created") throw new Error(outcome.status)

    const draft = await readDraft(db, outcome.draftId)
    const rows = await db.select({ id: s.dataset.id }).from(s.dataset)
    expect(draft?.content.datasetIds).toEqual(rows.map((row) => row.id))
  })

  it("writes each dataset's description as a change entry with no published base", async () => {
    const outcome = await createResearchFromUpstream(db, seed("hum0522", ["JGAD000891"]), CURATOR)
    if (outcome.status !== "created") throw new Error(outcome.status)

    const [datasetId] = (await db.select({ id: s.dataset.id }).from(s.dataset)).map((row) => row.id)
    const entry = await readDatasetEntry(db, outcome.draftId, datasetId ?? "")
    expect(entry?.content).toEqual(described("JGAD000891"))
  })

  it("leaves the datasets in the draft's hands, so discarding takes them with it", async () => {
    const outcome = await createResearchFromUpstream(db, seed("hum0522", ["JGAD000891"]), CURATOR)
    if (outcome.status !== "created") throw new Error(outcome.status)

    const rows = await db.select({ origin: s.dataset.originDraftId }).from(s.dataset)
    expect(rows.map((row) => row.origin)).toEqual([outcome.draftId])
  })

  it("creates nothing at all when the hum label already names something", async () => {
    await createResearchFromUpstream(db, seed("hum0522", []), CURATOR)

    const again = await createResearchFromUpstream(db, seed("hum0522", ["JGAD000891"]), CURATOR)

    expect(again).toEqual({ status: "taken", label: "hum0522" })
    expect(await db.select().from(s.research)).toHaveLength(1)
    expect(await pinnedLabels("dataset")).toEqual([])
  })

  it("creates nothing at all when one of the accessions is already pinned", async () => {
    await createResearchFromUpstream(db, seed("hum0001", ["JGAD000891"]), CURATOR)

    const again = await createResearchFromUpstream(
      db,
      seed("hum0002", ["JGAD000892", "JGAD000891"]),
      CURATOR,
    )

    expect(again).toEqual({ status: "taken", label: "JGAD000891" })
    expect(await pinnedLabels("hum")).toEqual(["hum0001"])
    expect(await pinnedLabels("dataset")).toEqual(["JGAD000891"])
  })

  it("starts a research with no hum label, because a number may not have been issued", async () => {
    const outcome = await createResearchFromUpstream(db, seed(null, ["JGAD000891"]), CURATOR)

    expect(outcome.status).toBe("created")
    expect(await pinnedLabels("hum")).toEqual([])
  })

  it("records every pin in the trail, under the label it attached", async () => {
    await createResearchFromUpstream(db, seed("hum0522", ["JGAD000891"]), CURATOR)

    const rows = await db
      .select({ subject: s.event.subjectId })
      .from(s.event)
      .where(eq(s.event.action, "pin-label"))
    expect(rows.map((row) => row.subject).sort()).toEqual(["JGAD000891", "hum0522"])
  })
})

describe("adding datasets to a draft from upstream", () => {
  async function draft() {
    const created = await createResearchWithDraft(db)
    const at = await readDraft(db, created.draftId)
    return { ...created, revision: at?.revision ?? 0 }
  }

  it("appends to what the version lists and moves the revision on", async () => {
    const at = await draft()

    const outcome = await addDatasetsFromUpstream(
      db,
      { draftId: at.draftId, revision: at.revision },
      { researchId: at.researchId, datasets: [{ label: "DRA000123", content: described("WGS") }] },
      CURATOR,
    )

    expect(outcome.status).toBe("added")
    const after = await readDraft(db, at.draftId)
    expect(after?.revision).toBe(at.revision + 1)
    expect(after?.content.datasetIds).toHaveLength(1)
    expect(await pinnedLabels("dataset")).toEqual(["DRA000123"])
  })

  it("leaves what had no choice as one comment per field, by the curator who made it, and none for a value with no field", async () => {
    const at = await draft()
    const drop = (value: string, where: string | null) => ({ keyCode: "platform", keyLabel: "プラットフォーム", value, at: where })

    const outcome = await addDatasetsFromUpstream(
      db,
      { draftId: at.draftId, revision: at.revision },
      {
        researchId: at.researchId,
        datasets: [{
          label: "DRA000123",
          content: described("WGS"),
          dropped: [
            drop("DNBSEQ-T7", "experiments.e1.values.k1"),
            drop("MGISEQ-2000", "experiments.e1.values.k1"),
            drop("DNBSEQ-T7", "experiments.e1.values.k1"),
            drop("no field", null),
          ],
        }],
      },
      CURATOR,
    )

    expect(outcome.status).toBe("added")
    const datasetId = outcome.status === "added" ? outcome.datasetIds[0] : ""
    const comments = await db.select().from(s.comment).where(eq(s.comment.draftId, at.draftId))
    expect(comments.map((one) => ({ anchor: one.anchor, body: one.body, sub: one.authorSub, name: one.authorName, resolved: one.resolved })))
      .toEqual([{
        anchor: { kind: "dataset-field", datasetId, path: "experiments.e1.values.k1" },
        body: "申請・登録情報の値「DNBSEQ-T7」「MGISEQ-2000」は選択肢に無いため、反映していません。",
        sub: CURATOR.sub,
        name: CURATOR.name,
        resolved: false,
      }])
  })

  it("writes no comment and no dataset when the revision has moved", async () => {
    const at = await draft()
    await saveDraftContent(db, { draftId: at.draftId, revision: at.revision }, { content: emptyResearchContent() })

    await addDatasetsFromUpstream(
      db,
      { draftId: at.draftId, revision: at.revision },
      {
        researchId: at.researchId,
        datasets: [{ label: "DRA000123", content: described("WGS"), dropped: [{ keyCode: "platform", keyLabel: "platform", value: "X", at: "values.k1" }] }],
      },
      CURATOR,
    )

    expect(await db.select().from(s.comment)).toEqual([])
  })

  it("refuses a revision that has moved, and adds nothing", async () => {
    const at = await draft()
    await saveDraftContent(
      db,
      { draftId: at.draftId, revision: at.revision },
      { content: emptyResearchContent() },
    )

    const outcome = await addDatasetsFromUpstream(
      db,
      { draftId: at.draftId, revision: at.revision },
      { researchId: at.researchId, datasets: [{ label: "DRA000123", content: described("WGS") }] },
      CURATOR,
    )

    expect(outcome).toEqual({ status: "conflict" })
    expect(await db.select().from(s.dataset)).toHaveLength(0)
    expect(await pinnedLabels("dataset")).toEqual([])
  })

  it("adds nothing when one of the accessions is already pinned elsewhere", async () => {
    await createResearchFromUpstream(db, seed("hum0001", ["JGAD000891"]), CURATOR)
    const at = await draft()

    const outcome = await addDatasetsFromUpstream(
      db,
      { draftId: at.draftId, revision: at.revision },
      {
        researchId: at.researchId,
        datasets: [
          { label: "JGAD000999", content: described("new") },
          { label: "JGAD000891", content: described("taken") },
        ],
      },
      CURATOR,
    )

    expect(outcome).toEqual({ status: "taken", label: "JGAD000891" })
    expect(await pinnedLabels("dataset")).toEqual(["JGAD000891"])
    const after = await readDraft(db, at.draftId)
    expect(after?.content.datasetIds).toEqual([])
    expect(after?.revision).toBe(at.revision)
  })

  it("answers gone for a draft that is no longer there", async () => {
    const at = await draft()
    await db.delete(s.researchDraft).where(eq(s.researchDraft.id, at.draftId))

    const outcome = await addDatasetsFromUpstream(
      db,
      { draftId: at.draftId, revision: at.revision },
      { researchId: at.researchId, datasets: [{ label: "DRA000123", content: described("WGS") }] },
      CURATOR,
    )

    expect(outcome).toEqual({ status: "gone" })
  })

  it("puts the new datasets in this draft's hands and under this research", async () => {
    const at = await draft()
    await addDatasetsFromUpstream(
      db,
      { draftId: at.draftId, revision: at.revision },
      { researchId: at.researchId, datasets: [{ label: "DRA000123", content: described("WGS") }] },
      CURATOR,
    )

    const rows = await db
      .select({ id: s.dataset.id })
      .from(s.dataset)
      .where(and(
        eq(s.dataset.researchId, at.researchId),
        eq(s.dataset.originDraftId, at.draftId),
      ))
    expect(rows).toHaveLength(1)
  })
})

/**
 * The screen with its guards on. What can still break here is the wiring: a
 * deployment with no connection has to say so rather than answer as though the
 * upstream held nothing, and the form has to be unable to name a dataset the
 * application never registered.
 */
describe("the screen that starts a research from an application", () => {
  const SIGNED_IN = { sub: "0f3a-1b2c", name: "curator", idToken: "an-id-token" }

  const branch: DsBranchDetail = {
    applicationId: BRANCH,
    humLabel: "hum0522",
    approvedOn: "2024-05-18",
    titleJa: "ゲノム解析",
    titleEn: "A genome study",
    piNameJa: "田中 太郎",
    piNameEn: "Taro Tanaka",
    accessions: ["JGAD000891", "JGAS000720"],
    aimsJa: "目的",
    aimsEn: "",
    methodsJa: "方法",
    methodsEn: "",
    targetsJa: "対象",
    targetsEn: "",
    affiliationJa: "大学",
    affiliationEn: "University",
    country: "Japan",
    dataAccess: 2,
    icd10: "C34.9",
  }

  beforeEach(() => {
    vi.mocked(searchDsBranches).mockReset().mockResolvedValue([branch])
    vi.mocked(fetchDsBranch).mockReset().mockResolvedValue(branch)
    vi.mocked(fetchAccessionBranchId).mockReset().mockResolvedValue(null)
    vi.mocked(fetchJgadRegistrations).mockReset().mockResolvedValue([
      { accession: "JGAD000891", title: "A cohort", datasetType: "WGS" },
    ])
    process.env.HUMANDBS_JGA_DATABASE_URL = "postgres://reader:secret@jga:5432/jgadb"
  })

  afterAll(() => {
    delete process.env.HUMANDBS_JGA_DATABASE_URL
  })

  async function signIn(): Promise<string> {
    const token = await createSession(db, SIGNED_IN)
    await grantAdmin(db, BOOTSTRAP_ACTOR, SIGNED_IN)
    return token
  }

  function get(token: string, query: string): Request {
    const headers = new Headers({ cookie: sessionCookie(token).split(";")[0] ?? "" })
    return new Request(`http://localhost:8080/admin/research/upstream${query}`, { headers })
  }

  function post(token: string, fields: [string, string][]): Request {
    const headers = new Headers({
      "content-type": "application/x-www-form-urlencoded",
      "cookie": sessionCookie(token).split(";")[0] ?? "",
    })
    const body = new URLSearchParams()
    for (const [name, value] of fields) body.append(name, value)
    return new Request(`http://localhost:8080/admin/research/upstream/${BRANCH}`, {
      method: "POST",
      headers,
      body: body.toString(),
    })
  }

  const at = { applicationId: BRANCH }

  it("says it cannot reach the application system rather than answering as if it were empty", async () => {
    delete process.env.HUMANDBS_JGA_DATABASE_URL
    const token = await signIn()

    const view = await upstreamResearchPage(get(token, ""), "ja")

    expect(view.connected).toBe(false)
    expect(view.rows).toEqual([])
  })

  it("names the research a hum label already belongs to, instead of offering to start one", async () => {
    const token = await signIn()
    const held = await createResearchFromUpstream(db, seed("hum0522", []), CURATOR)
    if (held.status !== "created") throw new Error(held.status)

    const view = await upstreamBranchPage(get(token, ""), "ja", at)
    const listing = await upstreamResearchPage(get(token, ""), "ja")

    expect(view.holder?.researchId).toBe(held.researchId)
    expect(listing.rows[0]?.heldBy).toBe(held.researchId)
  })

  it("narrows by what the portal holds, which is the answer the application system has not got", async () => {
    const token = await signIn()
    const held = await createResearchFromUpstream(db, seed("hum0522", []), CURATOR)
    if (held.status !== "created") throw new Error(held.status)

    const kept = await upstreamResearchPage(get(token, "?standing=held"), "ja")
    const dropped = await upstreamResearchPage(get(token, "?standing=absent"), "ja")

    expect(kept.rows.map((row) => row.applicationId)).toEqual([BRANCH])
    expect(kept.total).toBe(1)
    expect(dropped.rows).toEqual([])
    expect(dropped.total).toBe(0)
    // The page is cut here, so upstream is asked for every branch that matched.
    expect(vi.mocked(searchDsBranches)).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      "",
      null,
    )
  })

  it("offers no form at all once the hum already names a research", async () => {
    const token = await signIn()
    const held = await createResearchFromUpstream(db, seed("hum0522", []), CURATOR)
    if (held.status !== "created") throw new Error(held.status)

    const view = await upstreamBranchPage(get(token, ""), "ja", at)

    expect(view.holder).toEqual({ researchId: held.researchId, humLabel: "hum0522" })
  })

  it("refuses to take a branch into an existing draft or version from this screen", async () => {
    const token = await signIn()
    const held = await createResearchFromUpstream(db, seed("hum0522", []), CURATOR)
    if (held.status !== "created") throw new Error(held.status)

    const intoDraft = await upstreamBranchAction(
      post(token, [["into", `draft:${held.draftId}`]]),
      "ja",
      at,
    ).then(() => null, (error: unknown) => error)
    const intoVersion = await upstreamBranchAction(
      post(token, [["into", "version:1"], ["research", held.researchId]]),
      "ja",
      at,
    ).then(() => null, (error: unknown) => error)

    expect((intoDraft as Response).status).toBe(400)
    expect((intoVersion as Response).status).toBe(400)
    // Nothing about the existing draft moved: no second draft, no dataset pinned.
    expect(await db.select().from(s.researchDraft)).toHaveLength(1)
    expect(await pinnedLabels("dataset")).toEqual([])
  })

  it("names the research an accession already belongs to, so it is not offered twice", async () => {
    const token = await signIn()
    const held = await createResearchFromUpstream(db, seed(null, ["JGAD000891"]), CURATOR)
    if (held.status !== "created") throw new Error(held.status)

    const view = await upstreamBranchPage(get(token, ""), "ja", at)

    expect(view.chosen?.datasets).toEqual([
      expect.objectContaining({ accession: "JGAD000891", heldBy: held.researchId }),
    ])
  })

  /** A draft of a research another hum names, to aim the branch screens at. */
  async function otherDraft(): Promise<{ researchId: string, draftId: string }> {
    const made = await createResearchFromUpstream(
      db,
      seed("hum0600", []),
      CURATOR,
    )
    if (made.status !== "created") throw new Error(made.status)
    return { researchId: made.researchId, draftId: made.draftId }
  }

  /** A row `searchDsBranches` could answer with, shaped like the mocked one. */
  function branchRow(overrides: Partial<DsBranchRow> = {}): DsBranchRow {
    return {
      applicationId: branch.applicationId,
      humLabel: branch.humLabel,
      approvedOn: branch.approvedOn,
      titleJa: branch.titleJa,
      titleEn: branch.titleEn,
      piNameJa: branch.piNameJa,
      piNameEn: branch.piNameEn,
      accessions: branch.accessions,
      ...overrides,
    }
  }

  function draftGet(researchId: string, draftId: string, token: string, query = ""): Request {
    const headers = new Headers({ cookie: sessionCookie(token).split(";")[0] ?? "" })
    return new Request(
      `http://localhost:8080/admin/research/${researchId}/draft/${draftId}/take${query}`,
      { headers },
    )
  }

  function draftPost(researchId: string, draftId: string, token: string, fields: [string, string][]): Request {
    const headers = new Headers({ cookie: sessionCookie(token).split(";")[0] ?? "" })
    const body = new FormData()
    for (const [name, value] of fields) body.append(name, value)
    return new Request(
      `http://localhost:8080/admin/research/${researchId}/draft/${draftId}/take`,
      { method: "POST", headers, body },
    )
  }

  async function revisionOf(draftId: string): Promise<number> {
    const draft = await readDraft(db, draftId)
    if (draft === null) throw new Error("no draft")
    return draft.revision
  }

  describe("the draft's own screen for taking values in", () => {
    it("reads only this research's own branches, filtered on the exact hum", async () => {
      const token = await signIn()
      const own = await otherDraft()
      // A row whose hum only *contains* the searched one is not this research's.
      vi.mocked(searchDsBranches).mockResolvedValue([
        branchRow({ humLabel: "hum0600" }),
        branchRow({ applicationId: "J-DS000999-002", humLabel: "hum06000" }),
      ])

      const view = await takePage(draftGet(own.researchId, own.draftId, token), "ja", own)

      expect(view.application.connected).toBe(true)
      expect(view.chosen).toBeNull()
      expect(view.application.branches.map((row) => row.applicationId)).toEqual([BRANCH])
      expect(vi.mocked(searchDsBranches))
        .toHaveBeenLastCalledWith(expect.anything(), expect.anything(), "hum0600", null)
    })

    it("reads no branches and asks upstream nothing before a hum is issued", async () => {
      const token = await signIn()
      const made = await createResearchFromUpstream(db, seed(null, []), CURATOR)
      if (made.status !== "created") throw new Error(made.status)
      vi.mocked(searchDsBranches).mockClear()

      const view = await takePage(
        draftGet(made.researchId, made.draftId, token),
        "ja",
        { researchId: made.researchId, draftId: made.draftId },
      )

      expect(view.application.connected).toBe(true)
      expect(view.application.branches).toEqual([])
      expect(vi.mocked(searchDsBranches)).not.toHaveBeenCalled()
    })

    /** The row of the draft being written stands in the table, and cannot be taken from. */
    it("lists the research's drafts as sources, this one among them, and refuses to take this one into itself", async () => {
      const token = await signIn()
      const own = await otherDraft()
      const other = await createEmptyDraft(db, own.researchId)

      const view = await takePage(draftGet(own.researchId, own.draftId, token), "ja", own)

      expect(view.rows.map((row) => row.kind === "draft" ? row.id : null).toSorted())
        .toEqual([other, own.draftId].toSorted())
      const self: unknown = await takePage(draftGet(own.researchId, own.draftId, token, `?draft=${own.draftId}`), "ja", own)
        .then(() => null, (thrown: unknown) => thrown)
      expect((self as Response).status).toBe(404)
    })

    it("turns into the face once an application is chosen, laid over the draft", async () => {
      const token = await signIn()
      const own = await otherDraft()

      const view = await takePage(
        draftGet(own.researchId, own.draftId, token, `?application=${BRANCH}`),
        "ja",
        own,
      )

      const source = view.chosen?.source
      if (source?.kind !== "application") throw new Error("no application chosen")
      expect(source.applicationId).toBe(BRANCH)
      expect(view.chosen?.theirs.content.title.ja).toEqual({ state: "value", text: "ゲノム解析" })
      // The branch's own hum (hum0522) is not the draft's (hum0600) — carried so
      // the face can say so, rather than pretending they agree.
      expect(view.humLabel).toBe("hum0600")
      expect(source.branch.humLabel).toBe("hum0522")
    })

    it("says an application ID is unknown rather than reporting the system unreachable", async () => {
      const token = await signIn()
      const own = await otherDraft()
      vi.mocked(fetchDsBranch).mockResolvedValue(null)

      const view = await takePage(
        draftGet(own.researchId, own.draftId, token, "?application=J-DS999999-001"),
        "ja",
        own,
      )

      expect(view.application.connected).toBe(true)
      expect(view.application.unknown).toBe("J-DS999999-001")
      expect(view.chosen).toBeNull()
    })

    it("sets another draft's reading beside this one", async () => {
      const token = await signIn()
      const own = await otherDraft()
      const other = await createEmptyDraft(db, own.researchId)
      await saveDraftContent(db, { draftId: other, revision: await revisionOf(other) }, {
        content: { ...emptyResearchContent(), title: { ja: filled("別の下書き"), en: filled("") } },
      })

      const view = await takePage(draftGet(own.researchId, own.draftId, token, `?draft=${other}`), "ja", own)

      expect(view.chosen?.source).toEqual(expect.objectContaining({ kind: "draft", id: other }))
      expect(view.chosen?.theirs.content.title.ja).toEqual({ state: "value", text: "別の下書き" })
    })

    it("does not take a draft of another research as a source", async () => {
      const token = await signIn()
      const own = await otherDraft()
      const elsewhere = await createResearchWithDraft(db)

      const answer: unknown = await takePage(
        draftGet(own.researchId, own.draftId, token, `?draft=${elsewhere.draftId}`),
        "ja",
        own,
      ).then(() => null, (thrown: unknown) => thrown)

      expect((answer as Response).status).toBe(404)
    })

    it("writes what the face holds, keeping the draft's own dataset list", async () => {
      const token = await signIn()
      const made = await createResearchFromUpstream(db, seed("hum0522", ["JGAD000891"]), CURATOR)
      if (made.status !== "created") throw new Error(made.status)
      const before = await readDraft(db, made.draftId)
      const written = {
        ...researchContentInput(before?.content ?? emptyResearchContent()),
        title: { ja: { state: "value", text: "決めた題目" }, en: { state: "unknown", text: "" } },
        datasetIds: [],
      }

      const answer = await takeAction(
        draftPost(made.researchId, made.draftId, token, [
          ["revision", String(before?.revision)],
          ["content", JSON.stringify(written)],
        ]),
        "ja",
        made,
      )

      expect(answer).toBeInstanceOf(Response)
      const after = await readDraft(db, made.draftId)
      expect(after?.content.title).toEqual({ ja: filled("決めた題目"), en: { state: "unknown" } })
      expect(after?.content.datasetIds).toEqual(before?.content.datasetIds)
    })

    it("refuses a face opened before somebody else saved the draft", async () => {
      const token = await signIn()
      const own = await otherDraft()
      const stale = await revisionOf(own.draftId)
      await saveDraftContent(db, { draftId: own.draftId, revision: stale }, { content: emptyResearchContent() })

      const answer = await takeAction(
        draftPost(own.researchId, own.draftId, token, [
          ["revision", String(stale)],
          ["content", JSON.stringify(researchContentInput(emptyResearchContent()))],
        ]),
        "ja",
        own,
      )

      expect(answer).toEqual({ status: "conflict" })
    })

    it("refuses a cited dataset the research does not hold", async () => {
      const token = await signIn()
      const own = await otherDraft()
      const content = researchContentInput(emptyResearchContent())
      const citing = {
        ...content,
        relatedPublications: [{
          id: "p1",
          title: { state: "value", text: "論文" },
          doi: { state: "value", text: "" },
          datasetIds: ["not-this-research"],
        }],
      }

      const answer: unknown = await takeAction(
        draftPost(own.researchId, own.draftId, token, [
          ["revision", String(await revisionOf(own.draftId))],
          ["content", JSON.stringify(citing)],
        ]),
        "ja",
        own,
      ).then((value) => value, (thrown: unknown) => thrown)

      expect((answer as Response).status).toBe(400)
    })

    it("creates the ticked datasets when the source is an application", async () => {
      const token = await signIn()
      const own = await otherDraft()

      const answer = await takeAction(
        draftPost(own.researchId, own.draftId, token, [
          ["revision", String(await revisionOf(own.draftId))],
          ["content", JSON.stringify(researchContentInput(emptyResearchContent()))],
          ["application", BRANCH],
          ["accession", "JGAD000891"],
          ["accession", "JGAD999999"],
        ]),
        "ja",
        own,
      )

      expect(answer).toBeInstanceOf(Response)
      expect(await pinnedLabels("dataset")).toEqual(["JGAD000891"])
    })
  })

  it("chooses no application on the dataset screen, and a typed JGAD takes only itself", async () => {
    const token = await signIn()
    const aim = await otherDraft()
    vi.mocked(fetchAccessionBranchId).mockResolvedValue(BRANCH)
    const registeredTwo = { ...branch, accessions: ["JGAD000891", "JGAD000892", "JGAS000720"] }
    vi.mocked(fetchJgadRegistrations).mockResolvedValue([
      { accession: "JGAD000891", title: "A cohort", datasetType: "WGS" },
      { accession: "JGAD000892", title: "Another cohort", datasetType: "WES" },
    ])

    const named = await upstreamDatasetPage(get(token, `?application=${BRANCH}`), "ja", aim)
    expect(named.chosen).toBeNull()
    expect(vi.mocked(fetchDsBranch)).not.toHaveBeenCalled()

    vi.mocked(fetchDsBranch).mockResolvedValue(registeredTwo)
    const typed = await upstreamDatasetPage(get(token, "?accession=JGAD000892"), "ja", aim)
    expect(typed.chosen?.datasets.map((one) => one.accession)).toEqual(["JGAD000892"])
  })

  it("creates every dataset the application registered, whatever the form sends", async () => {
    const token = await signIn()

    const answer = await upstreamBranchAction(post(token, [["into", "new"], ["accession", "JGAD999999"]]), "ja", at)

    expect(answer).toBeInstanceOf(Response)
    expect(await pinnedLabels("dataset")).toEqual(["JGAD000891"])
  })

  it("creates the research from an application that has registered nothing yet", async () => {
    vi.mocked(fetchDsBranch).mockResolvedValue({ ...branch, accessions: [] })
    const token = await signIn()

    const answer = await upstreamBranchAction(post(token, [["into", "new"]]), "ja", at)

    expect(answer).toBeInstanceOf(Response)
    expect(await pinnedLabels("hum")).toEqual(["hum0522"])
    expect(await pinnedLabels("dataset")).toEqual([])
  })

  it("leaves out a dataset another research already holds, rather than refusing the creation", async () => {
    vi.mocked(fetchDsBranch).mockResolvedValue({ ...branch, accessions: ["JGAD000891", "JGAD000892"] })
    vi.mocked(fetchJgadRegistrations).mockResolvedValue([
      { accession: "JGAD000891", title: "A cohort", datasetType: "WGS" },
      { accession: "JGAD000892", title: "Another", datasetType: "WES" },
    ])
    const other = await createResearchFromUpstream(db, seed("hum0001", ["JGAD000892"]), CURATOR)
    if (other.status !== "created") throw new Error(other.status)
    const token = await signIn()

    const answer = await upstreamBranchAction(post(token, [["into", "new"]]), "ja", at)

    expect(answer).toBeInstanceOf(Response)
    expect(await pinnedLabels("dataset")).toEqual(["JGAD000891", "JGAD000892"])
    expect(await pinnedLabels("hum")).toEqual(["hum0001", "hum0522"])
  })

  it("takes the same branch again, because its accessions are registered afterwards", async () => {
    const made = await createResearchFromUpstream(db, seed("hum0522", []), CURATOR)
    if (made.status !== "created") throw new Error(made.status)

    await applyUpstreamToDraft(
      db,
      { draftId: made.draftId, revision: 1 },
      {
        researchId: made.researchId,
        content: emptyResearchContent(),
        datasets: [{ label: "JGAD000891", content: described("JGAD000891") }],
      },
      CURATOR,
    )

    expect(await pinnedLabels("dataset")).toEqual(["JGAD000891"])
  })

  it("writes the study's own words, and no email for the investigator", async () => {
    const token = await signIn()

    await upstreamBranchAction(post(token, [["into", "new"], ["accession", "JGAD000891"]]), "ja", at)

    const [draftId] = (await db.select({ id: s.researchDraft.id }).from(s.researchDraft))
      .map((row) => row.id)
    const content = (await readDraft(db, draftId ?? ""))?.content
    expect(content?.title.ja).toEqual(filled("ゲノム解析"))
    expect(Object.keys(content?.dataProviders[0] ?? {}).sort()).toEqual(["id", "name", "organization"])
    expect(content?.relatedPublications).toEqual([])
  })

  it("sends somebody who is not signed in to sign in, rather than reading the upstream", async () => {
    const request = new Request("http://localhost:8080/admin/research/upstream")

    const answer: unknown = await upstreamResearchPage(request, "ja")
      .then(() => null, (thrown: unknown) => thrown)

    expect(answer).toBeInstanceOf(Response)
    expect((answer as Response).status).toBe(302)
    expect(vi.mocked(searchDsBranches)).not.toHaveBeenCalled()
  })

  it("refuses somebody signed in who is not an administrator", async () => {
    const token = await createSession(db, { ...SIGNED_IN, sub: "9c8b-7a6d" })

    const answer: unknown = await upstreamResearchPage(get(token, ""), "ja")
      .then(() => null, (thrown: unknown) => thrown)

    expect((answer as Response).status).toBe(403)
  })
})
