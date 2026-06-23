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

const mockUpdateResearchStatus = mock<
  (...args: unknown[]) => Promise<({ doc: EsResearch; seqNo: number; primaryTerm: number; dateModified: string } | null)>
>()
const mockGetResearchWithSeqNo = mock<
  (humId: string) => Promise<{ doc: EsResearch; seqNo: number; primaryTerm: number } | null>
>()

void mock.module("@/api/es-client/research", () => ({
  createResearch: mock(() => Promise.resolve(null)),
  deleteResearch: mock(() => Promise.resolve(false)),
  getResearchDetail: mock(() => Promise.resolve(null)),
  getResearchDoc: mock(() => Promise.resolve(null)),
  getResearchWithSeqNo: (...args: unknown[]) => mockGetResearchWithSeqNo(args[0] as string),
  updateResearch: mock(() => Promise.resolve(null)),
  updateResearchStatus: (...args: unknown[]) => mockUpdateResearchStatus(...args),
  updateResearchUids: mock(() => Promise.resolve(null)),
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
  it("approve sets datePublished when it is null", () => {
    const research = createMockResearchDoc({
      status: "review",
      draftVersion: "v1",
      latestVersion: null,
      datePublished: null,
    })

    const result = computeVersionUpdates("approve", research)

    expect(result).toBeDefined()
    expect(result!.latestVersion).toBe("v1")
    expect(result!.draftVersion).toBeNull()
    expect(result!.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("approve preserves existing datePublished", () => {
    const research = createMockResearchDoc({
      status: "review",
      draftVersion: "v2",
      latestVersion: "v1",
      datePublished: "2024-01-01",
    })

    const result = computeVersionUpdates("approve", research)

    expect(result).toBeDefined()
    expect(result!.latestVersion).toBe("v2")
    expect(result!.draftVersion).toBeNull()
    expect(result!.datePublished).toBeUndefined()
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

  // PBT: approve with draftVersion and existing datePublished -> no datePublished in result
  it("PBT: approve + datePublished exists -> no datePublished in result", () => {
    const arbVersion = fc.stringMatching(/^v\d+$/)

    fc.assert(
      fc.property(
        arbVersion,
        fc.date({
          min: new Date("2020-01-01"),
          max: new Date("2030-12-31"),
          noInvalidDate: true,
        }).map(d => d.toISOString().split("T")[0]),
        (draftVersion, datePublished) => {
          const research = createMockResearchDoc({
            draftVersion,
            datePublished,
          })
          const result = computeVersionUpdates("approve", research)
          return result !== undefined && result.datePublished === undefined
        },
      ),
    )
  })

  // PBT: approve + draftVersion + no datePublished -> datePublished is YYYY-MM-DD
  it("PBT: approve + no datePublished -> datePublished is YYYY-MM-DD", () => {
    const arbVersion = fc.stringMatching(/^v\d+$/)

    fc.assert(
      fc.property(
        arbVersion,
        (draftVersion) => {
          const research = createMockResearchDoc({
            draftVersion,
            datePublished: null,
          })
          const result = computeVersionUpdates("approve", research)
          return (
            result !== undefined &&
            typeof result.datePublished === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(result.datePublished)
          )
        },
      ),
    )
  })
})

describe("POST /research/{humId}/{submit|approve|reject|unpublish} HTTP plumbing", () => {
  const adminHeaders = { "Content-Type": "application/json", ...adminAuthHeader() }
  const owner = userAuthHeader({ userId: "owner-1" })

  beforeEach(() => {
    mockGetResearchWithSeqNo.mockReset()
    mockUpdateResearchStatus.mockReset()
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
      uids: ["owner-1"],
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
