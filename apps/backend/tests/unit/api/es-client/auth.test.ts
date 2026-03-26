/**
 * Authorization filter tests
 *
 * Tests buildStatusFilter, canAccessResearchDoc, validateStatusTransition,
 * and canPerformTransition for all authorization levels and Research states.
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import {
  buildStatusFilter,
  canAccessResearchDoc,
  canPerformTransition,
  validateStatusTransition,
} from "@/api/es-client/auth"
import type { AuthUser, EsResearch } from "@/api/types"

import { createMockResearchDoc, createMockAuthUser } from "../helpers/mock-es"

// === buildStatusFilter ===

describe("buildStatusFilter", () => {
  it("returns null for admin (no filter)", () => {
    const admin = createMockAuthUser({ isAdmin: true })
    expect(buildStatusFilter(admin)).toBeNull()
  })

  it("returns latestVersion exists AND not deleted for public", () => {
    const filter = buildStatusFilter(null)
    expect(filter).toEqual({
      bool: {
        must: [{ exists: { field: "latestVersion" } }],
        must_not: [{ term: { status: "deleted" } }],
      },
    })
  })

  it("returns public OR own resources for authenticated", () => {
    const user = createMockAuthUser({ userId: "user-123" })
    const filter = buildStatusFilter(user)
    expect(filter).toEqual({
      bool: {
        should: [
          {
            bool: {
              must: [{ exists: { field: "latestVersion" } }],
              must_not: [{ term: { status: "deleted" } }],
            },
          },
          { term: { uids: "user-123" } },
        ],
        minimum_should_match: 1,
      },
    })
  })
})

// === canAccessResearchDoc ===

describe("canAccessResearchDoc", () => {
  const admin: AuthUser = createMockAuthUser({ isAdmin: true })
  const owner: AuthUser = createMockAuthUser({ userId: "owner-1" })
  const otherUser: AuthUser = createMockAuthUser({ userId: "other-1" })

  const published: EsResearch = createMockResearchDoc({
    status: "published",
    latestVersion: "v1",
    draftVersion: null,
    uids: ["owner-1"],
  })

  const draftFirstTime: EsResearch = createMockResearchDoc({
    status: "draft",
    latestVersion: null,
    draftVersion: "v1",
    uids: ["owner-1"],
  })

  const draftWithPublished: EsResearch = createMockResearchDoc({
    status: "draft",
    latestVersion: "v1",
    draftVersion: "v2",
    uids: ["owner-1"],
  })

  const deleted: EsResearch = createMockResearchDoc({
    status: "deleted",
    latestVersion: "v1",
    draftVersion: null,
    uids: ["owner-1"],
  })

  const deletedNeverPublished: EsResearch = createMockResearchDoc({
    status: "deleted",
    latestVersion: null,
    draftVersion: null,
    uids: ["owner-1"],
  })

  // Admin can access everything
  it("admin can access published", () => {
    expect(canAccessResearchDoc(admin, published)).toBe(true)
  })
  it("admin can access draft (first time)", () => {
    expect(canAccessResearchDoc(admin, draftFirstTime)).toBe(true)
  })
  it("admin can access deleted", () => {
    expect(canAccessResearchDoc(admin, deleted)).toBe(true)
  })

  // Public: latestVersion != null AND status != deleted
  it("public can access published", () => {
    expect(canAccessResearchDoc(null, published)).toBe(true)
  })
  it("public can access draft with latestVersion (new version in progress)", () => {
    expect(canAccessResearchDoc(null, draftWithPublished)).toBe(true)
  })
  it("public cannot access draft (first time, latestVersion=null)", () => {
    expect(canAccessResearchDoc(null, draftFirstTime)).toBe(false)
  })
  it("public cannot access deleted (even with latestVersion)", () => {
    expect(canAccessResearchDoc(null, deleted)).toBe(false)
  })
  it("public cannot access deleted (never published)", () => {
    expect(canAccessResearchDoc(null, deletedNeverPublished)).toBe(false)
  })

  // Owner
  it("owner can access own draft", () => {
    expect(canAccessResearchDoc(owner, draftFirstTime)).toBe(true)
  })
  it("owner can access own published", () => {
    expect(canAccessResearchDoc(owner, published)).toBe(true)
  })

  // Other authenticated user
  it("other user can access published", () => {
    expect(canAccessResearchDoc(otherUser, published)).toBe(true)
  })
  it("other user cannot access draft (first time, not owner)", () => {
    expect(canAccessResearchDoc(otherUser, draftFirstTime)).toBe(false)
  })
  it("other user can access draft with latestVersion (public visible)", () => {
    expect(canAccessResearchDoc(otherUser, draftWithPublished)).toBe(true)
  })
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
    ["deleted", "submit"],
    ["draft", "approve"],
    ["published", "approve"],
    ["deleted", "approve"],
    ["draft", "reject"],
    ["published", "reject"],
    ["deleted", "reject"],
    ["draft", "unpublish"],
    ["review", "unpublish"],
    ["deleted", "unpublish"],
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
  const ownerResearch = createMockResearchDoc({ uids: ["owner-id"] })

  it("null authUser -> false", () => {
    expect(canPerformTransition(null, "submit", ownerResearch)).toBe(false)
  })

  it.each([
    "submit" as const,
    "approve" as const,
    "reject" as const,
    "unpublish" as const,
  ])("admin -> true for %s", (action) => {
    const adminUser = createMockAuthUser({ isAdmin: true, userId: "admin-id" })
    expect(canPerformTransition(adminUser, action, ownerResearch)).toBe(true)
  })

  it("owner + submit -> true", () => {
    const ownerUser = createMockAuthUser({ userId: "owner-id" })
    expect(canPerformTransition(ownerUser, "submit", ownerResearch)).toBe(true)
  })

  it.each([
    "approve" as const,
    "reject" as const,
    "unpublish" as const,
  ])("owner + %s -> false", (action) => {
    const ownerUser = createMockAuthUser({ userId: "owner-id" })
    expect(canPerformTransition(ownerUser, action, ownerResearch)).toBe(false)
  })

  it("non-owner + submit -> false", () => {
    const nonOwner = createMockAuthUser({ userId: "other-id" })
    expect(canPerformTransition(nonOwner, "submit", ownerResearch)).toBe(false)
  })
})

// === canAccessResearchDoc as post-filter (defense-in-depth) ===

describe("canAccessResearchDoc as post-filter", () => {
  const admin: AuthUser = createMockAuthUser({ isAdmin: true })
  const owner: AuthUser = createMockAuthUser({ userId: "owner-1" })
  const otherUser: AuthUser = createMockAuthUser({ userId: "other-1" })

  // Minimal Pick type (simulating post-filter usage with partial fields)
  const draftNeverPublished = { latestVersion: null, status: "draft" as const, uids: ["owner-1"] }
  const draftWithPublished = { latestVersion: "v1", status: "draft" as const, uids: ["owner-1"] }
  const reviewNeverPublished = { latestVersion: null, status: "review" as const, uids: ["owner-1"] }
  const reviewWithPublished = { latestVersion: "v1", status: "review" as const, uids: ["owner-1"] }
  const published = { latestVersion: "v1", status: "published" as const, uids: ["owner-1"] }
  const deleted = { latestVersion: "v1", status: "deleted" as const, uids: ["owner-1"] }

  it("admin passes all", () => {
    expect(canAccessResearchDoc(admin, draftNeverPublished)).toBe(true)
    expect(canAccessResearchDoc(admin, deleted)).toBe(true)
  })

  it("public excludes latestVersion=null", () => {
    expect(canAccessResearchDoc(null, draftNeverPublished)).toBe(false)
  })

  it("public excludes deleted", () => {
    expect(canAccessResearchDoc(null, deleted)).toBe(false)
  })

  it("public includes published", () => {
    expect(canAccessResearchDoc(null, published)).toBe(true)
  })

  it("non-owner excludes draft with latestVersion=null", () => {
    expect(canAccessResearchDoc(otherUser, draftNeverPublished)).toBe(false)
  })

  it("owner includes own draft with latestVersion=null", () => {
    expect(canAccessResearchDoc(owner, draftNeverPublished)).toBe(true)
  })

  it("non-owner includes draft with latestVersion (public visible)", () => {
    expect(canAccessResearchDoc(otherUser, draftWithPublished)).toBe(true)
  })

  it("public excludes review with latestVersion=null", () => {
    expect(canAccessResearchDoc(null, reviewNeverPublished)).toBe(false)
  })

  it("non-owner excludes review with latestVersion=null", () => {
    expect(canAccessResearchDoc(otherUser, reviewNeverPublished)).toBe(false)
  })

  it("owner includes own review with latestVersion=null", () => {
    expect(canAccessResearchDoc(owner, reviewNeverPublished)).toBe(true)
  })

  it("non-owner includes review with latestVersion (public visible)", () => {
    expect(canAccessResearchDoc(otherUser, reviewWithPublished)).toBe(true)
  })

  it("PBT: post-filter never allows deleted for non-owner non-admin", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, otherUser),
        fc.constantFrom("v1", "v2", null),
        (user, latestVersion) => {
          const doc = { latestVersion, status: "deleted" as const, uids: ["owner-1"] }

          return !canAccessResearchDoc(user, doc)
        },
      ),
    )
  })
})
