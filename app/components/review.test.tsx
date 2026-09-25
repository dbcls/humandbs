import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { CommentAnchor } from "~/content/types"
import type { AcknowledgementView } from "~/review/comments.server"
import type { CommentView } from "~/review/comments"
import type { ReviewPageView } from "~/review/review.server"

import { ReviewScreen } from "./review"
import type { PlaceSources } from "./places"

const NO_PLACES: PlaceSources = { humLabel: null, rows: {}, datasets: [], experiments: {}, keyLabels: {} }

const RESEARCH_ID = "00000000-0000-0000-0000-000000000001"
const DRAFT_ID = "00000000-0000-0000-0000-000000000002"

function view(over: Partial<ReviewPageView> = {}): ReviewPageView {
  return {
    locale: "ja",
    researchId: RESEARCH_ID,
    draftId: DRAFT_ID,
    humLabel: "hum0001",
    draftName: "v2 予定",
    signedInName: "curator",
    share: { url: "https://example.invalid/preview/tok", enabled: false, open: false, expired: false, expiresOn: null },
    comments: [],
    places: NO_PLACES,
    unresolved: 0,
    acknowledgements: [],
    updating: null,
    ...over,
  }
}

function render(page: ReviewPageView): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => <ReviewScreen view={page} /> }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin/research/x/draft/y/review"]} />)
}

describe("the header", () => {
  it("names the screen \"レビューと共有\", the identifier beside it, and the back link to the research", () => {
    const html = render(view())
    expect(html).toContain("レビューと共有")
    expect(html).toContain("hum0001")
    expect(html).toContain(`href="/admin/research/${RESEARCH_ID}"`)
    expect(html).toContain("研究の編集へ")
    // Not to the draft — this screen's parent is the research, the same as
    // every other screen of a draft.
    expect(html).not.toContain(`href="/admin/research/${RESEARCH_ID}/draft/${DRAFT_ID}"`)
  })
})

function said(id: string, anchor: CommentAnchor, body: string): CommentView {
  return {
    id,
    anchor,
    authorName: "データ提供者",
    bySignedIn: false,
    body,
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: "2026-09-23T14:14:00.000Z",
  }
}

function pressed(over: Partial<AcknowledgementView>): AcknowledgementView {
  return { kind: "commented", name: "provider", bySignedIn: false, createdAt: "2026-09-23T14:14:00.000Z", count: 1, ...over }
}

describe("the share", () => {
  const URL_OPEN = "https://humandbs.example/preview/tok"
  const open = { url: URL_OPEN, enabled: true, open: true, expired: false, expiresOn: null }
  const closed = { ...open, enabled: false, open: false }

  it("is headed 「共有」", () => {
    expect(render(view())).toMatch(/<h2[^>]*>共有<\/h2>/)
  })

  it("writes the address out whole and lets it be followed, in a new tab", () => {
    const html = render(view({ share: open }))
    expect(html).toMatch(new RegExp(`<a href="${URL_OPEN}" target="_blank"[^>]*>${URL_OPEN}`))
  })

  it("leaves an address that opens nothing as words, not a link", () => {
    const html = render(view({ share: closed }))
    expect(html).toContain(URL_OPEN)
    expect(html).not.toContain(`href="${URL_OPEN}"`)
    expect(html).toContain("リンクのコピー")
  })

  it("keeps the address, its copy and the reissue in one row, the reissue last", () => {
    const html = render(view({ share: open }))
    const link = html.indexOf(`${URL_OPEN}<`)
    const copy = html.indexOf("リンクのコピー")
    const reissue = html.indexOf("共有リンクの再発行")
    expect(link).toBeGreaterThan(-1)
    expect(copy).toBeGreaterThan(link)
    expect(reissue).toBeGreaterThan(copy)
  })

  /** A switch the way an alert's showing is: the state as an indicator, the button offering the other. */
  it("shows the state with an indicator and offers the other state as a button that takes effect when pressed", () => {
    const on = render(view({ share: open }))
    expect(on).toContain("共有中")
    expect(on).toMatch(/<button[^>]*value="share-off" name="intent"[^>]*>[\s\S]*?共有停止/)
    expect(on).not.toContain("value=\"share-on\"")

    const off = render(view({ share: closed }))
    expect(off).toContain("未共有")
    expect(off).toMatch(/<button[^>]*value="share-on" name="intent"[^>]*>[\s\S]*?共有</)
    expect(off).not.toContain("value=\"share-off\"")
    // No box to tick: the switch is the only way to show it.
    expect(off).not.toContain("type=\"checkbox\"")
  })

  it("keeps sharing as it is when only the expiry is saved", () => {
    expect(render(view({ share: open }))).toMatch(/<input type="hidden" name="enabled" value="on"/)
    expect(render(view({ share: closed }))).toMatch(/<input type="hidden" name="enabled" value=""/)
  })

  /** What the expiry means is said by the state, not by a rule under the box. */
  it("shows the current expiry beside the state, and writes no rule under the box", () => {
    expect(render(view({ share: open }))).toContain("期限はありません。")
    expect(render(view({ share: { ...open, expiresOn: "2026-12-31" } }))).toContain("2026-12-31 まで開けます。")
    // Not shared, the expiry implies nothing about what opens.
    expect(render(view({ share: { ...closed, expiresOn: "2026-12-31" } }))).not.toContain("まで開けます")
    expect(render(view())).not.toContain("無期限")
  })

  it("keeps the switch, the date and the save on one line, the box's name beside it rather than over it", () => {
    const html = render(view({ share: open }))
    const form = html.slice(html.indexOf("value=\"share-off\"") - 600, html.indexOf("value=\"share\"") + 50)
    // The label is still the box's name for anyone not looking; the word
    // shown is the same one, read beside the box.
    expect(form).toMatch(/<label[^>]*class="sr-only"[^>]*>期限<\/label>|<label[^>]*sr-only[^>]*>[\s\S]*?期限/)
    expect(form).toContain("aria-hidden=\"true\" class=\"font-semibold text-ink-muted text-xs\">期限<")
    expect(form).not.toContain("flex flex-col")
  })

  it("marks an expired link, still shared but not opening", () => {
    const html = render(view({ share: { ...open, open: false, expired: true } }))
    expect(html).toContain("期限切れ")
    expect(html).toContain("共有中")
    expect(html).not.toContain(`href="${URL_OPEN}"`)
  })
})

describe("the open comments", () => {
  it("is headed as the panel is, and shows it when nothing is open", () => {
    const html = render(view())
    expect(html).toMatch(/<h2[^>]*>未解決のコメント<\/h2>/)
    expect(html).toContain("未解決のコメントはありません。")
  })

  it("gathers the comments under their places, each named once and by the screen's words, never by a path", () => {
    const html = render(view({
      comments: [
        said("c1", { kind: "research-field", path: "summary.aims" }, "目的は？"),
        said("c2", { kind: "draft" }, "全体について"),
        said("c3", { kind: "research-field", path: "summary.aims" }, "もう 1 つ"),
        said("c4", { kind: "dataset-field", datasetId: "d1", path: "values.x" }, "区分は？"),
        said("c5", { kind: "dataset-field", datasetId: "d2", path: "values.y" }, "未発行のもの"),
      ],
      places: {
        ...NO_PLACES,
        humLabel: "hum0001",
        datasets: [{ id: "d1", label: "JGAD000001", number: 1 }, { id: "d2", label: null, number: 2 }],
        keyLabels: { x: "区分", y: "対象" },
      },
      unresolved: 5,
    }))
    const places = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((one) => (one[1] ?? "").replace(/<[^>]+>/g, ""))
    // The place's name, then how many are open there.
    expect(places).toEqual([
      "hum0001 / 研究概要 / 目的2",
      "全体へのコメント1",
      "JGAD000001 / 区分1",
      "データセット ID 2 (ID 未発行) / 対象1",
    ])
    expect(html).not.toContain("summary.aims")
    expect(html).not.toContain("values.")
    // Nothing leads away from the list, and nothing is written here.
    expect(html).not.toContain("編集画面")
    expect(html).not.toContain("<textarea")
  })
})

describe("the readers who pressed an indicator", () => {
  it("heads each table with the first sentence of the button it lists, as the preview words it", () => {
    const html = render(view())
    expect(html).toContain("「コメントを書き終えました」を押した人")
    expect(html).toContain("「修正の必要はありません」を押した人")
    expect(html.split("押した人はいません。")).toHaveLength(3)
  })

  it("lists a reader once per indicator, with when they last pressed it (JST, to the minute) and how many times", () => {
    const html = render(view({
      acknowledgements: [
        pressed({ kind: "approved", name: "provider", createdAt: "2026-09-24T01:05:00.000Z", count: 1 }),
        pressed({ kind: "commented", name: "provider", createdAt: "2026-09-20T23:30:00.000Z", count: 3 }),
      ],
    }))
    const commented = html.slice(html.indexOf("「コメントを書き終えました」"), html.indexOf("「修正の必要はありません」"))
    const approved = html.slice(html.indexOf("「修正の必要はありません」"))
    expect(commented).toContain("2026-09-21 08:30")
    expect(commented).toContain("3 回")
    expect(approved).toContain("2026-09-24 10:05")
    expect(approved).toContain("1 回")
    // The same person is shown in both, since the two answer different rounds.
    expect(commented).toContain("provider")
    expect(approved).toContain("provider")
  })

  it("draws a table of names rather than a row of chips", () => {
    const html = render(view({ acknowledgements: [pressed({})] }))
    expect(html).toContain("<table")
    expect(html).toContain("最後に押した日時")
    expect(html).toContain("(anonymous)")
  })
})
