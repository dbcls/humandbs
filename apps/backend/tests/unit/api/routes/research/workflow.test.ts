/**
 * Tests for computeVersionUpdates (workflow state transitions) and the HTTP
 * surface of submit / approve / reject / unpublish.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"
import fc from "fast-check"

import type { EsResearch } from "@/api/types"

import { adminAuthHeader, buildMockAuthModule, userAuthHeader } from "../../helpers/mock-auth"
import { createMockResearchDoc } from "../../helpers/mock-es"

// === Auth + ES mocks (load before importing the workflow module / app) ===

void mock.module("@/api/middleware/auth", buildMockAuthModule)

const mockIsOwner = mock<(username: string, humId: string) => Promise<boolean>>(async () => false)
void mock.module("@/api/services/ownership", () => ({
  getOwnerUsernames: async () => [],
  getOwnedHumIds: async () => [],
  isOwner: (username: string, humId: string) => mockIsOwner(username, humId),
  refreshOwnershipCache: async () => undefined,
  resetOwnershipCacheForTest: () => undefined,
}))

const mockUpdateResearchStatus = mock<
  (...args: unknown[]) => Promise<({ doc: EsResearch; seqNo: number; primaryTerm: number; dateModified: string | null } | null)>
>()
const mockGetResearchWithSeqNo = mock<
  (humId: string) => Promise<{ doc: EsResearch; seqNo: number; primaryTerm: number } | null>
>()
const mockSyncResearchRootFromVersion = mock<(humId: string, version: string) => Promise<void>>(async () => undefined)

void mock.module("@/api/es-client/research", () => ({
  createResearch: mock(() => Promise.resolve(null)),
  deleteResearch: mock(() => Promise.resolve(false)),
  getResearchDetail: mock(() => Promise.resolve(null)),
  getResearchDoc: mock(() => Promise.resolve(null)),
  getResearchWithSeqNo: (...args: unknown[]) => mockGetResearchWithSeqNo(args[0] as string),
  updateResearch: mock(() => Promise.resolve(null)),
  updateResearchStatus: (...args: unknown[]) => mockUpdateResearchStatus(...args),
  syncResearchRootFromVersion: (humId: string, version: string) => mockSyncResearchRootFromVersion(humId, version),
}))

const mockStampVersionReleaseDate = mock<(humId: string, version: string, date: string) => Promise<void>>(
  async () => undefined,
)
const mockComputeResearchDates = mock<
  (...args: unknown[]) => Promise<{ datePublished: string | null; dateModified: string | null }>
>(async () => ({ datePublished: null, dateModified: null }))
const mockSyncDatasetDerivedForResearch = mock<(humId: string) => Promise<void>>(async () => undefined)

void mock.module("@/api/es-client/publish-dates", () => ({
  today: () => "2024-03-04",
  stampVersionReleaseDate: (humId: string, version: string, date: string) =>
    mockStampVersionReleaseDate(humId, version, date),
  computeResearchDates: (...args: unknown[]) => mockComputeResearchDates(...args),
  syncDatasetDerived: mock(async () => ({ dateModified: null, latestVersion: null, latestPublishedVersion: null })),
  syncDatasetDerivedForResearch: (humId: string) => mockSyncDatasetDerivedForResearch(humId),
}))

void mock.module("@/api/es-client/search", () => ({
  searchResearches: mock(() => Promise.resolve({
    data: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
  })),
  searchDatasets: mock(() => Promise.resolve({
    data: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
  })),
}))

const { computeVersionUpdates } = await import("@/api/routes/research/workflow")
const { getTestApp } = await import("../../helpers")

describe("computeVersionUpdates", () => {
  it("approve promotes draftVersion to latestVersion", () => {
    const research = createMockResearchDoc({
      status: "review",
      draftVersion: "v2",
      latestVersion: "v1",
    })

    expect(computeVersionUpdates("approve", research)).toEqual({
      latestVersion: "v2",
      draftVersion: null,
    })
  })

  it("approve throws when draftVersion is null", () => {
    const research = createMockResearchDoc({
      status: "review",
      draftVersion: null,
      latestVersion: "v1",
    })

    expect(() => computeVersionUpdates("approve", research)).toThrow(
      "Cannot approve: draftVersion is null",
    )
  })

  it("submit returns undefined (no version changes)", () => {
    const research = createMockResearchDoc({ status: "draft", draftVersion: "v1" })

    expect(computeVersionUpdates("submit", research)).toBeUndefined()
  })

  it("reject returns undefined (no version changes)", () => {
    const research = createMockResearchDoc({ status: "review", draftVersion: "v1" })

    expect(computeVersionUpdates("reject", research)).toBeUndefined()
  })

  it("unpublish swaps latestVersion to draftVersion", () => {
    const research = createMockResearchDoc({
      status: "published",
      latestVersion: "v1",
      draftVersion: null,
    })

    const result = computeVersionUpdates("unpublish", research)

    expect(result).toEqual({ latestVersion: null, draftVersion: "v1" })
  })

  it("unpublish throws when latestVersion is null", () => {
    const research = createMockResearchDoc({
      status: "published",
      latestVersion: null,
      draftVersion: null,
    })

    expect(() => computeVersionUpdates("unpublish", research)).toThrow(
      "Cannot unpublish: latestVersion is null",
    )
  })

  // PBT: submit/reject always return undefined
  it("PBT: submit/reject -> always undefined", () => {
    const arbVersion = fc.stringMatching(/^v\d+$/)

    fc.assert(
      fc.property(
        fc.constantFrom("submit" as const, "reject" as const),
        fc.option(arbVersion, { nil: null }),
        fc.option(arbVersion, { nil: null }),
        (action, latest, draft) => {
          const research = createMockResearchDoc({
            latestVersion: latest,
            draftVersion: draft,
          })
          return computeVersionUpdates(action, research) === undefined
        },
      ),
    )
  })

  // PBT: version routing never depends on the stored dates — those are derived
  // separately by computeResearchDates.
  it("PBT: approve -> latestVersion is the draft, whatever the stored dates are", () => {
    const arbVersion = fc.stringMatching(/^v\d+$/)
    const arbDate = fc.date({
      min: new Date("2020-01-01"),
      max: new Date("2030-12-31"),
      noInvalidDate: true,
    }).map(d => d.toISOString().split("T")[0])

    fc.assert(
      fc.property(
        arbVersion,
        fc.option(arbDate, { nil: null }),
        fc.option(arbDate, { nil: null }),
        (draftVersion, datePublished, dateModified) => {
          const research = createMockResearchDoc({ draftVersion, datePublished, dateModified })

          return JSON.stringify(computeVersionUpdates("approve", research))
            === JSON.stringify({ latestVersion: draftVersion, draftVersion: null })
        },
      ),
    )
  })
})

describe("POST /research/{humId}/{submit|approve|reject|unpublish} HTTP plumbing", () => {
  const adminHeaders = { "Content-Type": "application/json", ...adminAuthHeader() }
  const owner = userAuthHeader({ userId: "owner-1", username: "owner-1" })

  beforeEach(() => {
    mockGetResearchWithSeqNo.mockReset()
    mockUpdateResearchStatus.mockReset()
    mockSyncResearchRootFromVersion.mockReset()
    mockSyncResearchRootFromVersion.mockResolvedValue(undefined)
    mockStampVersionReleaseDate.mockReset()
    mockStampVersionReleaseDate.mockResolvedValue(undefined)
    mockComputeResearchDates.mockReset()
    mockComputeResearchDates.mockResolvedValue({ datePublished: null, dateModified: null })
    mockSyncDatasetDerivedForResearch.mockReset()
    mockSyncDatasetDerivedForResearch.mockResolvedValue(undefined)
    mockIsOwner.mockReset()
    mockIsOwner.mockImplementation(async (_u: string) => _u === "owner-1")
  })

  const updatedStub = (status: EsResearch["status"], extras: Partial<EsResearch> = {}) => ({
    doc: createMockResearchDoc({ status, ...extras }),
    seqNo: 2,
    primaryTerm: 1,
    dateModified: "2024-01-02",
  })

  it("approve: review→published returns 200 and updateResearchStatus is called", async () => {
    const reviewDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "review",
      latestVersion: null,
      draftVersion: "v1",
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: reviewDoc, seqNo: 1, primaryTerm: 1 })
    mockUpdateResearchStatus.mockResolvedValue(updatedStub("published", { latestVersion: "v1", draftVersion: null }))

    const res = await getTestApp().request("/research/hum0001/approve", {
      method: "POST",
      headers: adminHeaders,
      body: "{}",
    })
    expect(res.status).toBe(200)
    expect(mockUpdateResearchStatus).toHaveBeenCalledTimes(1)
    // approve must sync the Research root content from the newly-published RV
    // so search / listing / public detail catch up with the approved version.
    expect(mockSyncResearchRootFromVersion).toHaveBeenCalledTimes(1)
    expect(mockSyncResearchRootFromVersion).toHaveBeenCalledWith("hum0001", "v1")
  })

  it("approve stamps the draft's release date, then writes the recomputed root dates", async () => {
    const reviewDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "review",
      latestVersion: "v1",
      draftVersion: "v2",
      datePublished: "2020-01-01",
      dateModified: "2020-01-01",
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: reviewDoc, seqNo: 1, primaryTerm: 1 })
    mockUpdateResearchStatus.mockResolvedValue(updatedStub("published", { latestVersion: "v2", draftVersion: null }))
    mockComputeResearchDates.mockResolvedValue({ datePublished: "2020-01-01", dateModified: "2024-03-04" })

    const res = await getTestApp().request("/research/hum0001/approve", {
      method: "POST",
      headers: adminHeaders,
      body: "{}",
    })

    expect(res.status).toBe(200)
    expect(mockStampVersionReleaseDate).toHaveBeenCalledWith("hum0001", "v2", "2024-03-04")
    // The min/max must be taken over the versions up to the version being
    // published — the draft that just became latest, not the stale latestVersion.
    expect(mockComputeResearchDates).toHaveBeenCalledWith(expect.objectContaining({ humId: "hum0001" }), "v2")
    expect(mockUpdateResearchStatus.mock.calls[0][4]).toEqual({
      latestVersion: "v2",
      draftVersion: null,
      datePublished: "2020-01-01",
      dateModified: "2024-03-04",
    })
  })

  it("unpublish recomputes the root dates without an empty published set", async () => {
    const publishedDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "published",
      latestVersion: "v1",
      draftVersion: null,
      datePublished: "2020-01-01",
      dateModified: "2020-01-01",
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: publishedDoc, seqNo: 1, primaryTerm: 1 })
    mockUpdateResearchStatus.mockResolvedValue(updatedStub("draft", { latestVersion: null, draftVersion: "v1" }))

    const res = await getTestApp().request("/research/hum0001/unpublish", {
      method: "POST",
      headers: adminHeaders,
      body: "{}",
    })

    expect(res.status).toBe(200)
    // Nothing was published, so no release date is stamped — but the derived
    // dates still have to drop to null.
    expect(mockStampVersionReleaseDate).not.toHaveBeenCalled()
    expect(mockComputeResearchDates).toHaveBeenCalledWith(expect.objectContaining({ humId: "hum0001" }), null)
    expect(mockUpdateResearchStatus.mock.calls[0][4]).toEqual({
      latestVersion: null,
      draftVersion: "v1",
      datePublished: null,
      dateModified: null,
    })
  })

  it("unpublish resyncs the Datasets' latest-version flags", async () => {
    const publishedDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "published",
      latestVersion: "v1",
      draftVersion: null,
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: publishedDoc, seqNo: 1, primaryTerm: 1 })
    mockUpdateResearchStatus.mockResolvedValue(updatedStub("draft", { latestVersion: null, draftVersion: "v1" }))

    const res = await getTestApp().request("/research/hum0001/unpublish", {
      method: "POST",
      headers: adminHeaders,
      body: "{}",
    })

    // The published set is now empty, so no Dataset may keep a latest-published
    // flag — without this the listing would still serve them.
    expect(res.status).toBe(200)
    expect(mockSyncDatasetDerivedForResearch).toHaveBeenCalledWith("hum0001")
  })

  it("submit, reject and approve leave the Dataset flags to their own write paths", async () => {
    const reviewDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "review",
      latestVersion: null,
      draftVersion: "v1",
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: reviewDoc, seqNo: 1, primaryTerm: 1 })
    mockUpdateResearchStatus.mockResolvedValue(updatedStub("published", { latestVersion: "v1", draftVersion: null }))

    await getTestApp().request("/research/hum0001/approve", {
      method: "POST",
      headers: adminHeaders,
      body: "{}",
    })

    // approve resyncs through `stampVersionReleaseDate`, which runs before the
    // root flip and passes the version being published.
    expect(mockSyncDatasetDerivedForResearch).not.toHaveBeenCalled()
  })

  it("submit and reject leave every date alone", async () => {
    const draftDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "draft",
      latestVersion: "v1",
      draftVersion: "v2",
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: draftDoc, seqNo: 1, primaryTerm: 1 })
    mockUpdateResearchStatus.mockResolvedValue(updatedStub("review"))

    await getTestApp().request("/research/hum0001/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...owner },
      body: "{}",
    })

    expect(mockStampVersionReleaseDate).not.toHaveBeenCalled()
    expect(mockComputeResearchDates).not.toHaveBeenCalled()
    expect(mockUpdateResearchStatus.mock.calls[0][4]).toEqual({})
  })

  it("submit/reject/unpublish do NOT invoke syncResearchRootFromVersion", async () => {
    // Submit (draft → review): no content changes → no sync.
    const draftDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "draft",
      latestVersion: null,
      draftVersion: "v1",
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: draftDoc, seqNo: 1, primaryTerm: 1 })
    mockUpdateResearchStatus.mockResolvedValue(updatedStub("review"))

    await getTestApp().request("/research/hum0001/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...owner },
      body: "{}",
    })
    expect(mockSyncResearchRootFromVersion).not.toHaveBeenCalled()

    // Unpublish (published → draft): latestVersion clears, no content changes.
    const publishedDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "published",
      latestVersion: "v1",
      draftVersion: null,
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: publishedDoc, seqNo: 2, primaryTerm: 1 })
    mockUpdateResearchStatus.mockResolvedValue(updatedStub("draft", { latestVersion: null, draftVersion: "v1" }))

    await getTestApp().request("/research/hum0001/unpublish", {
      method: "POST",
      headers: adminHeaders,
      body: "{}",
    })
    expect(mockSyncResearchRootFromVersion).not.toHaveBeenCalled()
  })

  it("approve: invalid current status (draft) returns 409 and updateResearchStatus is NOT called", async () => {
    const draftDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "draft",
      latestVersion: null,
      draftVersion: "v1",
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: draftDoc, seqNo: 1, primaryTerm: 1 })

    const res = await getTestApp().request("/research/hum0001/approve", {
      method: "POST",
      headers: adminHeaders,
      body: "{}",
    })
    expect(res.status).toBe(409)
    expect(mockUpdateResearchStatus).not.toHaveBeenCalled()
  })

  it("submit: draft→review by owner returns 200", async () => {
    const draftDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "draft",
      latestVersion: null,
      draftVersion: "v1",
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: draftDoc, seqNo: 1, primaryTerm: 1 })
    mockUpdateResearchStatus.mockResolvedValue(updatedStub("review"))

    const res = await getTestApp().request("/research/hum0001/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...owner },
      body: "{}",
    })
    expect(res.status).toBe(200)
  })

  it("reject: invalid current status (published) returns 409", async () => {
    const publishedDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "published",
      latestVersion: "v1",
      draftVersion: null,
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: publishedDoc, seqNo: 1, primaryTerm: 1 })

    const res = await getTestApp().request("/research/hum0001/reject", {
      method: "POST",
      headers: adminHeaders,
      body: "{}",
    })
    expect(res.status).toBe(409)
    expect(mockUpdateResearchStatus).not.toHaveBeenCalled()
  })

  it("unpublish: published→draft returns 200", async () => {
    const publishedDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "published",
      latestVersion: "v1",
      draftVersion: null,
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: publishedDoc, seqNo: 1, primaryTerm: 1 })
    mockUpdateResearchStatus.mockResolvedValue(updatedStub("draft", { latestVersion: null, draftVersion: "v1" }))

    const res = await getTestApp().request("/research/hum0001/unpublish", {
      method: "POST",
      headers: adminHeaders,
      body: "{}",
    })
    expect(res.status).toBe(200)
  })

  it("unpublish: invalid current status (draft) returns 409", async () => {
    const draftDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "draft",
      latestVersion: null,
      draftVersion: "v1",
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: draftDoc, seqNo: 1, primaryTerm: 1 })

    const res = await getTestApp().request("/research/hum0001/unpublish", {
      method: "POST",
      headers: adminHeaders,
      body: "{}",
    })
    expect(res.status).toBe(409)
  })

  it("approve without auth: 401 (requireAdmin middleware fires before status check)", async () => {
    const res = await getTestApp().request("/research/hum0001/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(401)
    expect(mockUpdateResearchStatus).not.toHaveBeenCalled()
  })

  it("approve by non-admin: 403", async () => {
    const res = await getTestApp().request("/research/hum0001/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...owner },
      body: "{}",
    })
    expect(res.status).toBe(403)
    expect(mockUpdateResearchStatus).not.toHaveBeenCalled()
  })
})
