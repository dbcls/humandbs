import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { draftAside, draftNameOf, draftNameShown, plannedDraftName } from "./draft-name"

describe("plannedDraftName", () => {
  it("plans the number after the highest published, and v1 with none", () => {
    expect(plannedDraftName(null)).toBe("v1 予定")
    fc.assert(fc.property(fc.integer({ min: 0, max: 10_000 }), (highest) => {
      expect(plannedDraftName(highest)).toBe(`v${String(highest + 1)} 予定`)
    }))
  })
})

describe("draftNameOf", () => {
  it("drops the spaces around a name and refuses one with nothing else in it", () => {
    expect(draftNameOf("  v2 予定 ")).toBe("v2 予定")
    fc.assert(fc.property(fc.string({ unit: fc.constantFrom(" ", "\t", "\n", "　") }), (blank) => {
      expect(draftNameOf(blank)).toBeNull()
    }))
  })
})

describe("draftAside", () => {
  it("puts the draft's name after the research's identifier", () => {
    expect(draftAside("hum0006", "v7 予定", "ja")).toBe("hum0006 / v7 予定")
    expect(draftAside(undefined, "v1 予定", "ja")).toBe("v1 予定")
  })

  it("adds nothing for an update, which its version's number names", () => {
    expect(draftAside("hum0006", null, "ja")).toBe("hum0006")
    expect(draftAside(undefined, null, "ja")).toBeUndefined()
  })

  it("shows that a draft has no name rather than showing nothing", () => {
    expect(draftNameShown("", "ja")).toBe("名前未入力")
    expect(draftAside("hum0006", "", "ja")).toBe("hum0006 / 名前未入力")
  })
})
