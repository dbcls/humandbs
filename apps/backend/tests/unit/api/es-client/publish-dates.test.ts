/**
 * Publication date derivation tests.
 *
 * The invariant under test throughout: nothing that belongs to an unpublished
 * version may reach a derived date. Drafts and the migration's orphan RVs (the
 * ones numbered above latestVersion) are both above the publication ceiling.
 *
 * Mocking strategy:
 * - @/api/es-client/client.esClient is mocked
 * - @/api/es-client/research.getResearchDoc is stubbed to control the ceiling
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"
import fc from "fast-check"

import { createMockDatasetDoc, createMockResearchDoc, createMockResearchVersionDoc } from "../helpers/mock-es"

const mockEsSearch = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({ hits: { hits: [] } }))
const mockEsUpdate = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({}))
const mockEsUpdateByQuery = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({}))
const mockEsMget = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({ docs: [] }))

void mock.module("@/api/es-client/client", () => ({
  ES_INDEX: { research: "research", researchVersion: "research-version", dataset: "dataset" },
  esClient: {
    search: mockEsSearch,
    update: mockEsUpdate,
    updateByQuery: mockEsUpdateByQuery,
    mget: mockEsMget,
  },
  isConflictError: () => false,
  isDocumentExistsError: () => false,
}))

const mockGetResearchDoc = mock<(humId: string) => Promise<unknown>>(async () => null)
void mock.module("@/api/es-client/research", () => ({
  getResearchDoc: mockGetResearchDoc,
}))

const { computeResearchDates, stampVersionReleaseDate, syncDatasetDateModified } =
  await import("@/api/es-client/publish-dates")

/** ES `search` response carrying the given `_source` docs. */
const hits = (docs: unknown[]) => ({ hits: { hits: docs.map(d => ({ _source: d })) } })

/** ES `mget` response for the RV docs `computeResearchDates` reads. */
const mgetDocs = (docs: { humVersionId: string }[]) => ({
  docs: docs.map(d => ({ found: true, _id: d.humVersionId, _source: d })),
})

beforeEach(() => {
  mockEsSearch.mockReset()
  mockEsUpdate.mockReset()
  mockEsUpdateByQuery.mockReset()
  mockEsMget.mockReset()
  mockGetResearchDoc.mockReset()
  mockEsSearch.mockResolvedValue(hits([]))
  mockEsUpdate.mockResolvedValue({})
  mockEsUpdateByQuery.mockResolvedValue({})
})

describe("computeResearchDates", () => {
  const research = { versionIds: ["hum0001-v1", "hum0001-v2", "hum0001-v3"] }

  it("takes the min and max release date of the versions up to latestVersion", async () => {
    mockEsMget.mockResolvedValue(mgetDocs([
      createMockResearchVersionDoc({ humVersionId: "hum0001-v1", version: "v1", versionReleaseDate: "2020-04-06" }),
      createMockResearchVersionDoc({ humVersionId: "hum0001-v2", version: "v2", versionReleaseDate: "2022-01-01" }),
      createMockResearchVersionDoc({ humVersionId: "hum0001-v3", version: "v3", versionReleaseDate: "2024-07-30" }),
    ]))

    expect(await computeResearchDates(research, "v3")).toEqual({
      datePublished: "2020-04-06",
      dateModified: "2024-07-30",
    })
  })

  it("ignores versions above latestVersion (draft and migration orphans)", async () => {
    mockEsMget.mockResolvedValue(mgetDocs([
      createMockResearchVersionDoc({ humVersionId: "hum0001-v1", version: "v1", versionReleaseDate: "2020-04-06" }),
      createMockResearchVersionDoc({ humVersionId: "hum0001-v2", version: "v2", versionReleaseDate: "2022-01-01" }),
      // draft — must not become the update date
      createMockResearchVersionDoc({ humVersionId: "hum0001-v3", version: "v3", versionReleaseDate: "2026-07-30" }),
    ]))

    expect(await computeResearchDates(research, "v2")).toEqual({
      datePublished: "2020-04-06",
      dateModified: "2022-01-01",
    })
  })

  it("is null on both ends when nothing is published", async () => {
    expect(await computeResearchDates(research, null)).toEqual({
      datePublished: null,
      dateModified: null,
    })
    expect(mockEsMget).not.toHaveBeenCalled()
  })

  it("is null on both ends when every published version lacks a release date", async () => {
    mockEsMget.mockResolvedValue(mgetDocs([
      createMockResearchVersionDoc({ humVersionId: "hum0001-v1", version: "v1", versionReleaseDate: null }),
    ]))

    expect(await computeResearchDates({ versionIds: ["hum0001-v1"] }, "v1")).toEqual({
      datePublished: null,
      dateModified: null,
    })
  })

  it("orders by version number, not by string — v10 is above v9", async () => {
    mockEsMget.mockResolvedValue(mgetDocs([
      createMockResearchVersionDoc({ humVersionId: "hum0001-v9", version: "v9", versionReleaseDate: "2023-01-01" }),
      createMockResearchVersionDoc({ humVersionId: "hum0001-v10", version: "v10", versionReleaseDate: "2024-01-01" }),
    ]))

    expect(await computeResearchDates({ versionIds: ["hum0001-v9", "hum0001-v10"] }, "v9")).toEqual({
      datePublished: "2023-01-01",
      dateModified: "2023-01-01",
    })
  })

  // PBT: no date from above the ceiling ever lands in the result.
  it("PBT: neither date ever comes from a version above latestVersion", async () => {
    const arbDate = fc.date({
      min: new Date("2000-01-01"),
      max: new Date("2035-12-31"),
      noInvalidDate: true,
    }).map(d => d.toISOString().split("T")[0])

    await fc.assert(
      fc.asyncProperty(
        fc.array(arbDate, { minLength: 1, maxLength: 12 }),
        fc.integer({ min: 1, max: 12 }),
        async (dates, ceiling) => {
          const versions = dates.map((date, i) => createMockResearchVersionDoc({
            humVersionId: `hum0001-v${i + 1}`,
            version: `v${i + 1}`,
            versionReleaseDate: date,
          }))
          mockEsMget.mockResolvedValue(mgetDocs(versions))

          const published = dates.slice(0, ceiling)
          const result = await computeResearchDates(
            { versionIds: versions.map(v => v.humVersionId) },
            `v${ceiling}`,
          )

          if (published.length === 0) {
            return result.datePublished === null && result.dateModified === null
          }

          return result.datePublished === published.reduce((a, b) => (a < b ? a : b))
            && result.dateModified === published.reduce((a, b) => (a > b ? a : b))
        },
      ),
      { numRuns: 60 },
    )
  })
})

describe("syncDatasetDateModified", () => {
  it("takes the max of versionReleaseDate and releaseDate across published versions", async () => {
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: "v2" }))
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ version: "v1", humVersionId: "hum0001-v1", versionReleaseDate: "2020-04-06", releaseDate: "2020-09-28" }),
      createMockDatasetDoc({ version: "v2", humVersionId: "hum0001-v2", versionReleaseDate: "2024-07-30", releaseDate: "2020-09-28" }),
    ]))

    expect(await syncDatasetDateModified("JGAD000001")).toBe("2024-07-30")

    // The value is denormalized onto every version doc, drafts included, so the
    // collapsed listing sorts the same whichever version it picks.
    const args = mockEsUpdateByQuery.mock.calls[0]?.[0] as {
      query: unknown
      script: { params: { d: string } }
    }
    expect(args.query).toEqual({ term: { datasetId: "JGAD000001" } })
    expect(args.script.params.d).toBe("2024-07-30")
  })

  it("lets releaseDate win when DDBJ published later than the version", async () => {
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: "v1" }))
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ version: "v1", humVersionId: "hum0001-v1", versionReleaseDate: "2026-07-08", releaseDate: "2026-07-30" }),
    ]))

    // Without releaseDate in the max the update date would sit before the
    // release date, which reads as a Dataset modified before it existed.
    expect(await syncDatasetDateModified("JGAD000001")).toBe("2026-07-30")
  })

  it("excludes draft versions from the max", async () => {
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: "v1", draftVersion: "v2" }))
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ version: "v1", humVersionId: "hum0001-v1", versionReleaseDate: "2020-01-14", releaseDate: "2020-01-14" }),
      createMockDatasetDoc({ version: "v2", humVersionId: "hum0001-v2", versionReleaseDate: "2022-06-17", releaseDate: "2022-06-17" }),
    ]))

    expect(await syncDatasetDateModified("JGAD000001")).toBe("2020-01-14")
  })

  it("returns null and writes nothing when the parent has no published version", async () => {
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: null, draftVersion: "v1" }))
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ version: "v1", humVersionId: "hum0001-v1" }),
    ]))

    expect(await syncDatasetDateModified("JGAD000001")).toBeNull()
    expect(mockEsUpdateByQuery).not.toHaveBeenCalled()
  })

  it("returns null when the datasetId has no documents", async () => {
    mockEsSearch.mockResolvedValue(hits([]))

    expect(await syncDatasetDateModified("JGAD000001")).toBeNull()
    expect(mockEsUpdateByQuery).not.toHaveBeenCalled()
  })
})

describe("stampVersionReleaseDate", () => {
  it("writes the date to the RV and to the Datasets born on that version", async () => {
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ datasetId: "JGAD000001", version: "v2", humVersionId: "hum0001-v2" }),
      createMockDatasetDoc({ datasetId: "JGAD000002", version: "v1", humVersionId: "hum0001-v2" }),
    ]))
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: "v2" }))

    await stampVersionReleaseDate("hum0001", "v2", "2026-07-30")

    const targets = mockEsUpdate.mock.calls.map(c => {
      const a = c[0] as { index: string; id: string; body: { doc: Record<string, unknown> } }
      return { index: a.index, id: a.id, date: a.body.doc.versionReleaseDate }
    })
    expect(targets).toEqual([
      { index: "research-version", id: "hum0001-v2", date: "2026-07-30" },
      { index: "dataset", id: "JGAD000001-v2", date: "2026-07-30" },
      { index: "dataset", id: "JGAD000002-v1", date: "2026-07-30" },
    ])
  })

  it("selects Datasets by humVersionId, not by the version's dataset references", async () => {
    mockEsSearch.mockResolvedValue(hits([]))

    await stampVersionReleaseDate("hum0001", "v3", "2026-07-30")

    // A Dataset carried over unchanged from v2 is referenced by v3 but was born
    // on v2, so its release date must not move. Querying by humVersionId is what
    // draws that line.
    const query = (mockEsSearch.mock.calls[0]?.[0] as { query: unknown }).query
    expect(query).toEqual({ term: { humVersionId: "hum0001-v3" } })
    // RV alone was written; no dataset matched.
    expect(mockEsUpdate).toHaveBeenCalledTimes(1)
  })

  it("resyncs dateModified once per datasetId after the dates are written", async () => {
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ datasetId: "JGAD000001", version: "v2", humVersionId: "hum0001-v2" }),
      createMockDatasetDoc({ datasetId: "JGAD000001", version: "v3", humVersionId: "hum0001-v2" }),
    ]))
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: "v2" }))

    await stampVersionReleaseDate("hum0001", "v2", "2026-07-30")

    expect(mockEsUpdateByQuery).toHaveBeenCalledTimes(1)
  })
})
