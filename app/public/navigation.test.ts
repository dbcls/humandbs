import { describe, expect, it } from "vitest"

import { FOOTER, NAVBAR, NAVBAR_MORE, NAVBAR_STEP, navigationPaths } from "./navigation"
import { SCREEN_PATHS } from "./urls"

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

  it("route が持つ address 以外は document の slug の形をしている", () => {
    const screens: string[] = [...SCREEN_PATHS]
    for (const path of navigationPaths()) {
      if (screens.includes(path)) continue
      expect(path.slice(1)).toMatch(/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/)
    }
  })

  it("開くのはフッタだけで、バーの項目はどれも 1 つの行き先", () => {
    expect(FOOTER.filter((entry) => entry.children !== undefined)).toHaveLength(2)
  })

  it("開く項目の子に、その項目自身と同じ行き先が並ばない", () => {
    for (const entry of FOOTER) {
      expect((entry.children ?? []).map((child) => child.path)).not.toContain(entry.path)
    }
  })

  it("バーの項目には 1 つずつ幅の段がある", () => {
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
      expect(hides, `${String(index)} 番目の段が対になっていない`).toBe(at)
    }
  })

  it("バーに出ない行き先も、メニューか サイトマップにある", () => {
    const inMenu = new Set([...NAVBAR_MORE, ...NAVBAR].map((item) => item.path))
    for (const entry of FOOTER) expect(inMenu.has(entry.path) || entry.children !== undefined).toBe(true)
  })
})
