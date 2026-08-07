import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { Locale } from "~/i18n/locale"
import { NAVBAR } from "~/public/navigation"

import { SiteFooter, SiteHeader } from "./layout"

/**
 * The header and the footer read the current address, so they need a router
 * around them. A stub with one route at the address under test is enough — the
 * question is what they render, not where a click goes.
 */
function render(element: React.ReactElement, at: string): string {
  const Stub = createRoutesStub([{ path: "*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={[at]} />)
}

function header(locale: Locale, at: string, alerts: string[] = []): string {
  return render(<SiteHeader locale={locale} alerts={alerts} />, at)
}

describe("サイトのヘッダ", () => {
  it("グローバルナビの項目をすべて出す", () => {
    const html = header("ja", "/faq")
    for (const entry of NAVBAR) expect(html).toContain(entry.label.ja)
  })

  it("日本語のリンクには prefix が付かず、英語のリンクは /en の下に出る", () => {
    expect(header("ja", "/faq")).toContain("href=\"/faq\"")
    expect(header("en", "/en/faq")).toContain("href=\"/en/faq\"")
  })

  it("言語切替は front page ではなく、いま見ているページの別言語を指す", () => {
    expect(header("ja", "/guidelines/data-sharing-guidelines"))
      .toContain("href=\"/en/guidelines/data-sharing-guidelines\"")
    expect(header("en", "/en/guidelines/data-sharing-guidelines"))
      .toContain("href=\"/guidelines/data-sharing-guidelines\"")
  })

  it("言語切替はクエリを持ったまま切り替える。一覧ではそこに検索が入っている", () => {
    expect(header("ja", "/research?q=%E7%B3%96%E5%B0%BF%E7%97%85&page=2"))
      .toContain("href=\"/en/research?q=%E7%B3%96%E5%B0%BF%E7%97%85&amp;page=2\"")
  })

  it("alert が無いときはバナーの器ごと出さない", () => {
    expect(header("ja", "/")).not.toContain("announcement")
    expect(header("ja", "/")).not.toContain("<div class=\"markdown")
  })

  it("alert があれば本文をそのまま出す", () => {
    expect(header("ja", "/", ["<p>点検のお知らせ</p>"])).toContain("点検のお知らせ")
  })

  it("2 件以上の alert を並べる", () => {
    const html = header("ja", "/", ["<p>一つ目</p>", "<p>二つ目</p>"])
    expect(html).toContain("一つ目")
    expect(html).toContain("二つ目")
  })
})

describe("サイトのフッタ", () => {
  it("バーに出ない項目もサイトマップには出る", () => {
    const html = render(<SiteFooter locale="ja" />, "/")
    expect(html).toContain("プライバシーポリシー")
    expect(html).toContain("NBDCヒトデータ共有ガイドライン")
  })

  it("英語では英語のラベルで出る", () => {
    expect(render(<SiteFooter locale="en" />, "/en")).toContain("Privacy Policy")
  })
})
