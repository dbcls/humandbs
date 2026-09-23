import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { researchContentInput, type DraftInput } from "~/admin/form"
import type { AdminDraftPageView } from "~/admin/pages.server"
import { emptyResearchContent } from "~/content/empty"
import { anchoredResearchView, researchListRowView, type CatalogView } from "~/public/view.server"
import type { DrawnDraft } from "~/review/preview.server"

import { DraftEditor } from "./editor"

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
    presence: [],
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

  it("leads to this draft's other faces, each by the fact that is its own way there", () => {
    const html = render({
      ...view(),
      steps: { datasets: 3, shared: true, unresolved: 4, blocks: 0, findings: 2 },
    })
    expect(html).toContain(`href="${DRAFT_BASE}/dataset"`)
    expect(html).toContain("データセット 3 件")
    expect(html).toContain(`href="${DRAFT_BASE}/review"`)
    expect(html).toContain("共有中")
    expect(html).toContain("未解決 4")
    expect(html).toContain(`href="${DRAFT_BASE}/publish"`)
    expect(html).toContain("確認 2")
    expect(html).toContain(`href="${DRAFT_BASE}/upstream"`)
    // None of the four is numbered: it is a set of facts, not a stepper.
    expect(html).not.toMatch(/rounded-full[^>]*>\s*1\s*</)
  })

  it("says \"公開できる\" rather than nothing while the gate has nothing to stop or confirm", () => {
    const html = render({
      ...view(),
      steps: { datasets: 0, shared: false, unresolved: 0, blocks: 0, findings: 0 },
    })
    expect(html).toContain("公開できる")
    expect(html).toContain("未共有")
  })
})

describe("the tools row", () => {
  /**
   * **Left to right: the pane switch, unresolved comments, who else is here,
   * the unsaved notice, then save** (`docs/admin-ui.md` の「編集画面」の
   * 「道具の行」). The unsaved notice stands to save's own right
   * (`docs/ui.md` の「押せるもの」), so save is the last control the row asks
   * anybody to press.
   */
  it("keeps one order: pane switch, unresolved comments, presence, save, its status", () => {
    const html = render(view())
    const at = (needle: string, from = 0) => {
      const found = html.indexOf(needle, from)
      expect(found, needle).toBeGreaterThan(-1)
      return found
    }
    const switchAt = at("aria-label=\"表示 pane\"")
    const unresolvedAt = at("未解決のコメント", switchAt)
    const presenceAt = at("他に開いている人はいません", unresolvedAt)
    const saveAt = at(">保存<", presenceAt)
    const statusAt = at("role=\"status\"", saveAt)
    expect(statusAt).toBeGreaterThan(saveAt)
  })

  it("counts unresolved comments from the draft's own facts, not the review screen's", () => {
    const html = render({ ...view(), steps: { datasets: 0, shared: false, unresolved: 5, blocks: 0, findings: 0 } })
    expect(html).toContain("未解決のコメント 5 件")
  })

  it("draws the pane switch once, on the tools row rather than on a pane's own tabs", () => {
    const html = render(view())
    expect([...html.matchAll(/aria-label="表示 pane"/g)]).toHaveLength(1)
  })
})

describe("the comment panel's own name", () => {
  it("names itself after the field — \"研究題目 のコメント\" rather than the bare path", () => {
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
    expect(html).toContain("title=\"研究題目 のコメント\"")
  })
})
