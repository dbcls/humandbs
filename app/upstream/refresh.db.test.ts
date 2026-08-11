import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The contract `docs/data-model.md` の「外部キャッシュ」 states, exercised against
 * the real database with the two upstreams replaced — they are outside v2 and
 * are the boundary `docs/testing.md` allows mocking.
 *
 * What is being checked is not that rows arrive. It is what happens when they
 * do not: a source that fails has to leave every one of its rows exactly as
 * they were, because the portal cannot tell a system that is briefly silent
 * from one that deleted a value, and it must not take the sources that did
 * answer down with it.
 */

vi.mock("./application-db.server", () => ({
  openApplicationDb: vi.fn(() => ({ end: vi.fn(() => Promise.resolve()) })),
  fetchCauEntries: vi.fn(),
  fetchHumAccessions: vi.fn(),
  fetchJgadDates: vi.fn(),
}))

vi.mock("./ddbj-search.server", () => ({ fetchArchiveEntry: vi.fn() }))

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import {
  fetchCauEntries,
  fetchHumAccessions,
  fetchJgadDates,
} from "./application-db.server"
import { fetchArchiveEntry } from "./ddbj-search.server"
import { claimDueSources, runUpstreamRefresh } from "./refresh.server"

const db = getDb()

const CONNECTED = "postgres://reader:secret@jga:5432/jgadb"

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
  vi.mocked(fetchCauEntries).mockReset()
  vi.mocked(fetchHumAccessions).mockReset()
  vi.mocked(fetchJgadDates).mockReset()
  vi.mocked(fetchArchiveEntry).mockReset()
  process.env.HUMANDBS_JGA_DATABASE_URL = CONNECTED
})

afterAll(async () => {
  delete process.env.HUMANDBS_JGA_DATABASE_URL
  await closePools()
})

function cauRow(applicationId: string, humLabel = "hum0001") {
  return {
    humLabel,
    applicationId,
    piNameJa: "山田 太郎",
    piNameEn: "Taro Yamada",
    affiliationJa: "研究科, 大学",
    affiliationEn: "School, University",
    country: "Japan",
    researchTitleJa: "課題",
    researchTitleEn: "Project",
    periodStart: "2023-04-01",
    periodEnd: "2024-03-31",
    datasetAccessions: ["JGAD000001"],
  }
}

describe("a source that fails", () => {
  it("leaves its rows where they were rather than emptying the cache", async () => {
    vi.mocked(fetchCauEntries).mockResolvedValueOnce([cauRow("J-DU000001")])
    await runUpstreamRefresh(db, ["cau"])

    vi.mocked(fetchCauEntries).mockRejectedValueOnce(new Error("connection refused"))
    const outcomes = await runUpstreamRefresh(db, ["cau"])

    expect(outcomes).toEqual([
      { source: "cau", status: "failed", failure: "connection refused" },
    ])
    const rows = await db.select().from(s.cauEntry)
    expect(rows.map((row) => row.applicationId)).toEqual(["J-DU000001"])
  })

  it("keeps the last success beside the failure, because that is what the rows still are", async () => {
    vi.mocked(fetchCauEntries).mockResolvedValueOnce([cauRow("J-DU000001")])
    await runUpstreamRefresh(db, ["cau"])
    const [afterSuccess] = await db.select().from(s.upstreamRefresh)

    vi.mocked(fetchCauEntries).mockRejectedValueOnce(new Error("connection refused"))
    await runUpstreamRefresh(db, ["cau"])
    const [afterFailure] = await db.select().from(s.upstreamRefresh)

    expect(afterFailure?.succeededAt).toEqual(afterSuccess?.succeededAt)
    expect(afterFailure?.rowCount).toBe(1)
    expect(afterFailure?.failure).toBe("connection refused")
    expect(afterFailure?.attemptedAt.getTime()).toBeGreaterThanOrEqual(
      afterSuccess?.attemptedAt.getTime() ?? 0,
    )
  })

  it("does not take a source that answered down with it", async () => {
    vi.mocked(fetchCauEntries).mockRejectedValueOnce(new Error("connection refused"))
    vi.mocked(fetchHumAccessions).mockResolvedValueOnce([
      { accession: "JGAD000001", humLabel: "hum0001", kind: "jga-dataset" },
    ])

    const outcomes = await runUpstreamRefresh(db, ["cau", "hum-accession"])

    expect(outcomes.map((outcome) => outcome.status)).toEqual(["failed", "written"])
    expect(await db.select().from(s.humAccession)).toHaveLength(1)
  })
})

describe("a source that answers", () => {
  it("replaces its rows entirely, so what upstream no longer holds goes away", async () => {
    vi.mocked(fetchCauEntries).mockResolvedValueOnce([cauRow("J-DU000001"), cauRow("J-DU000002")])
    await runUpstreamRefresh(db, ["cau"])

    vi.mocked(fetchCauEntries).mockResolvedValueOnce([cauRow("J-DU000002")])
    await runUpstreamRefresh(db, ["cau"])

    const rows = await db.select().from(s.cauEntry)
    expect(rows.map((row) => row.applicationId)).toEqual(["J-DU000002"])
  })

  it("records how many rows it wrote", async () => {
    vi.mocked(fetchJgadDates).mockResolvedValueOnce([
      { accession: "JGAD000001", datePublished: "2020-09-28", dateModified: "2020-09-28" },
      { accession: "JGAD000002", datePublished: "2021-03-01", dateModified: null },
    ])
    const outcomes = await runUpstreamRefresh(db, ["jgad-date"])

    expect(outcomes).toEqual([{ source: "jgad-date", status: "written", rowCount: 2 }])
    const [row] = await db.select().from(s.upstreamRefresh)
    expect(row?.rowCount).toBe(2)
    expect(row?.failure).toBeNull()
  })
})

/**
 * Two upstreams write `accession_date`, so replacing "its rows" has to mean
 * something narrower than the table.
 */
describe("the dates, which two upstreams share", () => {
  it("replaces only its own source's rows", async () => {
    vi.mocked(fetchJgadDates).mockResolvedValueOnce([
      { accession: "JGAD000001", datePublished: "2020-09-28", dateModified: null },
    ])
    vi.mocked(fetchArchiveEntry).mockResolvedValue({ datePublished: "2010-03-26", dateModified: null })
    await pinDataset(await aResearch(), "DRA000001")

    await runUpstreamRefresh(db, ["jgad-date"])
    await runUpstreamRefresh(db, ["archive-date"])

    const rows = await db.select().from(s.accessionDate)
    expect(rows.map((row) => row.accession).sort()).toEqual(["DRA000001", "JGAD000001"])
  })

  it("takes over a row another source was holding, rather than colliding with it", async () => {
    await db.insert(s.accessionDate).values({
      accession: "JGAD000001",
      datePublished: "2013-01-01",
      dateModified: null,
      source: "v1-dump",
    })

    vi.mocked(fetchJgadDates).mockResolvedValueOnce([
      { accession: "JGAD000001", datePublished: "2020-09-28", dateModified: "2024-01-05" },
    ])
    await runUpstreamRefresh(db, ["jgad-date"])

    const [row] = await db.select().from(s.accessionDate)
    expect(row).toMatchObject({
      accession: "JGAD000001",
      datePublished: "2020-09-28",
      source: "jgad-date",
    })
  })

  it("asks DDBJ Search only about the accessions it answers for", async () => {
    const researchId = await aResearch()
    await pinDataset(researchId, "DRA000001")
    await pinDataset(researchId, "JGAD000009")
    await pinDataset(researchId, "hum0001-NHA001")
    vi.mocked(fetchArchiveEntry).mockResolvedValue({ datePublished: "2010-03-26", dateModified: null })

    await runUpstreamRefresh(db, ["archive-date"])

    expect(vi.mocked(fetchArchiveEntry).mock.calls).toEqual([["sra-submission", "DRA000001"]])
  })

  it("drops an accession upstream does not hold, which is an answer and not an outage", async () => {
    const researchId = await aResearch()
    await pinDataset(researchId, "DRA000001")
    await db.insert(s.accessionDate).values({
      accession: "DRA000001",
      datePublished: "2010-03-26",
      dateModified: null,
      source: "archive-date",
    })
    vi.mocked(fetchArchiveEntry).mockResolvedValue(null)

    const outcomes = await runUpstreamRefresh(db, ["archive-date"])

    expect(outcomes).toEqual([{ source: "archive-date", status: "written", rowCount: 0 }])
    expect(await db.select().from(s.accessionDate)).toHaveLength(0)
  })
})

describe("without a connection to the application system", () => {
  beforeEach(() => {
    delete process.env.HUMANDBS_JGA_DATABASE_URL
  })

  it("skips the three sources that read it rather than failing them", async () => {
    const outcomes = await runUpstreamRefresh(db, ["cau", "hum-accession", "jgad-date"])

    expect(outcomes.every((outcome) => outcome.status === "skipped")).toBe(true)
    expect(vi.mocked(fetchCauEntries)).not.toHaveBeenCalled()
  })

  it("leaves no record, because the table answers how the last fetch went", async () => {
    await runUpstreamRefresh(db, ["cau", "hum-accession", "jgad-date"])

    expect(await db.select().from(s.upstreamRefresh)).toHaveLength(0)
  })
})

/**
 * Several application processes run the loop, so what stops two of them
 * querying upstream at once is that the claim is one statement.
 */
describe("claiming a due source", () => {
  const interval = { refreshMs: 24 * 60 * 60 * 1000, attemptTimeoutMs: 60 * 60 * 1000 }
  const now = new Date("2026-08-11T03:00:00Z")

  it("claims a source that has never been fetched", async () => {
    expect(await claimDueSources(db, ["cau"], now, interval)).toEqual(["cau"])
  })

  it("does not claim it a second time while the first attempt is in flight", async () => {
    await claimDueSources(db, ["cau"], now, interval)

    expect(await claimDueSources(db, ["cau"], now, interval)).toEqual([])
  })

  it("does not claim a source that succeeded within the interval", async () => {
    vi.mocked(fetchCauEntries).mockResolvedValueOnce([cauRow("J-DU000001")])
    await runUpstreamRefresh(db, ["cau"])

    expect(await claimDueSources(db, ["cau"], new Date(), interval)).toEqual([])
  })

  it("claims it again once the interval has passed", async () => {
    vi.mocked(fetchCauEntries).mockResolvedValueOnce([cauRow("J-DU000001")])
    await runUpstreamRefresh(db, ["cau"])
    const later = new Date(Date.now() + 25 * 60 * 60 * 1000)

    expect(await claimDueSources(db, ["cau"], later, interval)).toEqual(["cau"])
  })

  it("claims an attempt abandoned by a process that stopped", async () => {
    await claimDueSources(db, ["cau"], now, interval)
    const muchLater = new Date(now.getTime() + 2 * 60 * 60 * 1000)

    expect(await claimDueSources(db, ["cau"], muchLater, interval)).toEqual(["cau"])
  })
})

async function aResearch(): Promise<string> {
  const [row] = await db.insert(s.research).values({}).returning({ id: s.research.id })
  if (row === undefined) throw new Error("expected a research")
  await db.insert(s.labelPin).values({
    kind: "hum", label: "hum0001", researchId: row.id, isPrimary: true,
  })
  return row.id
}

async function pinDataset(researchId: string, label: string): Promise<void> {
  const [row] = await db.insert(s.dataset).values({ researchId }).returning({ id: s.dataset.id })
  if (row === undefined) throw new Error("expected a dataset")
  await db.insert(s.labelPin).values({
    kind: "dataset", label, datasetId: row.id, isPrimary: true,
  })
}
