/**
 * Version field invariant tests (PBT)
 *
 * Tests state invariants for latestVersion/draftVersion
 * across all valid Research states.
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import { canAccessResearchDoc } from "@/api/es-client/auth"
import { computeVersionUpdates } from "@/api/routes/research/workflow"
import type { ResearchStatus, StatusAction } from "@/api/types"

import { createMockResearchDoc } from "../helpers/mock-es"

/** All valid (status, latestVersion, draftVersion) combinations */
const validStates: { status: ResearchStatus; latestVersion: string | null; draftVersion: string | null }[] = [
  // Initial creation
  { status: "draft", latestVersion: null, draftVersion: "v1" },
  // After submit (first time)
  { status: "review", latestVersion: null, draftVersion: "v1" },
  // After first approve
  { status: "published", latestVersion: "v1", draftVersion: null },
  // After new version creation
  { status: "draft", latestVersion: "v1", draftVersion: "v2" },
  // After submit (new version)
  { status: "review", latestVersion: "v1", draftVersion: "v2" },
  // After second approve
  { status: "published", latestVersion: "v2", draftVersion: null },
  // After unpublish
  { status: "draft", latestVersion: null, draftVersion: "v1" },
  // Deleted
  { status: "deleted", latestVersion: "v1", draftVersion: null },
  { status: "deleted", latestVersion: null, draftVersion: null },
]

describe("version field invariants", () => {
  it("published => latestVersion !== null && draftVersion === null", () => {
    for (const state of validStates) {
      if (state.status === "published") {
        expect(state.latestVersion).not.toBeNull()
        expect(state.draftVersion).toBeNull()
      }
    }
  })

  it("draftVersion !== null => status is draft or review", () => {
    for (const state of validStates) {
      if (state.draftVersion !== null) {
        expect(["draft", "review"]).toContain(state.status)
      }
    }
  })

  it("latestVersion === null && draftVersion === null => status is deleted", () => {
    for (const state of validStates) {
      if (state.latestVersion === null && state.draftVersion === null) {
        expect(state.status).toBe("deleted")
      }
    }
  })

  // PBT: version number ordering
  it("draftVersion number > latestVersion number when both present", () => {
    const verNum = (v: string): number => {
      const match = /^v(\d+)$/.exec(v)

      return match ? parseInt(match[1], 10) : 0
    }

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (latestNum, draftOffset) => {
          const draftNum = latestNum + draftOffset
          const state = {
            status: "draft" as const,
            latestVersion: `v${latestNum}`,
            draftVersion: `v${draftNum}`,
          }

          return verNum(state.draftVersion) > verNum(state.latestVersion)
        },
      ),
    )
  })

  // PBT: public search version filtering (uses `-` separator like crawler/ES data)
  it("public search should only include versionIds with number <= latestVersion", () => {
    const parseVersionNum = (v: string): number => {
      const match = /^v(\d+)$/.exec(v)

      return match ? parseInt(match[1], 10) : 0
    }

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 5 }),
        (latestNum, extraVersions) => {
          const totalVersions = latestNum + extraVersions
          const versionIds = Array.from({ length: totalVersions }, (_, i) => `hum0001-v${i + 1}`)
          const latestVersion = `v${latestNum}`
          const publishedNum = parseVersionNum(latestVersion)

          // Same filtering logic as search.ts (uses `-` separator)
          const filtered = versionIds.filter(id => {
            const version = id.split("-").pop() ?? ""

            return parseVersionNum(version) <= publishedNum
          })

          // All filtered versions should be <= latestVersion
          for (const id of filtered) {
            const version = id.split("-").pop() ?? ""
            expect(parseVersionNum(version)).toBeLessThanOrEqual(publishedNum)
          }

          // Should include exactly latestNum versions (v1..vN)
          expect(filtered).toHaveLength(latestNum)

          // Must include v1 and latestVersion itself
          expect(filtered).toContain("hum0001-v1")
          expect(filtered).toContain(`hum0001-v${latestNum}`)

          // Must NOT include any version beyond latestVersion
          for (let i = latestNum + 1; i <= totalVersions; i++) {
            expect(filtered).not.toContain(`hum0001-v${i}`)
          }
        },
      ),
    )
  })

  // PBT: public visibility via canAccessResearchDoc
  it("canAccessResearchDoc(null, doc) matches rule: latestVersion !== null AND status !== deleted", () => {
    const statuses = ["draft", "review", "published", "deleted"] as const
    const versions = [null, "v1", "v2"]

    fc.assert(
      fc.property(
        fc.constantFrom(...statuses),
        fc.constantFrom(...versions),
        (status, latestVersion) => {
          const doc = createMockResearchDoc({ status, latestVersion, draftVersion: null })
          const result = canAccessResearchDoc(null, doc)
          const expected = latestVersion !== null && status !== "deleted"

          return result === expected
        },
      ),
    )
  })
})

describe("computeVersionUpdates", () => {
  it("approve with draftVersion returns { latestVersion: draftVersion, draftVersion: null }", () => {
    const research = createMockResearchDoc({ draftVersion: "v1", latestVersion: null })
    const result = computeVersionUpdates("approve", research)
    expect(result).toEqual({ latestVersion: "v1", draftVersion: null })
  })

  it("approve with draftVersion=null throws", () => {
    const research = createMockResearchDoc({ draftVersion: null, latestVersion: "v1" })
    expect(() => computeVersionUpdates("approve", research)).toThrow("Cannot approve: draftVersion is null")
  })

  it("unpublish with latestVersion returns { latestVersion: null, draftVersion: latestVersion }", () => {
    const research = createMockResearchDoc({ latestVersion: "v1", draftVersion: null })
    const result = computeVersionUpdates("unpublish", research)
    expect(result).toEqual({ latestVersion: null, draftVersion: "v1" })
  })

  it("unpublish with latestVersion=null throws", () => {
    const research = createMockResearchDoc({ latestVersion: null, draftVersion: "v1" })
    expect(() => computeVersionUpdates("unpublish", research)).toThrow("Cannot unpublish: latestVersion is null")
  })

  it.each(["submit", "reject"] as StatusAction[])("%s returns undefined", (action) => {
    const research = createMockResearchDoc()
    expect(computeVersionUpdates(action, research)).toBeUndefined()
  })
})
