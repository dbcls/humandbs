/**
 * Tests for computeVersionUpdates (workflow state transitions)
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

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
        fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }).map(d => d.toISOString().split("T")[0]),
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
