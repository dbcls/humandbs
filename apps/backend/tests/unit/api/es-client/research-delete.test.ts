/**
 * deleteResearch tests
 *
 * Verifies that physical deletion removes Research, ResearchVersions,
 * and linked Datasets. ES client is mocked (external boundary).
 */
import { describe, expect, it, mock, beforeEach } from "bun:test"

const mockDelete = mock<(...args: unknown[]) => Promise<unknown>>()
const mockDeleteByQuery = mock<(...args: unknown[]) => Promise<unknown>>()

void mock.module("@/api/es-client/client", () => ({
  esClient: {
    delete: (...args: unknown[]) => mockDelete(...args),
    deleteByQuery: (...args: unknown[]) => mockDeleteByQuery(...args),
    update: mock(),
    get: mock(),
    search: mock(),
    index: mock(),
    count: mock(),
  },
  ES_INDEX: {
    research: "research",
    researchVersion: "research-version",
    dataset: "dataset",
  },
  isConflictError: (e: unknown) => Boolean(
    e && typeof e === "object" && "meta" in e
    && (e as { meta?: { statusCode?: number } }).meta?.statusCode === 409,
  ),
  isDocumentExistsError: () => false,
}))

const { deleteResearch } = await import("@/api/es-client/research")

describe("deleteResearch", () => {
  beforeEach(() => {
    mockDelete.mockReset()
    mockDeleteByQuery.mockReset()
    mockDelete.mockResolvedValue({})
    mockDeleteByQuery.mockResolvedValue({ deleted: 0 })
  })

  it("physically deletes the Research document", async () => {
    await deleteResearch("hum0001", 1, 1)

    expect(mockDelete).toHaveBeenCalledTimes(1)
    const callArgs = mockDelete.mock.calls[0][0] as Record<string, unknown>
    expect(callArgs.index).toBe("research")
    expect(callArgs.id).toBe("hum0001")
  })

  it("uses optimistic locking (if_seq_no / if_primary_term)", async () => {
    await deleteResearch("hum0001", 42, 7)

    const callArgs = mockDelete.mock.calls[0][0] as Record<string, unknown>
    expect(callArgs.if_seq_no).toBe(42)
    expect(callArgs.if_primary_term).toBe(7)
  })

  it("physically deletes linked ResearchVersions", async () => {
    await deleteResearch("hum0001", 1, 1)

    const versionCall = mockDeleteByQuery.mock.calls[0][0] as Record<string, unknown>
    expect(versionCall.index).toBe("research-version")
    expect(versionCall.query).toEqual({ term: { humId: "hum0001" } })
  })

  it("physically deletes linked Datasets", async () => {
    await deleteResearch("hum0001", 1, 1)

    expect(mockDeleteByQuery).toHaveBeenCalledTimes(2)
    const datasetCall = mockDeleteByQuery.mock.calls[1][0] as Record<string, unknown>
    expect(datasetCall.index).toBe("dataset")
    expect(datasetCall.query).toEqual({ term: { humId: "hum0001" } })
  })

  it("returns true on success", async () => {
    const result = await deleteResearch("hum0001", 1, 1)
    expect(result).toBe(true)
  })

  it("returns false on version conflict (409)", async () => {
    mockDelete.mockRejectedValue({
      meta: { statusCode: 409 },
    })

    const result = await deleteResearch("hum0001", 1, 1)
    expect(result).toBe(false)
  })

  it("does not delete versions or datasets on version conflict", async () => {
    mockDelete.mockRejectedValue({
      meta: { statusCode: 409 },
    })

    await deleteResearch("hum0001", 1, 1)
    expect(mockDeleteByQuery).not.toHaveBeenCalled()
  })
})
