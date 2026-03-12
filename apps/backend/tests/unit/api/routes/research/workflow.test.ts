/**
 * Tests for computeVersionUpdates (workflow state transitions)
 */
import { describe, expect, it } from "bun:test"

import { computeVersionUpdates } from "@/api/routes/research/workflow"

import { createMockResearchDoc } from "../../helpers/mock-es"

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
})
