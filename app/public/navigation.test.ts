import { describe, expect, it } from "vitest"

import { FOOTER, NAVBAR, navigationPaths } from "./navigation"
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

  it("開くのはフッタ側だけが増やしていて、バーの方は 1 つに留めてある", () => {
    expect(NAVBAR.filter((entry) => entry.children !== undefined)).toHaveLength(1)
    expect(FOOTER.filter((entry) => entry.children !== undefined)).toHaveLength(2)
  })

  it("開く項目の子に、その項目自身と同じ行き先が並ばない", () => {
    for (const entry of [...NAVBAR, ...FOOTER]) {
      expect((entry.children ?? []).map((child) => child.path)).not.toContain(entry.path)
    }
  })
})
