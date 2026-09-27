import { describe, expect, it } from "vitest"

import { COMMENTERS_PER_LINE, LINES_PER_HEADING, publishRecords, reviewActivities, slackText, type CommentRecord, type PressRecord, type PublishedRow } from "./message"

const ORIGIN = "https://humandbs.example.org"

const DRAFT: Omit<PressRecord, "kind"> = { draftId: "d1", researchId: "r1", humLabel: "hum0034", draftName: "v7 予定" }

function commentBy(authorName: string, signedIn: boolean, draft = DRAFT): CommentRecord {
  return { ...draft, authorName, signedIn }
}

function press(kind: PressRecord["kind"], draft = DRAFT): PressRecord {
  return { ...draft, kind }
}

function publish(overrides: Partial<PublishedRow> = {}): PublishedRow {
  return {
    action: "publish-version",
    kind: "research-version",
    subjectId: "v3",
    name: "hum0034 v3",
    actor: "末竹",
    locale: null,
    path: "/research/hum0034/v3",
    ...overrides,
  }
}

function siteContent(kind: "document" | "news" | "alert", overrides: Partial<PublishedRow> = {}): PublishedRow {
  return publish({ action: "publish-site-content", kind, subjectId: `${kind}-1`, ...overrides })
}

function textOf(comments: CommentRecord[], presses: PressRecord[] = [], published: PublishedRow[] = []): string {
  return slackText({ reviews: reviewActivities(comments, presses), publishes: publishRecords(published) }, ORIGIN) ?? ""
}

describe("slackText", () => {
  it("何も起きていなければ null を返し、メッセージを送らない", () => {
    expect(slackText({ reviews: [], publishes: [] }, ORIGIN)).toBeNull()
  })

  it("コメントは下書きごとに件数と書いた人の名前を 1 行で送り、ログインしていない人には (anonymous) を付ける", () => {
    const text = textOf([commentBy("山田", false), commentBy("佐藤", true), commentBy("山田", false)])
    expect(text).toBe([
      "*レビュー*",
      `• <${ORIGIN}/admin/research/r1/draft/d1/review|hum0034 / v7 予定>: コメント 3 件 (山田 (anonymous)、佐藤)`,
    ].join("\n"))
  })

  it("同じ名前でも、ログインしている人としていない人は別の人として並べる", () => {
    expect(textOf([commentBy("山田", true), commentBy("山田", false)])).toContain("コメント 2 件 (山田、山田 (anonymous))")
  })

  it(`書いた人が ${String(COMMENTERS_PER_LINE)} 人までならすべて並べ、それを超えると残りを人数にまとめる`, () => {
    const people = (count: number) => Array.from({ length: count }, (_, index) => commentBy(`人${String(index)}`, true))
    const atLimit = textOf(people(COMMENTERS_PER_LINE))
    expect(atLimit).toContain(`人${String(COMMENTERS_PER_LINE - 1)})`)
    expect(atLimit).not.toContain("ほか")

    const over = textOf([...people(COMMENTERS_PER_LINE + 3), ...people(COMMENTERS_PER_LINE + 3)])
    expect(over).toContain(`コメント ${String((COMMENTERS_PER_LINE + 3) * 2)} 件 (`)
    expect(over).toContain(`人${String(COMMENTERS_PER_LINE - 1)}、ほか 3 人)`)
    expect(over).not.toContain(`人${String(COMMENTERS_PER_LINE)}、`)
  })

  it("書いた人が何人いても、下書きの行の長さは人数によらない", () => {
    const line = (count: number) => textOf(Array.from({ length: count }, (_, index) => commentBy(`${"名".repeat(80)}${String(index).padStart(5, "0")}`, false)))
    expect(line(10_000).length - line(COMMENTERS_PER_LINE + 1).length).toBeLessThan(20)
  })

  it("ボタンは種類ごとに、レビューの画面と同じ名前で押された回数を送る", () => {
    const text = textOf([], [press("commented"), press("approved"), press("commented")])
    expect(text).toContain("hum0034 / v7 予定>: 「コメントを書き終えました」2 回、「修正の必要はありません」1 回")
    expect(text).not.toContain("コメント 0 件")
  })

  it("研究 ID の無い研究と名前の無い下書きは、画面と同じ語で呼ぶ", () => {
    const text = textOf([commentBy("山田", true, { ...DRAFT, humLabel: null, draftName: "" })])
    expect(text).toContain("|研究 (ID 未発行) / 下書き名未入力>")
  })

  it("下書きは現れた順に 1 行ずつ並べる", () => {
    const other = { ...DRAFT, draftId: "d2", humLabel: "hum0035" }
    const lines = textOf([commentBy("a", true, other), commentBy("b", true)], [press("approved", other)]).split("\n")
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain("hum0035")
    expect(lines[1]).toContain("「修正の必要はありません」1 回")
    expect(lines[2]).toContain("hum0034")
  })

  it("公開は操作の名前・研究 ID とバージョン番号・admin の名前を送り、そのバージョンの公開ページにリンクする", () => {
    expect(textOf([], [], [publish(), publish({ action: "replace-version", subjectId: "v2", name: "hum0034 v2", path: "/research/hum0034/v2" })])).toBe([
      "*公開*",
      `• 公開: <${ORIGIN}/research/hum0034/v3|hum0034 v3> (末竹)`,
      `• 公開中のバージョンの更新: <${ORIGIN}/research/hum0034/v2|hum0034 v2> (末竹)`,
    ].join("\n"))
  })

  it("公開ページが分からない公開は、リンクを付けずに名前だけを送る", () => {
    expect(textOf([], [], [publish({ path: null })])).toContain("• 公開: hum0034 v3 (末竹)")
  })

  it("記事は日本語と英語を続けて公開すると 1 行にまとめ、公開した言語ごとに公開ページへリンクする", () => {
    const article = { name: "guidelines/data-sharing-guidelines", path: "/guidelines/data-sharing-guidelines" }
    const lines = textOf([], [], [
      siteContent("document", { ...article, locale: "en" }),
      publish(),
      siteContent("document", { ...article, locale: "ja" }),
    ]).split("\n")
    expect(lines).toEqual([
      "*公開*",
      "• サイトコンテンツの公開: 記事「guidelines/data-sharing-guidelines」 "
      + `<${ORIGIN}/guidelines/data-sharing-guidelines|ja> / <${ORIGIN}/en/guidelines/data-sharing-guidelines|en> (末竹)`,
      `• 公開: <${ORIGIN}/research/hum0034/v3|hum0034 v3> (末竹)`,
    ])
  })

  it("英語だけを公開したお知らせは、英語のページだけにリンクする", () => {
    expect(textOf([], [], [siteContent("news", { name: "System update", locale: "en", path: "/news/n1" })]))
      .toContain(`• サイトコンテンツの公開: お知らせ「System update」 <${ORIGIN}/en/news/n1|en> (末竹)`)
  })

  it("同じ記事でも、公開した人が違えば別の行にする", () => {
    const lines = textOf([], [], [
      siteContent("document", { name: "about", locale: "ja", path: "/about" }),
      siteContent("document", { name: "about", locale: "en", path: "/about", actor: "佐藤" }),
    ]).split("\n")
    expect(lines).toHaveLength(3)
  })

  it("アラートはページが無く全ページに表示されるので、名前をトップページにリンクする。名前が無ければ削除済み", () => {
    const text = textOf([], [], [
      siteContent("alert", { name: "メンテナンスのお知らせ", path: "/" }),
      siteContent("alert", { subjectId: "alert-2", name: null, path: "/" }),
    ])
    expect(text).toContain(`• サイトコンテンツの公開: アラート「<${ORIGIN}/|メンテナンスのお知らせ>」 (末竹)`)
    expect(text).toContain(`• サイトコンテンツの公開: アラート「<${ORIGIN}/|削除済み>」 (末竹)`)
  })

  it("レビューを公開より先に並べる", () => {
    const lines = textOf([commentBy("a", true)], [], [publish()]).split("\n")
    expect(lines.filter((line) => line.startsWith("*"))).toEqual(["*レビュー*", "*公開*"])
  })

  it("入力された名前の <・>・& は Slack の記法にならない", () => {
    const text = textOf(
      [commentBy("<!channel>", true, { ...DRAFT, draftName: "a & <b>" })],
      [],
      [
        siteContent("news", { actor: "<!here>", name: "<https://evil.example|click>", locale: "ja", path: "/news/n1" }),
        publish({ name: "<!channel>" }),
      ],
    )
    expect(text).not.toContain("<!")
    expect(text).toContain("|hum0034 / a &amp; &lt;b&gt;>")
    expect(text).toContain("(&lt;!channel&gt;)")
    expect(text).toContain(`お知らせ「&lt;https://evil.example|click&gt;」 <${ORIGIN}/news/n1|ja> (&lt;!here&gt;)`)
    expect(text).toContain(`<${ORIGIN}/research/hum0034/v3|&lt;!channel&gt;>`)
  })

  it(`見出しの下が ${String(LINES_PER_HEADING)} 行までならすべて並べ、それを超えると残りを件数にまとめる`, () => {
    const many = (count: number) => Array.from({ length: count }, (_, index) => publish({ subjectId: `v${String(index)}`, name: `hum${String(index)}` }))
    const atLimit = textOf([], [], many(LINES_PER_HEADING)).split("\n")
    expect(atLimit).toHaveLength(LINES_PER_HEADING + 1)
    expect(atLimit.at(-1)).toContain(`hum${String(LINES_PER_HEADING - 1)}`)

    const over = textOf([], [], many(LINES_PER_HEADING + 1)).split("\n")
    expect(over).toHaveLength(LINES_PER_HEADING + 1)
    expect(over.at(-1)).toBe("• ほか 2 件")
  })
})
