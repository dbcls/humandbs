import { describe, expect, it } from "vitest"

import { LOCALES } from "~/i18n/locale"

import { adminDestinations, type AdminDestination } from "./navigation"
import { isHere } from "./navigation"
import { adminPath } from "./urls"

/** The tree flattened, which is what a reader of the front page can press. */
function everyDestination(locale: "ja" | "en"): AdminDestination[] {
  return adminDestinations(locale).flatMap((entry) => [entry, ...entry.under ?? []])
}

describe("管理のナビ", () => {
  it("どの言語でも同じ行き先を、その言語の語で出す", () => {
    const paths = LOCALES.map((locale) => everyDestination(locale).map((entry) => entry.path))
    expect(new Set(paths.map((one) => one.join(",")))).toHaveLength(1)
    for (const locale of LOCALES) {
      for (const entry of everyDestination(locale)) {
        expect(entry.label).not.toBe("")
        expect(entry.note).not.toBe("")
      }
    }
  })

  it("同じ行き先を二度出さない", () => {
    const paths = everyDestination("ja").map((entry) => entry.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it("すべての行き先が管理の下にある", () => {
    for (const entry of everyDestination("ja")) {
      expect(entry.path === adminPath() || entry.path.startsWith(`${adminPath()}/`)).toBe(true)
    }
  })

  /**
   * 識別子を要らない管理画面は 8 つある。**地図がそれを全部持っていないと、
   * 区画のトップから行けない画面が残る** — 残る 11 画面は研究や文書を選んだ先に
   * あるので、パンくずと合わせてそこから辿る。
   */
  it("識別子を要らない 8 画面すべてを持つ", () => {
    expect(new Set(everyDestination("ja").map((entry) => entry.path))).toEqual(new Set([
      "/admin",
      "/admin/research",
      "/admin/research/upstream",
      "/admin/catalog",
      "/admin/contents",
      "/admin/contents/news",
      "/admin/contents/files",
      "/admin/assistant",
    ]))
  })

  /** つまみは区画を並べる。その中まで並べ始めたら、それは地図のほう。 */
  it("つまみが並べるのは区画だけ", () => {
    expect(adminDestinations("ja").map((entry) => entry.path)).toEqual([
      "/admin",
      "/admin/research",
      "/admin/catalog",
      "/admin/contents",
      "/admin/assistant",
    ])
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
