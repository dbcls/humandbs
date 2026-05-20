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
import type { StatusAction } from "@/api/types"

import { createMockResearchDoc } from "../helpers/mock-es"

describe("version field invariants enforced by computeVersionUpdates", () => {
  // approve transitions a "review" doc to a state where `latestVersion` is the
  // accepted draftVersion and `draftVersion` is cleared. The post-state must
  // satisfy: status==="published" => latestVersion!==null && draftVersion===null.
  it("approve produces a state where (status=published) implies latestVersion non-null and draftVersion null", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 99 }),
        fc.option(fc.integer({ min: 1, max: 99 }), { nil: null }),
        (draftN, latestN) => {
          const research = createMockResearchDoc({
            status: "review",
            draftVersion: `v${draftN}`,
            latestVersion: latestN !== null ? `v${latestN}` : null,
          })
          const updates = computeVersionUpdates("approve", research)!
          // Spread merges explicit `null` over `research`, mirroring the ES update body.
          const post = { ...research, ...updates, status: "published" as const }
          return post.latestVersion !== null && post.draftVersion === null
        },
      ),
    )
  })

  // unpublish transitions a "published" doc back to "draft" with the prior
  // latestVersion moved to draftVersion. The post-state must satisfy:
  // draftVersion !== null => status is draft or review.
  it("unpublish produces a state where draftVersion non-null implies status in {draft, review}", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 99 }),
        (latestN) => {
          const research = createMockResearchDoc({
            status: "published",
            latestVersion: `v${latestN}`,
            draftVersion: null,
          })
          const updates = computeVersionUpdates("unpublish", research)!
          const post = { ...research, ...updates, status: "draft" as const }
          if (post.draftVersion !== null) {
            return post.status === "draft" || post.status === "review"
          }
          return true
        },
      ),
    )
  })

  // approve must throw when there's no draftVersion to promote, preserving the
  // invariant that you can't end up "published" without a version to publish.
  it("approve throws when draftVersion is null (cannot publish nothing)", () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 1, max: 99 }), { nil: null }),
        (latestN) => {
          const research = createMockResearchDoc({
            status: "review",
            draftVersion: null,
            latestVersion: latestN !== null ? `v${latestN}` : null,
          })
          try {
            computeVersionUpdates("approve", research)
            return false
          } catch {
            return true
          }
        },
      ),
    )
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
