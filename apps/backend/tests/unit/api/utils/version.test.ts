/**
 * Version utility tests
 *
 * Tests for parseVersionNum, isOwnerOrAdmin, and resolveVersionForUser.
 */
import { describe, expect, it } from "bun:test"

import { isOwnerOrAdmin, parseVersionNum, resolveVersionForUser } from "@/api/utils/version"

import { createMockAuthUser } from "../helpers/mock-es"

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
})
