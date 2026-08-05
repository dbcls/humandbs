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

const { computeResearchDates, stampVersionReleaseDate, syncDatasetDerived, syncDatasetDerivedForResearch } =
  await import("@/api/es-client/publish-dates")

/** Params of the `update_by_query` script that writes the derived values. */
interface DerivedParams {
  dateModified: string | null
  latestVersion: string | null
  latestPublishedVersion: string | null
}

const updateByQueryArgs = (call = 0) => mockEsUpdateByQuery.mock.calls[call]?.[0] as {
  query: unknown
  script: { source: string; params: DerivedParams }
}

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

describe("syncDatasetDerived", () => {
  it("takes the max of versionReleaseDate and releaseDate across published versions", async () => {
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: "v2" }))
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ version: "v1", humVersionId: "hum0001-v1", versionReleaseDate: "2020-04-06", releaseDate: "2020-09-28" }),
      createMockDatasetDoc({ version: "v2", humVersionId: "hum0001-v2", versionReleaseDate: "2024-07-30", releaseDate: "2020-09-28" }),
    ]))

    expect(await syncDatasetDerived("JGAD000001")).toEqual({
      dateModified: "2024-07-30",
      latestVersion: "v2",
      latestPublishedVersion: "v2",
    })

    // The value is denormalized onto every version doc, drafts included, so the
    // collapsed listing sorts the same whichever version it picks.
    const args = updateByQueryArgs()
    expect(args.query).toEqual({ term: { datasetId: "JGAD000001" } })
    expect(args.script.params.dateModified).toBe("2024-07-30")
  })

  it("lets releaseDate win when DDBJ published later than the version", async () => {
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: "v1" }))
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ version: "v1", humVersionId: "hum0001-v1", versionReleaseDate: "2026-07-08", releaseDate: "2026-07-30" }),
    ]))

    // Without releaseDate in the max the update date would sit before the
    // release date, which reads as a Dataset modified before it existed.
    expect((await syncDatasetDerived("JGAD000001")).dateModified).toBe("2026-07-30")
  })

  it("excludes draft versions from the max", async () => {
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: "v1", draftVersion: "v2" }))
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ version: "v1", humVersionId: "hum0001-v1", versionReleaseDate: "2020-01-14", releaseDate: "2020-01-14" }),
      createMockDatasetDoc({ version: "v2", humVersionId: "hum0001-v2", versionReleaseDate: "2022-06-17", releaseDate: "2022-06-17" }),
    ]))

    expect((await syncDatasetDerived("JGAD000001")).dateModified).toBe("2020-01-14")
  })

  it("names the draft version as latest and the published one as latest published", async () => {
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: "v1", draftVersion: "v2" }))
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ version: "v1", humVersionId: "hum0001-v1" }),
      createMockDatasetDoc({ version: "v2", humVersionId: "hum0001-v2" }),
    ]))

    const derived = await syncDatasetDerived("JGAD000001")
    expect(derived.latestVersion).toBe("v2")
    expect(derived.latestPublishedVersion).toBe("v1")
    expect(updateByQueryArgs().script.params).toMatchObject({
      latestVersion: "v2",
      latestPublishedVersion: "v1",
    })
  })

  it("reads the version off each doc, so the flags can be written per version", async () => {
    mockEsSearch.mockResolvedValue(hits([createMockDatasetDoc({ version: "v1", humVersionId: "hum0001-v1" })]))

    await syncDatasetDerived("JGAD000001")

    // Without `version` in `_source` every doc would compare as unversioned and
    // the flags would land on none of them.
    const source = (mockEsSearch.mock.calls[0]?.[0] as { _source: string[] })._source
    expect(source).toContain("version")
  })

  it("writes the flags but leaves dateModified alone when nothing is published", async () => {
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: null, draftVersion: "v1" }))
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ version: "v1", humVersionId: "hum0001-v1" }),
    ]))

    // The owner still needs to find this Dataset in their own listing, so
    // `isLatest` has to be written even with no published version to date.
    expect(await syncDatasetDerived("JGAD000001")).toEqual({
      dateModified: null,
      latestVersion: "v1",
      latestPublishedVersion: null,
    })
    expect(updateByQueryArgs().script.params).toEqual({
      dateModified: null,
      latestVersion: "v1",
      latestPublishedVersion: null,
    })
  })

  it("writes nothing when the datasetId has no documents", async () => {
    mockEsSearch.mockResolvedValue(hits([]))

    expect(await syncDatasetDerived("JGAD000001")).toEqual({
      dateModified: null,
      latestVersion: null,
      latestPublishedVersion: null,
    })
    expect(mockEsUpdateByQuery).not.toHaveBeenCalled()
  })

  it("counts the version named by `publishing` as published, over the stored ceiling", async () => {
    // Mid-approve the root still says v30 is latest and v31 is the draft.
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: "v30", draftVersion: "v31" }))
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ version: "v1", humVersionId: "hum0001-v31", versionReleaseDate: "2026-07-31", releaseDate: "2026-07-03" }),
    ]))

    expect(await syncDatasetDerived("JGAD000001", { humId: "hum0001", latestVersion: "v31" })).toEqual({
      dateModified: "2026-07-31",
      latestVersion: "v1",
      latestPublishedVersion: "v1",
    })
  })

  it("lifts the ceiling only for the hum being published", async () => {
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0002", latestVersion: "v1", draftVersion: "v2" }))
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ humId: "hum0002", version: "v2", humVersionId: "hum0002-v2", versionReleaseDate: "2026-07-31", releaseDate: "2026-07-31" }),
      createMockDatasetDoc({ humId: "hum0002", version: "v1", humVersionId: "hum0002-v1", versionReleaseDate: "2020-01-14", releaseDate: "2020-01-14" }),
    ]))

    // hum0001 is the one being approved; hum0002's own draft stays out of the
    // published set — it is neither in the max nor the latest published version.
    expect(await syncDatasetDerived("JGAD000001", { humId: "hum0001", latestVersion: "v31" })).toEqual({
      dateModified: "2020-01-14",
      latestVersion: "v2",
      latestPublishedVersion: "v1",
    })
  })
})

describe("syncDatasetDerivedForResearch", () => {
  it("resyncs every datasetId under the Research, once each", async () => {
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ datasetId: "JGAD000001", version: "v1", humVersionId: "hum0001-v1" }),
      createMockDatasetDoc({ datasetId: "JGAD000001", version: "v2", humVersionId: "hum0001-v2" }),
      createMockDatasetDoc({ datasetId: "JGAD000002", version: "v1", humVersionId: "hum0001-v1" }),
    ]))
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: "v2" }))

    await syncDatasetDerivedForResearch("hum0001")

    expect((mockEsSearch.mock.calls[0]?.[0] as { query: unknown }).query)
      .toEqual({ term: { humId: "hum0001" } })
    expect(mockEsUpdateByQuery).toHaveBeenCalledTimes(2)
  })

  it("clears every latest-published flag once the Research is unpublished", async () => {
    // unpublish moves latestVersion to null, so no version is published anymore.
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: null, draftVersion: "v2" }))
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ datasetId: "JGAD000001", version: "v1", humVersionId: "hum0001-v1" }),
      createMockDatasetDoc({ datasetId: "JGAD000001", version: "v2", humVersionId: "hum0001-v2" }),
    ]))

    await syncDatasetDerivedForResearch("hum0001")

    expect(updateByQueryArgs().script.params).toMatchObject({
      latestVersion: "v2",
      latestPublishedVersion: null,
    })
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

  it("fills dateModified for a Dataset born on the version being published", async () => {
    // The root still carries the previous latestVersion while approve runs, so
    // a datasetId that first appears on this version has no published sibling
    // to take a date from. Left alone its dateModified stays null on a document
    // that is about to go public, and the public detail endpoint stops parsing.
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ datasetId: "JGAD000001", version: "v1", humVersionId: "hum0001-v31", versionReleaseDate: "2026-07-31", releaseDate: "2026-07-03" }),
    ]))
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: "v30", draftVersion: "v31" }))

    await stampVersionReleaseDate("hum0001", "v31", "2026-07-31")

    expect(updateByQueryArgs().script.params.dateModified).toBe("2026-07-31")
  })

  it("resyncs the derived values once per datasetId after the dates are written", async () => {
    mockEsSearch.mockResolvedValue(hits([
      createMockDatasetDoc({ datasetId: "JGAD000001", version: "v2", humVersionId: "hum0001-v2" }),
      createMockDatasetDoc({ datasetId: "JGAD000001", version: "v3", humVersionId: "hum0001-v2" }),
    ]))
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: "v2" }))

    await stampVersionReleaseDate("hum0001", "v2", "2026-07-30")

    expect(mockEsUpdateByQuery).toHaveBeenCalledTimes(1)
  })

  it("resyncs Datasets that were not born on the version being published", async () => {
    // A version left above the old ceiling by an abandoned draft cycle is not
    // born on the version being approved, but the higher ceiling pulls it into
    // the published set — narrowing the resync to the born ones would leave its
    // latest-published flag on the older version.
    mockEsSearch.mockImplementation(async (args: unknown) => {
      const query = (args as { query: { term?: Record<string, string> } }).query
      if (query.term?.humVersionId) return hits([])

      return hits([
        createMockDatasetDoc({ datasetId: "JGAD000001", version: "v1", humVersionId: "hum0001-v1" }),
        createMockDatasetDoc({ datasetId: "JGAD000001", version: "v2", humVersionId: "hum0001-v2" }),
      ])
    })
    mockGetResearchDoc.mockResolvedValue(createMockResearchDoc({ humId: "hum0001", latestVersion: "v1", draftVersion: "v3" }))

    await stampVersionReleaseDate("hum0001", "v3", "2026-07-30")

    expect(updateByQueryArgs().script.params).toMatchObject({ latestPublishedVersion: "v2" })
  })
})
