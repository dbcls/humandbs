import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { Locale } from "~/i18n/locale"
import { NAVBAR } from "~/public/navigation"

import { type Account, Announcements, SiteFooter, SiteHeader } from "./layout"

/**
 * The header and the footer read the current address, so they need a router
 * around them. A stub with one route at the address under test is enough — the
 * question is what they render, not where a click goes.
 */
function render(element: React.ReactElement, at: string): string {
  const Stub = createRoutesStub([{ path: "*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={[at]} />)
}

function header(locale: Locale, at: string, account: Account | null = null): string {
  return render(<SiteHeader locale={locale} account={account} />, at)
}

function announcements(locale: Locale, alerts: string[], untranslated = false): string {
  const rows = alerts.map((html) => ({ html, untranslated }))
  return render(<Announcements locale={locale} alerts={rows} />, "/")
}

/**
 * What is drawn inside the account's own control, found by the name it
 * announces itself by. The bar holds three of these — the navigation's overflow
 * menu and the cart are the others — so the label is what tells them apart.
 */
function circle(html: string, name: string): string {
  const found = new RegExp(`<summary[^>]*aria-label="アカウント: ${name}"[^>]*>(.*?)</summary>`, "s")
  const inside = found.exec(html)?.[1]
  // Thrown rather than returned as "": every case below asks what is *not* in
  // the circle as well as what is, and those pass on an empty string.
  if (inside === undefined) throw new Error(`アカウントの丸が無い: ${name}`)
  return inside
}

/** The addresses drawn as where the reader is, in the order they appear. */
function marked(html: string): string[] {
  return [...html.matchAll(/<a[^>]*aria-current="page"[^>]*>/g)]
    .map((match) => /href="([^"]*)"/.exec(match[0])?.[1] ?? "")
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

  it("alert はバーの中に出さない", () => {
    expect(header("ja", "/")).not.toContain("<div class=\"markdown")
  })

  it("いま見ているページの項目に現在地の印が付く", () => {
    // バーと、幅が足りないときの行き先が入るメニューの両方に出る。
    expect(marked(header("ja", "/guidelines"))).toEqual(["/guidelines", "/guidelines"])
  })

  it("その項目の下のページを見ているときも、親の項目が現在地になる", () => {
    // 索引から辿った先はまだ「ガイドライン」の中にいる。
    expect(marked(header("ja", "/guidelines/data-sharing-guidelines")))
      .toEqual(["/guidelines", "/guidelines"])
    expect(marked(header("ja", "/research/hum0103/v4"))).toEqual(["/research", "/research"])
  })

  it("名前が前方一致するだけの別のページは現在地にならない", () => {
    expect(marked(header("ja", "/data-use-something-else"))).toEqual([])
  })

  it("英語のページでも現在地は同じ項目を指す", () => {
    expect(marked(header("en", "/en/faq"))).toEqual(["/en/faq", "/en/faq"])
  })

  it("フッタのサイトマップは現在地を持たない", () => {
    expect(marked(render(<SiteFooter locale="ja" />, "/guidelines"))).toEqual([])
  })
})

describe("サイトの告知", () => {
  it("alert が無いときは器ごと出さない", () => {
    expect(announcements("ja", [])).toBe("")
  })

  it("alert があれば本文をそのまま出す", () => {
    expect(announcements("ja", ["<p>点検のお知らせ</p>"])).toContain("点検のお知らせ")
  })

  it("2 件以上の alert を並べる", () => {
    const html = announcements("ja", ["<p>一つ目</p>", "<p>二つ目</p>"])
    expect(html).toContain("一つ目")
    expect(html).toContain("二つ目")
  })

  it("読者の言語で書かれていない alert は、どの言語かを言う", () => {
    const html = announcements("ja", ["<p>Scheduled maintenance</p>"], true)
    expect(html).toContain("Scheduled maintenance")
    expect(html).toContain("英語のみ")
  })

  it("読者の言語で書かれた alert には、言語の断りを付けない", () => {
    expect(announcements("ja", ["<p>点検のお知らせ</p>"])).not.toContain("英語のみ")
  })

  it("英語の読者には、日本語だけの alert であることを英語で言う", () => {
    expect(announcements("en", ["<p>点検のお知らせ</p>"], true)).toContain("Japanese only")
  })
})

describe("ヘッダのログイン導線", () => {
  const admin: Account = { name: "curator", isAdmin: true }
  const signedIn: Account = { name: "someone", isAdmin: false }

  it("未ログインならログインリンクが、いま見ているアドレスを戻り先に持つ", () => {
    const html = header("ja", "/research?q=%E7%B3%96%E5%B0%BF%E7%97%85&page=2")
    expect(html).toContain("ログイン")
    expect(html).toContain(
      "href=\"/auth/login?redirect=%2Fresearch%3Fq%3D%25E7%25B3%2596%25E5%25B0%25BF%25E7%2597%2585%26page%3D2\"",
    )
  })

  it("未ログインならログアウトの form を出さない", () => {
    expect(header("ja", "/")).not.toContain("/auth/logout")
  })

  it("ログイン済みなら名前とログアウトを出す。ログアウトは POST でしか押せない", () => {
    const html = header("ja", "/", signedIn)
    expect(html).toContain("someone")
    expect(html).toContain("action=\"/auth/logout\"")
    expect(html).toContain("method=\"post\"")
    expect(html).not.toContain("/auth/login")
  })

  it("admin でないログイン済みには Admin への行き先を出さない", () => {
    expect(header("ja", "/", signedIn)).not.toContain("href=\"/admin\"")
  })

  it("admin には Admin への行き先を出し、英語では /en の下を指す", () => {
    expect(header("ja", "/", admin)).toContain("href=\"/admin\"")
    expect(header("en", "/en", admin)).toContain("href=\"/en/admin\"")
  })

  it("行き先の名前は「管理」ではない。申請管理システムと読み違えられる", () => {
    expect(header("ja", "/", admin)).not.toContain(">管理<")
  })

  it("ログイン済みの丸は、アカウント名の頭文字を大文字で持つ", () => {
    expect(circle(header("ja", "/", signedIn), "someone")).toContain(">S<")
  })

  it("頭文字は前後の空白を飛ばし、大文字にできない字はそのまま出る", () => {
    expect(circle(header("ja", "/", { name: "  curator", isAdmin: false }), "  curator"))
      .toContain(">C<")
    expect(circle(header("ja", "/", { name: "山田太郎", isAdmin: false }), "山田太郎"))
      .toContain(">山<")
  })

  it("頭文字はコードポイントで 1 字取る。サロゲートの片割れを出さない", () => {
    const drawn = circle(header("ja", "/", { name: "𝒜lice", isAdmin: false }), "𝒜lice")
    expect(drawn).toContain(">𝒜<")
    expect(drawn).not.toContain("\ud835<")
  })

  it("ログイン済みの丸は、ナビの畳みメニューとグリフを共有しない", () => {
    expect(circle(header("ja", "/", signedIn), "someone")).not.toContain("<svg")
  })

  it("未ログインの丸には頭文字が無い。押す先はサインインで、開くものを持たない", () => {
    expect(header("ja", "/")).not.toContain("aria-label=\"アカウント: ")
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
