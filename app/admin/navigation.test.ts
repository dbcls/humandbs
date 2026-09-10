import { describe, expect, it } from "vitest"

import { LOCALES } from "~/i18n/locale"

import { ADMIN_NAVBAR_STEP, adminNavbar, adminTasks, type AdminDestination } from "./navigation"
import { isHere } from "./navigation"
import { adminPath } from "./urls"

/** What a reader of the front page can press. */
function everyLink(locale: "ja" | "en"): AdminDestination[] {
  return adminTasks(locale).flatMap((task) => task.links)
}

const NAMED_STEP: Record<string, number> = { sm: 640, md: 768 }

/** The window width a step's class names, whether written out or Tailwind's own. */
function stepWidth(token: string): number {
  const arbitrary = /min-\[(\d+)px\]:/.exec(token)
  if (arbitrary !== null) return Number(arbitrary[1])
  return NAMED_STEP[/(?:^|\s)([a-z]+):/.exec(token)?.[1] ?? ""] ?? Number.NaN
}

describe("管理のナビ", () => {
  it("どの言語でも同じ行き先を、その言語の語で出す", () => {
    const paths = LOCALES.map((locale) => everyLink(locale).map((entry) => entry.path))
    expect(new Set(paths.map((one) => one.join(",")))).toHaveLength(1)
    for (const locale of LOCALES) {
      for (const task of adminTasks(locale)) {
        expect(task.title).not.toBe("")
        if (task.note !== undefined) expect(task.note).not.toBe("")
        for (const link of task.links) expect(link.label).not.toBe("")
      }
    }
  })

  it("同じ行き先を二度出さない", () => {
    const paths = everyLink("ja").map((entry) => entry.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it("すべての行き先が管理の下にある", () => {
    for (const entry of [...everyLink("ja"), ...adminNavbar("ja")]) {
      expect(entry.path === adminPath() || entry.path.startsWith(`${adminPath()}/`)).toBe(true)
    }
  })

  /** 押すと何かが作られるものは、それを編集する画面へ落ちる。 */
  it("操作の投げ先も管理の下にある", () => {
    const actions = adminTasks("ja").flatMap((task) => task.action ?? [])
    expect(actions.length).toBeGreaterThan(0)
    for (const action of actions) {
      expect(action.to.startsWith(`${adminPath()}/`)).toBe(true)
      expect(action.label).not.toBe("")
    }
  })

  /**
   * 識別子を要らない管理画面は 9 つある。区画のトップ自身を除く 8 つが作業の
   * どれかに入っていないと、そこから行けない画面が残る — 残る 12 画面は
   * 研究・下書き・記事・項目を選んだ先にある。
   */
  it("識別子を要らない 8 画面が、どれかの作業に入っている", () => {
    expect(new Set(everyLink("ja").map((entry) => entry.path))).toEqual(new Set([
      "/admin/research",
      "/admin/research/upstream",
      "/admin/experiment-fields",
      "/admin/contents",
      "/admin/contents/alert",
      "/admin/contents/news",
      "/admin/contents/files",
      "/admin/assistant",
    ]))
  })

  /**
   * バーとトップは同じ集合を同じ順で指す。片方にしか無い画面があると、そこは
   * 一方からしか辿れないか、名前が 2 つある画面になる。順まで見るのは、片方で
   * 覚えた位置がもう片方でも同じところにあるようにするため。
   */
  it("バーはトップと同じ行き先を同じ順で、トップ自身を先頭にして持つ", () => {
    for (const locale of LOCALES) {
      const bar = adminNavbar(locale).map((entry) => entry.path)
      expect(bar).toEqual([adminPath(), ...everyLink(locale).map((entry) => entry.path)])
      expect(new Set(bar).size).toBe(bar.length)
    }
  })

  /**
   * 語は h1 と同じでなくてよいが、同じ画面を指す 2 つの入口の間では揃っている
   * 必要がある — バーとトップが違う名前で呼ぶと、行き先が 2 つあるように読める。
   */
  it("同じ行き先をバーとトップが同じ語で呼ぶ", () => {
    for (const locale of LOCALES) {
      const top = new Map(everyLink(locale).map((entry) => [entry.path, entry.label]))
      for (const entry of adminNavbar(locale)) {
        const word = top.get(entry.path)
        if (word !== undefined) expect(entry.label).toBe(word)
      }
    }
  })

  /** 段が足りないと、そのエントリはどの幅でもバーに出ない。 */
  it("バーの幅の段が、並べる数だけある", () => {
    expect(ADMIN_NAVBAR_STEP).toHaveLength(adminNavbar("ja").length)
  })

  /**
   * 段は並びに従って広くなる。狭い段が後ろにあると、そのエントリは手前のものより
   * 先にバーへ出て、諦める順が並びと食い違う — 並べ替えたのに測り直さないと起きる。
   */
  it("バーの段が前から順に広くなる", () => {
    const widths = ADMIN_NAVBAR_STEP.map((step) => stepWidth(step.bar))
    expect(widths.filter(Number.isNaN)).toHaveLength(0)
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1] ?? 0)
    }
  })

  /**
   * bar と menu は同じ幅を境に入れ替わる。食い違うと、その幅でエントリが両方に
   * 出るか、どちらからも消える。
   */
  it("段の bar と menu が同じ幅で入れ替わる", () => {
    for (const step of ADMIN_NAVBAR_STEP) {
      expect(stepWidth(step.menu)).toBe(stepWidth(step.bar))
    }
  })

  it("どの言語でもバーの語が空でない", () => {
    for (const locale of LOCALES) {
      for (const entry of adminNavbar(locale)) expect(entry.label).not.toBe("")
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
    expect(isHere(research, "/admin/experiment-fields")).toBe(false)
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
    expect(isHere(overview, "/admin/experiment-fields")).toBe(false)
  })
})
