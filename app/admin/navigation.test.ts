import { describe, expect, it } from "vitest"

import { LOCALES } from "~/i18n/locale"

import { adminNavigation, isHere } from "./navigation"
import { adminPath } from "./urls"

describe("管理のナビ", () => {
  it("どの言語でも同じ行き先を、その言語の語で出す", () => {
    const paths = LOCALES.map((locale) => adminNavigation(locale).map((entry) => entry.path))
    expect(new Set(paths.map((one) => one.join(",")))).toHaveLength(1)
    for (const locale of LOCALES) {
      for (const entry of adminNavigation(locale)) {
        expect(entry.label).not.toBe("")
      }
    }
  })

  it("同じ行き先を二度出さない", () => {
    const paths = adminNavigation("ja").map((entry) => entry.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it("すべての行き先が管理の下にある", () => {
    for (const entry of adminNavigation("ja")) {
      expect(entry.path === adminPath() || entry.path.startsWith(`${adminPath()}/`)).toBe(true)
    }
  })
})

describe("現在地", () => {
  const research = { path: "/admin/research", label: "研究の管理" }
  const overview = { path: adminPath(), label: "管理トップ" }

  it("その下にいるときも光る", () => {
    expect(isHere(research, "/admin/research")).toBe(true)
    expect(isHere(research, "/admin/research/abc")).toBe(true)
    expect(isHere(research, "/admin/research/abc/draft/def/publish")).toBe(true)
  })

  /** The slash is what keeps a longer name from being read as a child. */
  it("名前が前方一致するだけの別の行き先では光らない", () => {
    expect(isHere(research, "/admin/researchers")).toBe(false)
    expect(isHere(research, "/admin/research-list")).toBe(false)
  })

  it("よその区画にいるときは光らない", () => {
    expect(isHere(research, "/admin/catalog")).toBe(false)
    expect(isHere(research, "/research/hum0103")).toBe(false)
  })

  /**
   * Every other address begins with the area's own, so the entry for it has to
   * match itself and nothing else — otherwise two entries light at once on
   * every screen.
   */
  it("管理トップは自分自身のときだけ光る", () => {
    expect(isHere(overview, "/admin")).toBe(true)
    expect(isHere(overview, "/admin/research")).toBe(false)
    expect(isHere(overview, "/admin/catalog")).toBe(false)
  })
})
