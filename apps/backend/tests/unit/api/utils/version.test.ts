/**
 * Version utility tests
 *
 * Tests for parseVersionNum, isOwnerOrAdmin, and resolveVersionForUser.
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import type { ResearchDetail } from "@/api/types"
import { isOwnerOrAdmin, parseVersionNum, resolveVersionForUser, sanitizeResearchDetailForUser } from "@/api/utils/version"

import { createMockAuthUser, createMockResearchDoc } from "../helpers/mock-es"

describe("parseVersionNum", () => {
  it.each([
    ["v1", 1],
    ["v2", 2],
    ["v10", 10],
    ["v999", 999],
  ] as const)("parses %s to %d", (input, expected) => {
    expect(parseVersionNum(input)).toBe(expected)
  })

  it.each([
    "",
    "1",
    "v",
    "abc",
    "V1",
    "v1.0",
    "v-1",
  ])("throws for invalid format: %s", (input) => {
    expect(() => parseVersionNum(input)).toThrow("Invalid version format")
  })
})

describe("isOwnerOrAdmin", () => {
  it("returns false for null authUser", () => {
    expect(isOwnerOrAdmin(null, ["owner-id"])).toBe(false)
  })

  it("returns true for admin", () => {
    const admin = createMockAuthUser({ isAdmin: true, userId: "admin-id" })
    expect(isOwnerOrAdmin(admin, ["other-id"])).toBe(true)
  })

  it("returns true when userId is in uids", () => {
    const owner = createMockAuthUser({ userId: "owner-id" })
    expect(isOwnerOrAdmin(owner, ["owner-id", "other-id"])).toBe(true)
  })

  it("returns false when userId is not in uids", () => {
    const other = createMockAuthUser({ userId: "other-id" })
    expect(isOwnerOrAdmin(other, ["owner-id"])).toBe(false)
  })
})

describe("resolveVersionForUser", () => {
  const ownerUser = createMockAuthUser({ userId: "owner-id" })
  const otherUser = createMockAuthUser({ userId: "other-id" })
  const adminUser = createMockAuthUser({ userId: "admin-id", isAdmin: true })

  const research = (latest: string | null, draft: string | null) => ({
    latestVersion: latest,
    draftVersion: draft,
    uids: ["owner-id"],
  })

  // Table-driven: [description, authUser, latestVersion, draftVersion, requestedVersion, expected]
  const cases: [string, ReturnType<typeof createMockAuthUser> | null, string | null, string | null, string | undefined, string | null][] = [
    // Public user
    ["public, no request -> latestVersion", null, "v1", "v2", undefined, "v1"],
    ["public, request v1 -> v1", null, "v1", "v2", "v1", "v1"],
    ["public, request v2 (draft) -> null", null, "v1", "v2", "v2", null],
    ["public, no latestVersion -> null", null, null, "v1", undefined, null],

    // Owner
    ["owner, no request -> draftVersion", ownerUser, "v1", "v2", undefined, "v2"],
    ["owner, no latestVersion -> draftVersion", ownerUser, null, "v1", undefined, "v1"],
    ["owner, no request, both null -> null", ownerUser, null, null, undefined, null],

    // Other authenticated user (not owner)
    ["other auth, no request -> latestVersion", otherUser, "v1", "v2", undefined, "v1"],
    ["other auth, request v2 (draft) -> null", otherUser, "v1", "v2", "v2", null],
    ["other auth, request v1 -> v1", otherUser, "v1", "v2", "v1", "v1"],

    // Other authenticated user (latestVersion=null)
    ["other auth, latestVersion=null, request v1 -> null", otherUser, null, "v1", "v1", null],

    // Public (latestVersion=null)
    ["public, latestVersion=null, request v1 -> null", null, null, "v1", "v1", null],

    // Admin
    ["admin, no request -> draftVersion", adminUser, "v1", "v2", undefined, "v2"],
    ["admin, no latestVersion -> draftVersion", adminUser, null, "v1", undefined, "v1"],
    ["admin, request v2 -> v2", adminUser, "v1", "v2", "v2", "v2"],
  ]

  it.each(cases)("%s", (_desc, authUser, latest, draft, requested, expected) => {
    const result = resolveVersionForUser(authUser, research(latest, draft), requested)
    expect(result).toBe(expected)
  })

  // PBT: admin always gets requested version back
  it("PBT: admin + requestedVersion -> always returns it", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }).map(n => `v${n}`),
        fc.option(fc.integer({ min: 1, max: 100 }).map(n => `v${n}`), { nil: null }),
        fc.option(fc.integer({ min: 1, max: 100 }).map(n => `v${n}`), { nil: null }),
        (requested, latest, draft) => {
          const result = resolveVersionForUser(adminUser, research(latest, draft), requested)
          return result === requested
        },
      ),
    )
  })

  // PBT: owner + requestedVersion -> always returns it
  it("PBT: owner + requestedVersion -> always returns it", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }).map(n => `v${n}`),
        fc.option(fc.integer({ min: 1, max: 100 }).map(n => `v${n}`), { nil: null }),
        fc.option(fc.integer({ min: 1, max: 100 }).map(n => `v${n}`), { nil: null }),
        (requested, latest, draft) => {
          const result = resolveVersionForUser(ownerUser, research(latest, draft), requested)
          return result === requested
        },
      ),
    )
  })

  // PBT: public, requestedVersion > latestVersion -> null
  it("PBT: public + requested > latestVersion -> null", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (latestNum) => {
          const requestedNum = latestNum + 1
          const result = resolveVersionForUser(null, research(`v${latestNum}`, `v${requestedNum}`), `v${requestedNum}`)
          return result === null
        },
      ),
    )
  })
})

// === PBT additions for parseVersionNum ===

describe("parseVersionNum (PBT)", () => {
  it("v0 -> 0", () => {
    expect(parseVersionNum("v0")).toBe(0)
  })

  it("PBT: vN -> N for valid integers", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99999 }),
        (n) => {
          return parseVersionNum(`v${n}`) === n
        },
      ),
    )
  })

  it("PBT: invalid formats throw", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[^v]|^v[^0-9]|^v\d+\./),
        (s) => {
          try {
            parseVersionNum(s)
            return false
          } catch {
            return true
          }
        },
      ),
    )
  })
})

// === PBT additions for isOwnerOrAdmin ===

describe("isOwnerOrAdmin (edge cases)", () => {
  it("empty uids -> non-admin is false", () => {
    const user = createMockAuthUser({ userId: "user-1" })
    expect(isOwnerOrAdmin(user, [])).toBe(false)
  })

  it("userId appears multiple times -> still true", () => {
    const user = createMockAuthUser({ userId: "user-1" })
    expect(isOwnerOrAdmin(user, ["user-1", "user-1", "user-1"])).toBe(true)
  })

  it("admin with empty uids -> true", () => {
    const admin = createMockAuthUser({ isAdmin: true, userId: "admin-1" })
    expect(isOwnerOrAdmin(admin, [])).toBe(true)
  })
})

// === sanitizeResearchDetailForUser ===

describe("sanitizeResearchDetailForUser", () => {
  // Draft-state detail with real owner-only fields populated, so masking is observable.
  const makeDetail = (overrides: Partial<ResearchDetail> = {}): ResearchDetail => {
    const { versionIds: _versionIds, ...base } = createMockResearchDoc({
      status: "draft",
      uids: ["owner-id"],
      latestVersion: "v1",
      draftVersion: "v2",
    })
    return {
      ...base,
      humVersionId: "hum0001-v2",
      version: "v2",
      versionReleaseDate: "2024-02-01",
      releaseNote: { ja: { text: "note", rawHtml: null }, en: { text: "note", rawHtml: null } },
      datasets: [],
      ...overrides,
    }
  }

  const ownerUser = createMockAuthUser({ userId: "owner-id" })
  const otherUser = createMockAuthUser({ userId: "other-id" })
  const adminUser = createMockAuthUser({ userId: "admin-id", isAdmin: true })

  it("owner sees actual values unchanged", () => {
    const detail = makeDetail()
    const result = sanitizeResearchDetailForUser(detail, ownerUser)

    expect(result.status).toBe("draft")
    expect(result.uids).toEqual(["owner-id"])
    expect(result.draftVersion).toBe("v2")
  })

  it("admin sees actual values unchanged even when not in uids", () => {
    const detail = makeDetail()
    const result = sanitizeResearchDetailForUser(detail, adminUser)

    expect(result.status).toBe("draft")
    expect(result.uids).toEqual(["owner-id"])
    expect(result.draftVersion).toBe("v2")
  })

  it("non-owner authenticated user gets masked status/uids/draftVersion", () => {
    const detail = makeDetail()
    const result = sanitizeResearchDetailForUser(detail, otherUser)

    expect(result.status).toBe("published")
    expect(result.uids).toEqual([])
    expect(result.draftVersion).toBeNull()
  })

  it("public (null authUser) gets masked status/uids/draftVersion", () => {
    const detail = makeDetail()
    const result = sanitizeResearchDetailForUser(detail, null)

    expect(result.status).toBe("published")
    expect(result.uids).toEqual([])
    expect(result.draftVersion).toBeNull()
  })

  it("does not mutate the input detail when masking", () => {
    const detail = makeDetail()
    sanitizeResearchDetailForUser(detail, null)

    // Original object is left untouched (handler relies on this).
    expect(detail.status).toBe("draft")
    expect(detail.uids).toEqual(["owner-id"])
    expect(detail.draftVersion).toBe("v2")
  })
})
