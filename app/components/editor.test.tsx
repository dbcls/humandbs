import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { researchContentInput, type DraftInput } from "~/admin/form"
import type { AdminDraftPageView } from "~/admin/pages.server"
import { emptyResearchContent } from "~/content/empty"
import { messagesFor } from "~/i18n/messages"
import { anchoredResearchView, researchListRowView, type CatalogView } from "~/public/view.server"
import type { DrawnDraft } from "~/review/preview.server"

import { DraftEditor } from "./editor"
import { emptyPair } from "./fields"

/** Nothing in this fixture has values, so an empty catalog draws every place. */
const NO_CATALOG: CatalogView = { keyById: new Map(), keyByCode: new Map(), termById: new Map() }

/** The draft drawn as its page, which the editor stands beside the form. */
function drawn(): DrawnDraft {
  const anchored = anchoredResearchView({
    humLabel: "hum0001",
    versionNumber: 1,
    releaseDate: "",
    latestVersionNumber: 1,
    content: emptyResearchContent(),
    datasets: [],
    datasetLabelById: new Map(),
    cau: [],
    files: { rows: [], total: 0, page: 1, pageCount: 1, rangeFrom: 0, rangeTo: 0 },
  }, "ja", NO_CATALOG)
  const row = researchListRowView({
    humLabel: "hum0001",
    content: emptyResearchContent(),
    datasetLabels: [],
    accessTermIds: [],
    platformTermIds: [],
    datePublished: null,
    dateModified: null,
  }, "ja", NO_CATALOG)
  return { humLabel: "hum0001", publishedNumber: null, view: anchored.view, row, changed: [], previous: {} }
}

function view(produce: (input: DraftInput) => void = () => undefined): AdminDraftPageView {
  const input: DraftInput = { content: researchContentInput(emptyResearchContent()) }
  produce(input)
  return {
    locale: "ja",
    researchId: "00000000-0000-0000-0000-000000000001",
    draftId: "00000000-0000-0000-0000-000000000002",
    humLabel: "hum0001",
    revision: 3,
    input,
    datasets: [],
    upstream: null,
    review: {
      changed: [],
      previous: {},
      comments: [],
      publishedNumber: null,
      signedInName: "curator",
    },
    page: drawn(),
    updating: null,
    steps: { datasets: 0, shared: false, unresolved: 0, blocks: 0, findings: 0 },
  }
}

function render(page: AdminDraftPageView): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => <DraftEditor view={page} /> }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin/research/x/draft/y"]} />)
}

describe("the editing form", () => {
  it("shows both languages of a field, each with its own state to choose", () => {
    const html = render(view())

    expect(html).toContain("lang=\"ja\"")
    expect(html).toContain("lang=\"en\"")
    expect(html).toContain("aria-label=\"値の扱い\"")
    expect(html).toContain("未確定")
    expect(html).toContain("該当なし")
  })

  /**
   * The form is read beside the page, so it runs in the page's order and under
   * the page's names; the listing's row, which the page does not show, comes
   * last (`docs/editing.md` の「編集フォーム」).
   */
  it("runs its sections in the order the page does, the listing's row last", () => {
    const html = render(view())
    // The form's sections are the addressable ones; the page beside it draws
    // headings of its own from the same part.
    const sections = [...html.matchAll(/<div id="(\w+)" class="scroll-mt-32"><section[^>]*>(?:(?!<h2).)*<h2[^>]*>([^<]*)</gs)]
      .map((found) => `${found[1]}:${found[2]}`)
    expect(sections).toEqual([
      "title:研究題目", "releaseNote:リリースノート", "summary:研究概要", "dataProviders:提供者",
      "researchProjects:研究プロジェクト情報", "grants:助成金情報", "relatedPublications:関連論文",
      "listingSummary:研究一覧の行",
    ])
  })

  it("does not name the one field of a section a second time under its heading", () => {
    const html = render(view())
    const names = [...html.matchAll(/<span class="font-semibold text-ink-muted text-xs">([^<]*)<\/span>/g)]
      .map((found) => found[1])
    expect(names).not.toContain("研究題目")
    expect(names).not.toContain("リリースノート")
    expect(names).not.toContain("研究プロジェクト情報")
    expect(names).not.toContain("関連論文")
    expect(names).toContain("目的")
  })

  it("folds the box of a slot marked unsettled, naming the state rather than the half-typed text", () => {
    const html = render(view((input) => {
      input.content.title.ja = { state: "unknown", text: "half written" }
    }))

    expect(html).not.toContain("half written")
    expect(html).toContain("未確定")
  })

  it("marks a pair untranslated without anybody having said so", () => {
    const filled = render(view((input) => {
      input.content.title.ja = { state: "value", text: "研究題目" }
    }))
    const both = render(view((input) => {
      input.content.title.ja = { state: "value", text: "研究題目" }
      input.content.title.en = { state: "value", text: "A title" }
    }))

    expect(filled).toContain("未翻訳")
    expect(both).not.toContain("未翻訳")
  })

  it("says nothing about a conflict or refused markup until a save has been answered", () => {
    const html = render(view())

    expect(html).not.toContain("別の場所で保存されました")
    expect(html).not.toContain("文として保存できない記法があります")
  })

  it("holds no list of datasets, which the draft's dataset screen decides", () => {
    const html = render(view())
    expect(html).not.toContain("この研究にはまだデータセットがありません。")
    expect(html).not.toContain("この研究のデータセットから選んで並べます。")
  })
})

describe("the rows of a list", () => {
  it("stands the grants as a table with the page's columns, the values whole rather than cut short", () => {
    const words = messagesFor("ja").research
    const pair = (text: string) => {
      const made = emptyPair()
      made.ja.text = text
      return made
    }
    const html = render(view((input) => {
      input.content.grants = [{ id: "g1", title: pair("ロングリード技術による肺がんゲノムの研究開発"), agency: { name: pair("AMED") }, grantIds: ["JP24ama221522"] }]
    }))
    const grants = html.slice(html.indexOf("id=\"grants\""), html.indexOf("id=\"relatedPublications\""))
    expect(grants).toContain("<table")
    for (const header of [words.grantAgency, words.grantTitle, words.grantId]) expect(grants).toContain(header)
    expect(grants).toContain("ロングリード技術による肺がんゲノムの研究開発")
    expect(grants).toContain("JP24ama221522")
    expect(grants).not.toContain("truncate")
    for (const label of ["編集", "上へ", "下へ", "削除"]) expect(grants).toContain(`aria-label="${label}"`)
  })

  it("says the state a value wears — 該当なし, 未確定 — in the table rather than 未入力", () => {
    const marked = (state: "unknown" | "not-applicable") => {
      const made = emptyPair()
      made.ja.state = state
      return made
    }
    const html = render(view((input) => {
      input.content.grants = [
        { id: "g1", title: marked("not-applicable"), agency: { name: marked("unknown") }, grantIds: [] },
      ]
    }))
    const grants = html.slice(html.indexOf("id=\"grants\""), html.indexOf("id=\"relatedPublications\""))
    const table = grants.slice(grants.indexOf("<table"), grants.indexOf("</table>"))
    expect(table).toContain("該当なし")
    expect(table).toContain("未確定")
    expect(table).not.toContain("未入力")
  })

  /**
   * **A row's controls carry marks.** Taking a row away is a glyph with the
   * word as its label, the way the repeated elements' rows draw it, and adding
   * one is a word with the glyph for adding beside it; a bare word beside a
   * box reads as part of the row (`docs/ui.md` の「押せるもの」).
   */
  it("draws taking a row away as a glyph, and adding one with a glyph beside the word", () => {
    // The grant numbers are written inside a panel and are not drawn shut, so
    // the link rows are what can be read here.
    const html = render(view((input) => {
      input.content.summary.url.ja.links = [{ id: "l1", url: "https://example.org", text: "例" }]
    }))
    const removes = [...html.matchAll(/<button[^>]*aria-label="削除"[^>]*>((?:(?!<\/button>).)*)<\/button>/gs)]
    expect(removes.length).toBeGreaterThanOrEqual(1)
    for (const one of removes) expect(one[1]).toContain("<svg")

    for (const word of ["リンクの追加"]) {
      const adds = [...html.matchAll(/<button[^>]*>((?:(?!<\/button>).)*)<\/button>/gs)]
        .map((one) => one[1] ?? "")
        .filter((inner) => inner.includes(word))
      expect(adds.length, word).toBeGreaterThan(0)
      for (const inner of adds) expect(inner, word).toContain("<svg")
    }
  })
})

const RESEARCH_ID = "00000000-0000-0000-0000-000000000001"
const DRAFT_ID = "00000000-0000-0000-0000-000000000002"
const DRAFT_BASE = `/admin/research/${RESEARCH_ID}/draft/${DRAFT_ID}`

describe("the head", () => {
  it("names the screen \"研究の内容\", the identifier beside it, and the way back to the research", () => {
    const html = render(view())
    expect(html).toContain("研究の内容")
    expect(html).toContain("hum0001")
    expect(html).toContain(`href="/admin/research/${RESEARCH_ID}"`)
    expect(html).toContain("研究の編集へ")
  })

  it("names the identifier \"ID 未発行\" while the research has none yet", () => {
    const html = render({ ...view(), humLabel: null })
    expect(html).toContain("ID 未発行")
  })

  it("wears the version it updates as a badge beside the identifier, and none for an ordinary draft", () => {
    expect(render({ ...view(), updating: 3 })).toContain("v3 を更新中")
    expect(render(view())).not.toContain("を更新中")
  })

  it("leads to this draft's other faces in one order — application, datasets, review, publish — by name only", () => {
    const html = render({
      ...view(),
      steps: { datasets: 3, shared: true, unresolved: 4, blocks: 0, findings: 2 },
    })
    const head = html.slice(html.indexOf("研究の内容"), html.indexOf("role=\"tablist\""))
    const at = (needle: string) => {
      const found = head.indexOf(needle)
      expect(found, needle).toBeGreaterThan(-1)
      return found
    }
    const order = [
      at(`href="${DRAFT_BASE}/upstream"`),
      at(`href="${DRAFT_BASE}/dataset"`),
      at(`href="${DRAFT_BASE}/review"`),
      at(`href="${DRAFT_BASE}/publish"`),
    ]
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    // Named, not measured: the facts are read on each screen, and what is open is counted in the tools row.
    expect(head).not.toContain("3 件")
    expect(head).not.toContain("共有中")
    expect(head).not.toContain("確認 2")
    // None of the four is numbered: a set of ways, not a stepper.
    expect(head).not.toMatch(/rounded-full[^>]*>\s*1\s*</)
  })

  it("marks each of the four as a way to another screen — the chevron after the word, which moves when pointed at", () => {
    const html = render(view())
    const head = html.slice(html.indexOf("研究の内容"), html.indexOf("role=\"tablist\""))
    expect(head.match(/group-hover\/way:translate-x-0\.5/g)).toHaveLength(4)
    // The tools row under them leads nowhere and carries no such mark.
    const tools = head.slice(head.indexOf(">保存<"))
    expect(tools).not.toContain("group-hover/way:translate-x-0.5")
  })
})

describe("the tools row", () => {
  /**
   * **Left to right: save, its status, the memo, the whole, what is still
   * open, then the pane switch at the far end** (`docs/admin-ui.md` の
   * 「編集画面」の「道具の行」). The unsaved notice stands to save's own right
   * (`docs/ui.md` の「押せるもの」).
   */
  it("keeps one order: save, its status, memo, whole, open comments, the pane switch", () => {
    const html = render(view())
    const at = (needle: string, from = 0) => {
      const found = html.indexOf(needle, from)
      expect(found, needle).toBeGreaterThan(-1)
      return found
    }
    const saveAt = at(">保存<")
    const statusAt = at("role=\"status\"", saveAt)
    const memoAt = at("メモ", statusAt)
    const wholeAt = at("全体へのコメント", memoAt)
    const unresolvedAt = at("未解決のコメント", wholeAt)
    const switchAt = at("aria-label=\"表示 pane\"", unresolvedAt)
    expect(switchAt).toBeGreaterThan(unresolvedAt)
  })

  it("stands inside the head card — the first of the two things that stick, the panes being the second", () => {
    const html = render(view())
    const stuck = [...html.matchAll(/\bsticky\b/g)].map((found) => found.index)
    expect(stuck).toHaveLength(2)
    const saveAt = html.indexOf(">保存<")
    const tabsAt = html.indexOf("role=\"tablist\"")
    expect(saveAt).toBeGreaterThan(stuck[0] ?? -1)
    expect(stuck[1] ?? -1).toBeGreaterThan(saveAt)
    expect(tabsAt).toBeGreaterThan(stuck[1] ?? -1)
  })

  it("counts the open comments from the comments themselves — resolved ones and memo lines left out", () => {
    const withComments = view()
    const said = (id: string, anchor: AdminDraftPageView["review"]["comments"][number]["anchor"], resolved: boolean) => ({
      id,
      anchor,
      authorName: "provider",
      bySignedIn: false,
      body: "確認したい",
      resolved,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    })
    withComments.review.comments = [
      said("c1", { kind: "research-field", path: "title" }, false),
      said("c2", { kind: "draft" }, true),
      said("c3", { kind: "memo" }, false),
    ]
    const html = render(withComments)
    const entry = html.indexOf("未解決のコメント", html.indexOf("role=\"status\""))
    expect(entry).toBeGreaterThan(-1)
    expect(html.slice(entry, entry + 300)).toMatch(/>1</)
  })

  it("draws the pane switch once, on the tools row rather than on a pane's own tabs", () => {
    const html = render(view())
    expect([...html.matchAll(/aria-label="表示 pane"/g)]).toHaveLength(1)
  })
})

describe("the comment panel's own name", () => {
  it("names itself after the field — \"研究題目 へのコメント\" rather than the bare path", () => {
    const withComment = view()
    withComment.review.comments = [{
      id: "c1",
      anchor: { kind: "research-field", path: "title" },
      authorName: "provider",
      bySignedIn: false,
      body: "この題目でよいか確認したい",
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    }]
    const html = render(withComment)
    expect(html).toContain("title=\"研究題目 へのコメント\"")
  })
})

describe("a section of one prose field", () => {
  it("carries the dialect badge on its heading, and not on a name row of its own", () => {
    const html = render(view())
    expect(html).toMatch(/<h2[^>]*>リリースノート[\s\S]*?リンクと改行[\s\S]*?<\/h2>/)
    const title = html.indexOf("<h2")
    expect(html.slice(0, title)).not.toContain("リンクと改行")
  })
})

/**
 * The version's differences stand over the form once, as the take-in's own
 * list with each place as the way there; nothing else of the review stands
 * there (`docs/editing.md` の「他の版や draft と比べる」).
 */
describe("the band over the form", () => {
  it("names the version and counts the places, each a way there, with the dataset list leading to its screen", () => {
    const page = view()
    page.upstream = { theirs: page.input, differing: ["title", "summary.aims", "datasetIds"], number: 4 }
    page.review.publishedNumber = 4
    page.review.changed = ["title", "summary.aims", "datasetIds"]
    const html = render(page)
    const form = html.slice(html.indexOf("role=\"tablist\""))
    expect(form).toContain("公開されている v4 と 3 か所違います")
    expect(form).toContain(">title<")
    expect(form).toContain(`href="${DRAFT_BASE}/dataset"`)
    // The dataset list is one place, drawn once, as the way to its screen and never as a field to go to.
    expect(form.match(/>datasetIds</g)).toHaveLength(1)
    expect(form).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*>datasetIds</s)
    expect(form).toContain("3 項目をまとめて取り込み")
    expect(form.match(/公開されている v4/g)).toHaveLength(1)
  })

  it("adds the dataset list from the review's reading when the take-in does not carry it", () => {
    const page = view()
    page.upstream = { theirs: page.input, differing: ["title"], number: 2 }
    page.review.publishedNumber = 2
    page.review.changed = ["title", "datasetIds"]
    const form = render(page).slice(render(page).indexOf("role=\"tablist\""))
    expect(form).toContain("公開されている v2 と 2 か所違います")
    expect(form).toContain("1 項目をまとめて取り込み")
    expect(form.match(/>datasetIds</g)).toHaveLength(1)
  })

  it("stands only while something differs, and never says the review's own things there", () => {
    const html = render(view())
    const form = html.slice(html.indexOf("role=\"tablist\""))
    expect(form).not.toContain("か所違います")
    expect(form).not.toContain("比較の相手")
    expect(form).not.toMatch(/未解決のコメント \d+ 件/)
  })
})
