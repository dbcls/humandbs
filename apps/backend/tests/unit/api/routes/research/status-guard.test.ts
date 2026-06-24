/**
 * Research update/patch status guard tests
 *
 * Verifies that PUT /research/{humId}/update rejects non-draft Research
 * and PUT /research/{humId}/patch rejects non-published Research.
 * The full router is exercised (not a custom mini-app) via the shared
 * header-based auth mock so the route order (`requireAuth` → resource auth
 * → handler) stays in scope of the regression.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

import type { EsResearch } from "@/api/types"

import { adminAuthHeader, buildMockAuthModule, userAuthHeader } from "../../helpers/mock-auth"
import { createMockResearchDoc } from "../../helpers/mock-es"

// === Auth mock ===

void mock.module("@/api/middleware/auth", buildMockAuthModule)

// === ES mocks (external boundary) ===

const mockUpdateResearch = mock<(...args: unknown[]) => Promise<EsResearch | null>>()
const mockGetResearchWithSeqNo = mock<
  (humId: string) => Promise<{ doc: EsResearch; seqNo: number; primaryTerm: number } | null>
>()

void mock.module("@/api/es-client/research", () => ({
  createResearch: mock(() => Promise.resolve(null)),
  deleteResearch: mock(() => Promise.resolve(false)),
  getResearchDetail: mock(() => Promise.resolve(null)),
  getResearchDoc: mock(() => Promise.resolve(null)),
  getResearchWithSeqNo: (...args: unknown[]) => mockGetResearchWithSeqNo(args[0] as string),
  updateResearch: (...args: unknown[]) => mockUpdateResearch(...args),
  updateResearchUids: mock(() => Promise.resolve(null)),
  updateResearchStatus: mock(() => Promise.resolve(null)),
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

const { getTestApp } = await import("../../helpers")

// === Tests ===

const owner = userAuthHeader({ userId: "owner-1" })

const updateBody = {
  title: { ja: "更新", en: "Updated" },
  _seq_no: 1,
  _primary_term: 1,
}

describe("PUT /research/{humId}/update status guard", () => {
  beforeEach(() => {
    mockUpdateResearch.mockReset()
    mockGetResearchWithSeqNo.mockReset()
  })

  it("allows update when status is draft", async () => {
    const draftDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "draft",
      uids: ["owner-1"],
      latestVersion: null,
      draftVersion: "v1",
    })
    const updatedDoc = { ...draftDoc, title: { ja: "更新", en: "Updated" } }

    mockGetResearchWithSeqNo
      .mockResolvedValueOnce({ doc: draftDoc, seqNo: 1, primaryTerm: 1 })
      .mockResolvedValueOnce({ doc: updatedDoc, seqNo: 2, primaryTerm: 1 })

    mockUpdateResearch.mockResolvedValue(updatedDoc)

    const res = await getTestApp().request("/research/hum0001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(200)
  })

  it("rejects update when status is review (409)", async () => {
    const reviewDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "review",
      uids: ["owner-1"],
      latestVersion: null,
      draftVersion: "v1",
    })

    mockGetResearchWithSeqNo.mockResolvedValue({ doc: reviewDoc, seqNo: 1, primaryTerm: 1 })

    const res = await getTestApp().request("/research/hum0001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(409)
    const body = await res.json() as { detail: string }
    expect(body.detail).toContain("review")
  })

  it("rejects update when status is published (409)", async () => {
    const publishedDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "published",
      uids: ["owner-1"],
      latestVersion: "v1",
      draftVersion: null,
    })

    mockGetResearchWithSeqNo.mockResolvedValue({ doc: publishedDoc, seqNo: 1, primaryTerm: 1 })

    const res = await getTestApp().request("/research/hum0001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(409)
    const body = await res.json() as { detail: string }
    expect(body.detail).toContain("published")
  })

  it("does not call updateResearch when status is not draft", async () => {
    const reviewDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "review",
      uids: ["owner-1"],
    })

    mockGetResearchWithSeqNo.mockResolvedValue({ doc: reviewDoc, seqNo: 1, primaryTerm: 1 })

    await getTestApp().request("/research/hum0001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })

    expect(mockUpdateResearch).not.toHaveBeenCalled()
  })

  it("rejects unauthenticated update with 401 before status check", async () => {
    const draftDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "draft",
      uids: ["owner-1"],
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: draftDoc, seqNo: 1, primaryTerm: 1 })

    const res = await getTestApp().request("/research/hum0001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(401)
    expect(mockUpdateResearch).not.toHaveBeenCalled()
  })

  it("rejects non-owner authenticated update with 403 — ownership check precedes status guard", async () => {
    // A non-owner / non-admin user must be refused at the ownership gate (403)
    // BEFORE the requireDraftStatus check runs. If the order were reversed,
    // a stranger hitting a draft Research would still see 403 (same outcome),
    // but a stranger hitting a non-draft Research would get a 409 — which
    // leaks status of resources they have no business knowing about.
    const draftDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "draft",
      uids: ["owner-1"],
      latestVersion: null,
      draftVersion: "v1",
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: draftDoc, seqNo: 1, primaryTerm: 1 })

    const stranger = userAuthHeader({ userId: "stranger-9" })
    const res = await getTestApp().request("/research/hum0001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...stranger },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(403)
    expect(mockUpdateResearch).not.toHaveBeenCalled()
  })

  it("returns 403 (not 409) when a stranger hits a non-draft Research — ownership fails first", async () => {
    // Regression anchor for the ordering invariant above with a non-draft
    // resource: the response must be 403, never 409. A 409 would imply the
    // server inspected status before authorising the caller.
    const publishedDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "published",
      uids: ["owner-1"],
      latestVersion: "v1",
      draftVersion: null,
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: publishedDoc, seqNo: 1, primaryTerm: 1 })

    const stranger = userAuthHeader({ userId: "stranger-9" })
    const res = await getTestApp().request("/research/hum0001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...stranger },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(403)
    expect(mockUpdateResearch).not.toHaveBeenCalled()
  })
})

// === Patch (published) ===

const admin = adminAuthHeader({ userId: "admin-1" })

describe("PUT /research/{humId}/patch status guard", () => {
  beforeEach(() => {
    mockUpdateResearch.mockReset()
    mockGetResearchWithSeqNo.mockReset()
  })

  it("allows patch when status is published", async () => {
    const publishedDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "published",
      uids: ["owner-1"],
      latestVersion: "v1",
      draftVersion: null,
    })
    const updatedDoc = { ...publishedDoc, title: { ja: "修正", en: "Fixed" } }

    mockGetResearchWithSeqNo
      .mockResolvedValueOnce({ doc: publishedDoc, seqNo: 1, primaryTerm: 1 })
      .mockResolvedValueOnce({ doc: updatedDoc, seqNo: 2, primaryTerm: 1 })

    mockUpdateResearch.mockResolvedValue(updatedDoc)

    const res = await getTestApp().request("/research/hum0001/patch", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(200)
    expect(mockUpdateResearch).toHaveBeenCalled()
  })

  it("rejects patch when status is draft (409)", async () => {
    const draftDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "draft",
      uids: ["owner-1"],
      latestVersion: null,
      draftVersion: "v1",
    })

    mockGetResearchWithSeqNo.mockResolvedValue({ doc: draftDoc, seqNo: 1, primaryTerm: 1 })

    const res = await getTestApp().request("/research/hum0001/patch", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(409)
    const body = await res.json() as { detail: string }
    expect(body.detail).toContain("draft")
    expect(mockUpdateResearch).not.toHaveBeenCalled()
  })

  it("rejects patch when status is review (409)", async () => {
    const reviewDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "review",
      uids: ["owner-1"],
      latestVersion: null,
      draftVersion: "v1",
    })

    mockGetResearchWithSeqNo.mockResolvedValue({ doc: reviewDoc, seqNo: 1, primaryTerm: 1 })

    const res = await getTestApp().request("/research/hum0001/patch", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(409)
    expect(mockUpdateResearch).not.toHaveBeenCalled()
  })

  it("401 when unauthenticated", async () => {
    const res = await getTestApp().request("/research/hum0001/patch", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(401)
    expect(mockUpdateResearch).not.toHaveBeenCalled()
  })

  it("403 when stranger (not owner, not admin)", async () => {
    const publishedDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "published",
      uids: ["owner-1"],
      latestVersion: "v1",
      draftVersion: null,
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: publishedDoc, seqNo: 1, primaryTerm: 1 })

    const stranger = userAuthHeader({ userId: "stranger-9" })
    const res = await getTestApp().request("/research/hum0001/patch", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...stranger },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(403)
    expect(mockUpdateResearch).not.toHaveBeenCalled()
  })

  it("200 when admin patches published research", async () => {
    const publishedDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "published",
      uids: ["owner-1"],
      latestVersion: "v1",
      draftVersion: null,
    })
    const updatedDoc = { ...publishedDoc, title: { ja: "修正", en: "Fixed" } }

    mockGetResearchWithSeqNo
      .mockResolvedValueOnce({ doc: publishedDoc, seqNo: 1, primaryTerm: 1 })
      .mockResolvedValueOnce({ doc: updatedDoc, seqNo: 2, primaryTerm: 1 })

    mockUpdateResearch.mockResolvedValue(updatedDoc)

    const res = await getTestApp().request("/research/hum0001/patch", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...admin },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(200)
  })

  it("409 when updateResearch returns null (lock mismatch)", async () => {
    const publishedDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "published",
      uids: ["owner-1"],
      latestVersion: "v1",
      draftVersion: null,
    })
    mockGetResearchWithSeqNo.mockResolvedValue({ doc: publishedDoc, seqNo: 1, primaryTerm: 1 })
    mockUpdateResearch.mockResolvedValue(null)

    const res = await getTestApp().request("/research/hum0001/patch", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(409)
  })
})
