/**
 * Version utility tests
 *
 * Tests for parseVersionNum, isOwnerOrAdmin, and resolveVersionForUser.
 */
import { describe, expect, it, mock, beforeEach } from "bun:test"
import fc from "fast-check"

import type { ResearchDetail } from "@/api/types"

let mockIsOwnerFn: ReturnType<typeof mock>

mock.module("@/api/services/ownership", () => {
  mockIsOwnerFn = mock(async () => false)
  return {
    getOwnerUsernames: mock(async () => []),
    getOwnedHumIds: mock(async () => []),
    isOwner: mockIsOwnerFn,
    refreshOwnershipCache: mock(async () => {}),
    resetOwnershipCacheForTest: mock(() => {}),
  }
})

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
  beforeEach(() => {
    mockIsOwnerFn.mockReset()
    mockIsOwnerFn.mockImplementation(async () => false)
  })

  it("returns false for null authUser", async () => {
    expect(await isOwnerOrAdmin(null, "hum0001")).toBe(false)
  })

  it("returns true for admin", async () => {
    const admin = createMockAuthUser({ isAdmin: true, userId: "admin-id" })
    expect(await isOwnerOrAdmin(admin, "hum0001")).toBe(true)
  })

  it("returns true when isOwner returns true", async () => {
    mockIsOwnerFn.mockImplementation(async () => true)
    const owner = createMockAuthUser({ userId: "owner-id", username: "owner" })
    expect(await isOwnerOrAdmin(owner, "hum0001")).toBe(true)
  })

  it("returns false when isOwner returns false", async () => {
    const other = createMockAuthUser({ userId: "other-id", username: "other" })
    expect(await isOwnerOrAdmin(other, "hum0001")).toBe(false)
  })
})

describe("resolveVersionForUser", () => {
  const ownerUser = createMockAuthUser({ userId: "owner-id", username: "owner" })
  const otherUser = createMockAuthUser({ userId: "other-id", username: "other" })
  const adminUser = createMockAuthUser({ userId: "admin-id", username: "admin", isAdmin: true })

  const research = (latest: string | null, draft: string | null) => ({
    humId: "hum0001",
    latestVersion: latest,
    draftVersion: draft,
  })

  beforeEach(() => {
    mockIsOwnerFn.mockReset()
    mockIsOwnerFn.mockImplementation(async () => false)
  })

  it("public, no request -> latestVersion", async () => {
    expect(await resolveVersionForUser(null, research("v1", "v2"), undefined)).toBe("v1")
  })

  it("public, request v1 -> v1", async () => {
    expect(await resolveVersionForUser(null, research("v1", "v2"), "v1")).toBe("v1")
  })

  it("public, request v2 (draft) -> null", async () => {
    expect(await resolveVersionForUser(null, research("v1", "v2"), "v2")).toBeNull()
  })

  it("public, no latestVersion -> null", async () => {
    expect(await resolveVersionForUser(null, research(null, "v1"), undefined)).toBeNull()
  })

  it("owner, no request -> draftVersion", async () => {
    mockIsOwnerFn.mockImplementation(async () => true)
    expect(await resolveVersionForUser(ownerUser, research("v1", "v2"), undefined)).toBe("v2")
  })

  it("owner, no latestVersion -> draftVersion", async () => {
    mockIsOwnerFn.mockImplementation(async () => true)
    expect(await resolveVersionForUser(ownerUser, research(null, "v1"), undefined)).toBe("v1")
  })

  it("other auth, no request -> latestVersion", async () => {
    expect(await resolveVersionForUser(otherUser, research("v1", "v2"), undefined)).toBe("v1")
  })

  it("other auth, request v2 (draft) -> null", async () => {
    expect(await resolveVersionForUser(otherUser, research("v1", "v2"), "v2")).toBeNull()
  })

  it("admin, no request -> draftVersion", async () => {
    expect(await resolveVersionForUser(adminUser, research("v1", "v2"), undefined)).toBe("v2")
  })

  it("admin, request v2 -> v2", async () => {
    expect(await resolveVersionForUser(adminUser, research("v1", "v2"), "v2")).toBe("v2")
  })

  it("PBT: admin + requestedVersion -> always returns it", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }).map(n => `v${n}`),
        fc.option(fc.integer({ min: 1, max: 100 }).map(n => `v${n}`), { nil: null }),
        fc.option(fc.integer({ min: 1, max: 100 }).map(n => `v${n}`), { nil: null }),
        async (requested, latest, draft) => {
          const result = await resolveVersionForUser(adminUser, research(latest, draft), requested)
          return result === requested
        },
      ),
    )
  })

  it("PBT: public + requested > latestVersion -> null", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }),
        async (latestNum) => {
          const requestedNum = latestNum + 1
          const result = await resolveVersionForUser(null, research(`v${latestNum}`, `v${requestedNum}`), `v${requestedNum}`)
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

// === isOwnerOrAdmin edge cases ===

describe("isOwnerOrAdmin (edge cases)", () => {
  beforeEach(() => {
    mockIsOwnerFn.mockReset()
    mockIsOwnerFn.mockImplementation(async () => false)
  })

  it("non-admin with no ownership -> false", async () => {
    const user = createMockAuthUser({ userId: "user-1" })
    expect(await isOwnerOrAdmin(user, "hum0001")).toBe(false)
  })

  it("admin always true regardless of ownership", async () => {
    const admin = createMockAuthUser({ isAdmin: true, userId: "admin-1" })
    expect(await isOwnerOrAdmin(admin, "hum0001")).toBe(true)
  })
})

// === sanitizeResearchDetailForUser ===

describe("sanitizeResearchDetailForUser", () => {
  const makeDetail = (overrides: Partial<ResearchDetail> = {}): ResearchDetail => {
    const { versionIds: _versionIds, ...base } = createMockResearchDoc({
      status: "draft",
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

  const ownerUser = createMockAuthUser({ userId: "owner-id", username: "owner" })
  const otherUser = createMockAuthUser({ userId: "other-id", username: "other" })
  const adminUser = createMockAuthUser({ userId: "admin-id", username: "admin", isAdmin: true })

  beforeEach(() => {
    mockIsOwnerFn.mockReset()
    mockIsOwnerFn.mockImplementation(async () => false)
  })

  it("owner sees actual values unchanged", async () => {
    mockIsOwnerFn.mockImplementation(async () => true)
    const detail = makeDetail()
    const result = await sanitizeResearchDetailForUser(detail, ownerUser)

    expect(result.status).toBe("draft")
    expect(result.draftVersion).toBe("v2")
  })

  it("admin sees actual values unchanged", async () => {
    const detail = makeDetail()
    const result = await sanitizeResearchDetailForUser(detail, adminUser)

    expect(result.status).toBe("draft")
    expect(result.draftVersion).toBe("v2")
  })

  it("non-owner gets masked status/draftVersion", async () => {
    const detail = makeDetail()
    const result = await sanitizeResearchDetailForUser(detail, otherUser)

    expect(result.status).toBe("published")
    expect(result.draftVersion).toBeNull()
  })

  it("public (null authUser) gets masked status/draftVersion", async () => {
    const detail = makeDetail()
    const result = await sanitizeResearchDetailForUser(detail, null)

    expect(result.status).toBe("published")
    expect(result.draftVersion).toBeNull()
  })

  it("does not mutate the input detail when masking", async () => {
    const detail = makeDetail()
    await sanitizeResearchDetailForUser(detail, null)

    expect(detail.status).toBe("draft")
    expect(detail.draftVersion).toBe("v2")
  })
})
