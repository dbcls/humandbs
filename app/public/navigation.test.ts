import { describe, expect, it } from "vitest"

import { FOOTER, NAVBAR, NAVBAR_STEP, navigationPaths } from "./navigation"
import { SCREEN_PATHS } from "./urls"

const NAMED_STEP: Record<string, number> = { "sm": 640, "md": 768, "lg": 1024, "xl": 1280, "2xl": 1536 }

/** The window width a step's class names, whether written out or Tailwind's own. */
function stepWidth(token: string): number {
  const arbitrary = /min-\[(\d+)px\]:/.exec(token)
  if (arbitrary !== null) return Number(arbitrary[1])
  return NAMED_STEP[/(?:^|\s)([a-z0-9]+):/.exec(token)?.[1] ?? ""] ?? Number.NaN
}

/**
 * The shape of the navigation constants. Whether each destination is answered
 * by a document is checked where the set of slugs is decided, in
 * `migration/cms.test.ts`.
 */
describe("グローバルナビとフッタ", () => {
  it("行き先はサイト内の絶対パスで、言語 prefix を含まない", () => {
    for (const path of navigationPaths()) {
      expect(path.startsWith("/")).toBe(true)
      expect(path.startsWith("//")).toBe(false)
      expect(/^\/(?:ja|en)(?:\/|$)/.test(path)).toBe(false)
    }
  })

  it("同じ行き先を 2 度返さない", () => {
    const paths = navigationPaths()
    expect(paths).toHaveLength(new Set(paths).size)
  })

  it("route で使われている address 以外は document の slug の形をしている", () => {
    const screens: string[] = [...SCREEN_PATHS]
    for (const path of navigationPaths()) {
      if (screens.includes(path)) continue
      expect(path.slice(1)).toMatch(/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/)
    }
  })

  it("開くのはフッタだけで、開く項目はどれも 1 件以上の子を持つ", () => {
    for (const entry of NAVBAR) expect("children" in entry).toBe(false)
    for (const entry of FOOTER) {
      if (entry.children === undefined) continue
      expect(entry.children.length).toBeGreaterThan(0)
    }
  })

  it("開く項目の子に、その項目自身と同じ行き先が並ばない", () => {
    for (const entry of FOOTER) {
      expect((entry.children ?? []).map((child) => child.path)).not.toContain(entry.path)
    }
  })

  it("バーの項目には 1 つずつブレークポイントがある", () => {
    expect(NAVBAR_STEP).toHaveLength(NAVBAR.length)
  })

  /**
   * The bar and the menu are complements: an entry hidden from one is shown by
   * the other at every width. Written by hand they could drift into a width
   * where a destination is in neither, which no screenshot would catch.
   */
  it("どの幅でも、バーに出ないものはメニューに出る", () => {
    for (const [index, step] of NAVBAR_STEP.entries()) {
      const at = /(?:^|\s)([\w[\]-]+):block$/.exec(step.bar)?.[1] ?? null
      const hides = step.menu === "" ? null : /^([\w[\]-]+):hidden$/.exec(step.menu)?.[1] ?? null
      expect(hides, `${String(index)} 番目のブレークポイントで bar と menu が対になっていない`).toBe(at)
    }
  })

  /**
   * A narrower step behind a wider one puts that entry in the bar before the
   * ones ahead of it, so the bar gives up entries in an order other than its
   * own. Two entries may share a step and appear together.
   */
  it("バーのブレークポイントが前から順に狭くならない", () => {
    const widths = NAVBAR_STEP.map((step) => stepWidth(step.bar))
    expect(widths.filter(Number.isNaN)).toHaveLength(0)
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1] ?? 0)
    }
  })

  it("バーに出ない行き先も、メニューか サイトマップにある", () => {
    const inMenu = new Set(NAVBAR.map((item) => item.path))
    for (const entry of FOOTER) expect(inMenu.has(entry.path) || entry.children !== undefined).toBe(true)
  })
})
