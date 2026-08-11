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
} from "~/upstream/application-db.server"

import {
  addDatasetsFromUpstream,
  createResearchFromUpstream,
  createResearchWithDraft,
  saveDraftContent,
} from "./drafts.server"
import { readDatasetEntry, readDraft } from "./queries.server"
import { upstreamResearchAction, upstreamResearchPage } from "./templates.server"

/**
 * Writing a seeded draft, against the development database.
 *
 * The point of these is what must not happen: a label somebody else holds has to
 * leave nothing behind at all, because the identities and the pins are made
 * together and a half-made research is one nobody could find or finish
 * (docs/editing.md の「上流からの下書き」).
 */
const db = getDb()

const CURATOR = { sub: "0f3a-1b2c", name: "curator" }

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
    expect(entry?.baseContent).toBeNull()
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

  it("refuses a revision that has moved, and adds nothing", async () => {
    const at = await draft()
    await saveDraftContent(
      db,
      { draftId: at.draftId, revision: at.revision },
      { note: "", content: emptyResearchContent() },
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
    applicationId: "J-DS000136-010",
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
    return new Request("http://localhost:8080/admin/research/upstream", {
      method: "POST",
      headers,
      body: body.toString(),
    })
  }

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

    const view = await upstreamResearchPage(get(token, "?application=J-DS000136-010"), "ja")

    expect(view.branch?.heldBy).toBe(held.researchId)
    expect(view.rows[0]?.heldBy).toBe(held.researchId)
  })

  it("names the research an accession already belongs to, so it is not offered twice", async () => {
    const token = await signIn()
    const held = await createResearchFromUpstream(db, seed(null, ["JGAD000891"]), CURATOR)
    if (held.status !== "created") throw new Error(held.status)

    const view = await upstreamResearchPage(get(token, "?application=J-DS000136-010"), "ja")

    expect(view.chosen?.datasets).toEqual([
      expect.objectContaining({ accession: "JGAD000891", heldBy: held.researchId }),
    ])
  })

  it("creates only the datasets the application registered, whatever the form asked for", async () => {
    const token = await signIn()

    const answer = await upstreamResearchAction(
      post(token, [
        ["application", "J-DS000136-010"],
        ["accession", "JGAD000891"],
        ["accession", "JGAD999999"],
      ]),
      "ja",
    )

    expect(answer).toBeInstanceOf(Response)
    expect(await pinnedLabels("dataset")).toEqual(["JGAD000891"])
  })

  it("writes the study's own words, and no email for the investigator", async () => {
    const token = await signIn()

    await upstreamResearchAction(
      post(token, [["application", "J-DS000136-010"], ["accession", "JGAD000891"]]),
      "ja",
    )

    const [draftId] = (await db.select({ id: s.researchDraft.id }).from(s.researchDraft))
      .map((row) => row.id)
    const content = (await readDraft(db, draftId ?? ""))?.content
    expect(content?.title.ja).toEqual(filled("ゲノム解析"))
    expect(content?.dataProviders[0]?.email).toEqual(filled(""))
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
