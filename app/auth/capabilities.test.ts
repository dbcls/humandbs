import { describe, expect, it } from "vitest"

import { type Actor, CAPABILITIES, can, capabilitiesFor } from "./capabilities"

function actor(isAdmin: boolean): Actor {
  return {
    sessionId: "session",
    sub: "subject",
    name: "somebody",
    isAdmin,
    capabilities: capabilitiesFor(isAdmin),
  }
}

describe("capability の一覧", () => {
  it("同じ名前を 2 度並べていない", () => {
    expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length)
  })

  it("event の action に対応する操作をすべて名前で持っている", () => {
    expect([...CAPABILITIES]).toEqual([
      "view-unpublished",
      "edit-content",
      "publish",
      "withdraw",
      "manage-labels",
      "manage-files",
      "manage-catalog",
      "manage-site-content",
      "manage-admins",
      "delete-research",
    ])
  })
})

describe("capability の導出", () => {
  it("admin は全 capability を持つ唯一の役割", () => {
    expect(capabilitiesFor(true).size).toBe(CAPABILITIES.length)
  })

  it("ログイン済みで admin でない主体は capability を 1 つも持たない", () => {
    expect(capabilitiesFor(false).size).toBe(0)
  })

  it("未ログインは何も許されない", () => {
    expect(can(null, "publish")).toBe(false)
    expect(can(null, "view-unpublished")).toBe(false)
  })

  it("admin なら can はどの capability でも真、admin でなければ偽", () => {
    for (const capability of CAPABILITIES) {
      expect(can(actor(true), capability)).toBe(true)
      expect(can(actor(false), capability)).toBe(false)
    }
  })
})
