/**
 * deleteResearch tests
 *
 * Verifies that logical deletion correctly updates all fields
 * including draftVersion, and physically deletes linked Datasets.
 * ES client is mocked (external boundary).
 */
import { describe, expect, it, mock, beforeEach } from "bun:test"

// Mock ES client (external boundary: DB)
const mockUpdate = mock<(...args: unknown[]) => Promise<unknown>>()
const mockDeleteByQuery = mock<(...args: unknown[]) => Promise<unknown>>()

void mock.module("@/api/es-client/client", () => ({
  esClient: {
    update: (...args: unknown[]) => mockUpdate(...args),
    deleteByQuery: (...args: unknown[]) => mockDeleteByQuery(...args),
    get: mock(),
    search: mock(),
    index: mock(),
    delete: mock(),
    count: mock(),
  },
  ES_INDEX: {
    research: "research",
    researchVersion: "research-version",
    dataset: "dataset",
  },
  isDocumentExistsError: () => false,
}))

const { deleteResearch } = await import("@/api/es-client/research")

describe("deleteResearch", () => {
  beforeEach(() => {
    mockUpdate.mockReset()
    mockDeleteByQuery.mockReset()
    mockUpdate.mockResolvedValue({})
    mockDeleteByQuery.mockResolvedValue({ deleted: 0 })
  })

  it("sets status to 'deleted'", async () => {
    await deleteResearch("hum0001", 1, 1)

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const callArgs = mockUpdate.mock.calls[0][0] as Record<string, unknown>
    const doc = (callArgs.body as { doc: Record<string, unknown> }).doc
    expect(doc.status).toBe("deleted")
  })

  it("clears draftVersion to null", async () => {
    await deleteResearch("hum0001", 1, 1)

    const callArgs = mockUpdate.mock.calls[0][0] as Record<string, unknown>
    const doc = (callArgs.body as { doc: Record<string, unknown> }).doc
    expect(doc.draftVersion).toBeNull()
  })

  it("updates dateModified", async () => {
    await deleteResearch("hum0001", 1, 1)

    const callArgs = mockUpdate.mock.calls[0][0] as Record<string, unknown>
    const doc = (callArgs.body as { doc: Record<string, unknown> }).doc
    expect(doc.dateModified).toBeString()
    expect(doc.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("uses optimistic locking (if_seq_no / if_primary_term)", async () => {
    await deleteResearch("hum0001", 42, 7)

    const callArgs = mockUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(callArgs.if_seq_no).toBe(42)
    expect(callArgs.if_primary_term).toBe(7)
  })

  it("physically deletes linked Datasets", async () => {
    await deleteResearch("hum0001", 1, 1)

    expect(mockDeleteByQuery).toHaveBeenCalledTimes(1)
    const callArgs = mockDeleteByQuery.mock.calls[0][0] as Record<string, unknown>
    expect(callArgs.index).toBe("dataset")
    expect(callArgs.query).toEqual({ term: { humId: "hum0001" } })
  })

  it("returns true on success", async () => {
    const result = await deleteResearch("hum0001", 1, 1)
    expect(result).toBe(true)
  })

  it("returns false on version conflict (409)", async () => {
    mockUpdate.mockRejectedValue({
      meta: { statusCode: 409 },
    })

    const result = await deleteResearch("hum0001", 1, 1)
    expect(result).toBe(false)
  })

  it("does not delete Datasets on version conflict", async () => {
    mockUpdate.mockRejectedValue({
      meta: { statusCode: 409 },
    })

    await deleteResearch("hum0001", 1, 1)
    expect(mockDeleteByQuery).not.toHaveBeenCalled()
  })
})
