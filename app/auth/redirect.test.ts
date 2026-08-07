import { describe, expect, it } from "vitest"

import { safeRedirectPath } from "./redirect"

describe("ログイン後の戻り先", () => {
  it("サイト内のパスはそのまま通る", () => {
    expect(safeRedirectPath("/admin")).toBe("/admin")
    expect(safeRedirectPath("/research/hum0001/v2")).toBe("/research/hum0001/v2")
  })

  it("クエリとフラグメントを保つ。一覧では検索がそこに入っている", () => {
    expect(safeRedirectPath("/research?q=%E7%B3%96%E5%B0%BF%E7%97%85&page=2"))
      .toBe("/research?q=%E7%B3%96%E5%B0%BF%E7%97%85&page=2")
    expect(safeRedirectPath("/faq#faq-21")).toBe("/faq#faq-21")
  })

  it("何も渡されなければトップに戻す", () => {
    expect(safeRedirectPath(null)).toBe("/")
    expect(safeRedirectPath(undefined)).toBe("/")
    expect(safeRedirectPath("")).toBe("/")
  })

  it("スキームを持つアドレスは外に出るのでトップに倒す", () => {
    expect(safeRedirectPath("https://evil.example/")).toBe("/")
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/")
    expect(safeRedirectPath("data:text/html,x")).toBe("/")
  })

  it("スラッシュ 2 つで始まるものは別のホストを指すのでトップに倒す", () => {
    expect(safeRedirectPath("//evil.example/")).toBe("/")
    expect(safeRedirectPath("//evil.example")).toBe("/")
  })

  it("バックスラッシュはブラウザが区切りに読むのでトップに倒す", () => {
    expect(safeRedirectPath("/\\evil.example")).toBe("/")
    expect(safeRedirectPath("/\\/evil.example")).toBe("/")
  })

  it("スラッシュで始まらないものは受けない", () => {
    expect(safeRedirectPath("admin")).toBe("/")
    expect(safeRedirectPath("../admin")).toBe("/")
  })

  it("前後の空白を落としてから判断する", () => {
    expect(safeRedirectPath("  /admin  ")).toBe("/admin")
    expect(safeRedirectPath("\n/admin")).toBe("/admin")
  })

  it("パスの途中の .. は URL 解決で畳まれる", () => {
    expect(safeRedirectPath("/research/../admin")).toBe("/admin")
  })

  it(".. で畳んだ結果がホスト指定になるものもトップに倒す", () => {
    expect(safeRedirectPath("/..//evil.example")).toBe("/")
    expect(safeRedirectPath("/research/../..//evil.example")).toBe("/")
    expect(safeRedirectPath("/..//")).toBe("/")
  })
})
