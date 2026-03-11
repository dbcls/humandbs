/**
 * Authorization filter tests
 *
 * Tests buildStatusFilter and canAccessResearchDoc
 * for all authorization levels and Research states.
 */
import { describe, expect, it } from "bun:test"

import { buildStatusFilter, canAccessResearchDoc } from "@/api/es-client/auth"
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
