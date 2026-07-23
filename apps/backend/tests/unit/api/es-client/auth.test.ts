/**
 * Authorization filter tests
 *
 * Tests buildStatusFilter, canAccessResearchDoc, validateStatusTransition,
 * and canPerformTransition for all authorization levels and Research states.
 */
import { describe, expect, it, mock, beforeEach } from "bun:test"
import fc from "fast-check"

import {
  buildAccessibleVersionFilter,
  buildStatusFilter,
  canAccessResearchDoc,
  canPerformTransition,
  checkRequestedStatus,
  validateStatusTransition,
} from "@/api/es-client/auth"
import type { AuthUser, ResearchStatus } from "@/api/types"

import { createMockResearchDoc, createMockAuthUser } from "../helpers/mock-es"

let mockIsOwnerFn: ReturnType<typeof mock>
let mockGetOwnedHumIdsFn: ReturnType<typeof mock>

void mock.module("@/api/services/ownership", () => {
  mockIsOwnerFn = mock(async () => false)
  mockGetOwnedHumIdsFn = mock(async () => [])
  return {
    getOwnerUsernames: mock(async () => []),
    getOwnedHumIds: mockGetOwnedHumIdsFn,
    isOwner: mockIsOwnerFn,
    refreshOwnershipCache: mock(async () => undefined),
    resetOwnershipCacheForTest: mock(() => undefined),
  }
})

// === buildStatusFilter ===

describe("buildStatusFilter", () => {
  beforeEach(() => {
    mockGetOwnedHumIdsFn.mockReset()
    mockGetOwnedHumIdsFn.mockImplementation(async () => [])
  })

  it("returns null for admin (no filter)", async () => {
    const admin = createMockAuthUser({ isAdmin: true })
    expect(await buildStatusFilter(admin)).toBeNull()
  })

  it("returns latestVersion exists for public", async () => {
    const filter = await buildStatusFilter(null)
    expect(filter).toEqual({
      exists: { field: "latestVersion" },
    })
  })

  it("returns public OR own humIds for authenticated user with no owned humIds", async () => {
    const user = createMockAuthUser({ userId: "user-123", username: "user123" })
    const filter = await buildStatusFilter(user)
    expect(filter).toEqual({
      bool: {
        should: [
          { exists: { field: "latestVersion" } },
        ],
        minimum_should_match: 1,
      },
    })
  })

  it("returns public OR own humIds for authenticated user with owned humIds", async () => {
    mockGetOwnedHumIdsFn.mockImplementation(async () => ["hum0001", "hum0002"])
    const user = createMockAuthUser({ userId: "user-123", username: "user123" })
    const filter = await buildStatusFilter(user)
    expect(filter).toEqual({
      bool: {
        should: [
          { exists: { field: "latestVersion" } },
          { terms: { humId: ["hum0001", "hum0002"] } },
        ],
        minimum_should_match: 1,
      },
    })
  })
})

// === buildAccessibleVersionFilter ===

describe("buildAccessibleVersionFilter", () => {
  it("owner humId collapses to a single humId terms clause", () => {
    const map = new Map<string, string | null>([["hum0001", "v3"]])
    const owned = new Set(["hum0001"])
    expect(buildAccessibleVersionFilter(map, owned)).toEqual({
      bool: {
        should: [{ terms: { humId: ["hum0001"] } }],
        minimum_should_match: 1,
      },
    })
  })

  it("non-owner + latestVersion enumerates v1..latestVersion", () => {
    const map = new Map<string, string | null>([["hum0002", "v3"]])
    expect(buildAccessibleVersionFilter(map, new Set())).toEqual({
      bool: {
        should: [{ terms: { humVersionId: ["hum0002-v1", "hum0002-v2", "hum0002-v3"] } }],
        minimum_should_match: 1,
      },
    })
  })

  it("non-owner + N-new-hum draft (latestVersion=null) is excluded", () => {
    const map = new Map<string, string | null>([["hum0003", null]])
    expect(buildAccessibleVersionFilter(map, new Set())).toEqual({
      term: { humId: "__no_match__" },
    })
  })

  it("empty map fails closed", () => {
    expect(buildAccessibleVersionFilter(new Map(), new Set())).toEqual({
      term: { humId: "__no_match__" },
    })
  })

  it("owner (all versions) + non-owner (up to latestVersion) mixed", () => {
    const map = new Map<string, string | null>([
      ["hum0001", "v3"],
      ["hum0002", "v2"],
      ["hum0004", null],
    ])
    const owned = new Set(["hum0001"])
    expect(buildAccessibleVersionFilter(map, owned)).toEqual({
      bool: {
        should: [
          { terms: { humVersionId: ["hum0002-v1", "hum0002-v2"] } },
          { terms: { humId: ["hum0001"] } },
        ],
        minimum_should_match: 1,
      },
    })
  })

  it("throws on malformed latestVersion for non-owner (fails loud, no silent skip)", () => {
    const map = new Map<string, string | null>([["hum0001", "draft"]])
    expect(() => buildAccessibleVersionFilter(map, new Set())).toThrow(/Invalid version format/)
  })

  it("PBT: enumerated humVersionId count = sum of parseVersionNum over non-owner entries", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.stringMatching(/^hum\d{4}$/),
            fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 20 }).map(n => `v${n}`)),
            fc.boolean(),
          ),
          { minLength: 0, maxLength: 30 },
        ),
        (entries) => {
          const map = new Map<string, string | null>()
          const owned = new Set<string>()
          for (const [humId, latest, isOwned] of entries) {
            map.set(humId, latest)
            if (isOwned) owned.add(humId)
          }
          const filter = buildAccessibleVersionFilter(map, owned)
          const expectedVersionCount = Array.from(map.entries())
            .filter(([humId, latest]) => !owned.has(humId) && latest !== null)
            .reduce((sum, [, latest]) => sum + parseInt(latest!.slice(1), 10), 0)
          if ("term" in filter) return expectedVersionCount === 0 && Array.from(map.keys()).every(h => !owned.has(h))
          const should = filter.bool?.should as { terms?: { humVersionId?: string[]; humId?: string[] } }[] | undefined
          const humVids = should?.flatMap(s => s.terms?.humVersionId ?? []) ?? []
          return humVids.length === expectedVersionCount
        },
      ),
    )
  })

  it("PBT: owner humIds never appear on the humVersionId side", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.stringMatching(/^hum\d{4}$/),
            fc.integer({ min: 1, max: 10 }).map(n => `v${n}`),
          ),
          { minLength: 1, maxLength: 20 },
        ),
        (entries) => {
          const map = new Map<string, string | null>(entries)
          const owned = new Set(Array.from(map.keys()))
          const filter = buildAccessibleVersionFilter(map, owned)
          if ("term" in filter) return false
          const should = filter.bool?.should as { terms?: { humVersionId?: string[]; humId?: string[] } }[] | undefined
          const humVids = should?.flatMap(s => s.terms?.humVersionId ?? []) ?? []
          return humVids.length === 0
        },
      ),
    )
  })
})

// === canAccessResearchDoc ===

describe("canAccessResearchDoc", () => {
  const admin: AuthUser = createMockAuthUser({ isAdmin: true })
  const owner: AuthUser = createMockAuthUser({ userId: "owner-1", username: "owner1" })
  const otherUser: AuthUser = createMockAuthUser({ userId: "other-1", username: "other1" })

  const published = createMockResearchDoc({
    humId: "hum0001",
    status: "published",
    latestVersion: "v1",
    draftVersion: null,
  })

  const draftFirstTime = createMockResearchDoc({
    humId: "hum0001",
    status: "draft",
    latestVersion: null,
    draftVersion: "v1",
  })

  const draftWithPublished = createMockResearchDoc({
    humId: "hum0001",
    status: "draft",
    latestVersion: "v1",
    draftVersion: "v2",
  })

  beforeEach(() => {
    mockIsOwnerFn.mockReset()
    mockIsOwnerFn.mockImplementation(async () => false)
  })

  it("admin can access published", async () => {
    expect(await canAccessResearchDoc(admin, published)).toBe(true)
  })
  it("admin can access draft (first time)", async () => {
    expect(await canAccessResearchDoc(admin, draftFirstTime)).toBe(true)
  })

  it("public can access published", async () => {
    expect(await canAccessResearchDoc(null, published)).toBe(true)
  })
  it("public can access draft with latestVersion", async () => {
    expect(await canAccessResearchDoc(null, draftWithPublished)).toBe(true)
  })
  it("public cannot access draft (first time)", async () => {
    expect(await canAccessResearchDoc(null, draftFirstTime)).toBe(false)
  })

  it("owner can access own draft", async () => {
    mockIsOwnerFn.mockImplementation(async () => true)
    expect(await canAccessResearchDoc(owner, draftFirstTime)).toBe(true)
  })
  it("owner can access own published", async () => {
    expect(await canAccessResearchDoc(owner, published)).toBe(true)
  })

  it("other user can access published", async () => {
    expect(await canAccessResearchDoc(otherUser, published)).toBe(true)
  })
  it("other user cannot access draft (first time)", async () => {
    expect(await canAccessResearchDoc(otherUser, draftFirstTime)).toBe(false)
  })
  it("other user can access draft with latestVersion", async () => {
    expect(await canAccessResearchDoc(otherUser, draftWithPublished)).toBe(true)
  })
})

// === checkRequestedStatus ===

describe("checkRequestedStatus", () => {
  const cases: { user: "public" | "auth" | "admin"; status: ResearchStatus | undefined; allowed: boolean }[] = [
    { user: "public", status: undefined, allowed: true },
    { user: "auth", status: undefined, allowed: true },
    { user: "admin", status: undefined, allowed: true },
    { user: "public", status: "published", allowed: true },
    { user: "auth", status: "published", allowed: true },
    { user: "admin", status: "published", allowed: true },
    { user: "public", status: "draft", allowed: false },
    { user: "auth", status: "draft", allowed: true },
    { user: "admin", status: "draft", allowed: true },
    { user: "public", status: "review", allowed: false },
    { user: "auth", status: "review", allowed: true },
    { user: "admin", status: "review", allowed: true },
  ]

  for (const { user, status, allowed } of cases) {
    it(`${user} requesting status=${status ?? "(none)"} -> ${allowed ? "allow" : "deny"}`, () => {
      const authUser = user === "public"
        ? null
        : createMockAuthUser({ isAdmin: user === "admin" })
      const result = checkRequestedStatus(authUser, status)
      expect(result.allowed).toBe(allowed)
      if (!allowed && !result.allowed) {
        expect(result.message).toBeString()
        expect(result.message.length).toBeGreaterThan(0)
      }
    })
  }
})

// === validateStatusTransition ===

describe("validateStatusTransition", () => {
  it.each([
    ["draft", "submit", null],
    ["review", "approve", null],
    ["review", "reject", null],
    ["published", "unpublish", null],
  ] as const)("valid: %s + %s -> null", (status, action, expected) => {
    expect(validateStatusTransition(status, action)).toBe(expected)
  })

  it.each([
    ["review", "submit"],
    ["published", "submit"],
    ["draft", "approve"],
    ["published", "approve"],
    ["draft", "reject"],
    ["published", "reject"],
    ["draft", "unpublish"],
    ["review", "unpublish"],
  ] as const)("invalid: %s + %s -> error message", (status, action) => {
    const result = validateStatusTransition(status, action)
    expect(result).toBeString()
    expect(result).toContain(`Cannot ${action}`)
    expect(result).toContain(status)
  })

  it("PBT: valid actions return null or non-empty string", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("draft", "review", "published", "deleted"),
        fc.constantFrom("submit" as const, "approve" as const, "reject" as const, "unpublish" as const),
        (status, action) => {
          const result = validateStatusTransition(status, action)
          return result === null || (typeof result === "string" && result.length > 0)
        },
      ),
    )
  })
})

// === canPerformTransition ===

describe("canPerformTransition", () => {
  const ownerResearch = createMockResearchDoc({ humId: "hum0001" })

  beforeEach(() => {
    mockIsOwnerFn.mockReset()
    mockIsOwnerFn.mockImplementation(async () => false)
  })

  it("null authUser -> false", async () => {
    expect(await canPerformTransition(null, "submit", ownerResearch)).toBe(false)
  })

  it.each([
    "submit" as const,
    "approve" as const,
    "reject" as const,
    "unpublish" as const,
  ])("admin -> true for %s", async (action) => {
    const adminUser = createMockAuthUser({ isAdmin: true, userId: "admin-id" })
    expect(await canPerformTransition(adminUser, action, ownerResearch)).toBe(true)
  })

  it("owner + submit -> true", async () => {
    mockIsOwnerFn.mockImplementation(async () => true)
    const ownerUser = createMockAuthUser({ userId: "owner-id", username: "owner" })
    expect(await canPerformTransition(ownerUser, "submit", ownerResearch)).toBe(true)
  })

  it.each([
    "approve" as const,
    "reject" as const,
    "unpublish" as const,
  ])("owner + %s -> false", async (action) => {
    mockIsOwnerFn.mockImplementation(async () => true)
    const ownerUser = createMockAuthUser({ userId: "owner-id", username: "owner" })
    expect(await canPerformTransition(ownerUser, action, ownerResearch)).toBe(false)
  })

  it("non-owner + submit -> false", async () => {
    const nonOwner = createMockAuthUser({ userId: "other-id", username: "other" })
    expect(await canPerformTransition(nonOwner, "submit", ownerResearch)).toBe(false)
  })
})

// === canAccessResearchDoc as post-filter ===

describe("canAccessResearchDoc as post-filter", () => {
  const admin: AuthUser = createMockAuthUser({ isAdmin: true })
  const owner: AuthUser = createMockAuthUser({ userId: "owner-1", username: "owner1" })
  const otherUser: AuthUser = createMockAuthUser({ userId: "other-1", username: "other1" })

  const draftNeverPublished = { humId: "hum0001", latestVersion: null, status: "draft" as const }
  const draftWithPublished = { humId: "hum0001", latestVersion: "v1", status: "draft" as const }
  const reviewNeverPublished = { humId: "hum0001", latestVersion: null, status: "review" as const }
  const reviewWithPublished = { humId: "hum0001", latestVersion: "v1", status: "review" as const }
  const published = { humId: "hum0001", latestVersion: "v1", status: "published" as const }

  beforeEach(() => {
    mockIsOwnerFn.mockReset()
    mockIsOwnerFn.mockImplementation(async () => false)
  })

  it("admin passes all", async () => {
    expect(await canAccessResearchDoc(admin, draftNeverPublished)).toBe(true)
  })

  it("public excludes latestVersion=null", async () => {
    expect(await canAccessResearchDoc(null, draftNeverPublished)).toBe(false)
  })

  it("public includes published", async () => {
    expect(await canAccessResearchDoc(null, published)).toBe(true)
  })

  it("non-owner excludes draft with latestVersion=null", async () => {
    expect(await canAccessResearchDoc(otherUser, draftNeverPublished)).toBe(false)
  })

  it("owner includes own draft with latestVersion=null", async () => {
    mockIsOwnerFn.mockImplementation(async () => true)
    expect(await canAccessResearchDoc(owner, draftNeverPublished)).toBe(true)
  })

  it("non-owner includes draft with latestVersion (public visible)", async () => {
    expect(await canAccessResearchDoc(otherUser, draftWithPublished)).toBe(true)
  })

  it("public excludes review with latestVersion=null", async () => {
    expect(await canAccessResearchDoc(null, reviewNeverPublished)).toBe(false)
  })

  it("non-owner excludes review with latestVersion=null", async () => {
    expect(await canAccessResearchDoc(otherUser, reviewNeverPublished)).toBe(false)
  })

  it("owner includes own review with latestVersion=null", async () => {
    mockIsOwnerFn.mockImplementation(async () => true)
    expect(await canAccessResearchDoc(owner, reviewNeverPublished)).toBe(true)
  })

  it("non-owner includes review with latestVersion (public visible)", async () => {
    expect(await canAccessResearchDoc(otherUser, reviewWithPublished)).toBe(true)
  })
})
