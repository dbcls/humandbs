import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { PublishPageView, PublishResult } from "~/admin/pages.server"

import { PublishConfirmation } from "./publish"

/**
 * The screen has one job the server cannot do for it: making the difference
 * between the two kinds of check visible. What stops the publish has to look
 * like a wall, and what is merely listed has to be passable with one deliberate
 * tick.
 */
function view(over: Partial<PublishPageView> = {}): PublishPageView {
  return {
    locale: "ja",
    researchId: "00000000-0000-0000-0000-000000000001",
    draftId: "00000000-0000-0000-0000-000000000002",
    humLabel: "hum0001",
    revision: 3,
    nextNumber: 2,
    nextNhaId: null,
    heldNumbers: [1],
    releaseDate: "2026-08-10",
    updating: null,
    blocks: [],
    groups: [],
    findingCount: 0,
    steps: { datasets: 0, shared: false, unresolved: 0, blocks: 0, findings: 0 },
    researchFields: 0,
    datasetChanges: [],
    comparedWith: 1,
    updatingReleaseDate: null,
    datasetRows: {},
    review: { shared: false, expired: false, unresolved: 0, acknowledgements: [], comments: [], signedInName: "curator", datasetLabels: {} },
    ...over,
  }
}

function render(page: PublishPageView, result: PublishResult | null = null): string {
  const Stub = createRoutesStub([{
    path: "/*",
    Component: () => <PublishConfirmation view={page} result={result} />,
  }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin/research/x/draft/y/publish"]} />)
}

describe("the publish screen", () => {
  it("offers the next number in a box and dates it today, on one line with the press", () => {
    const html = render(view({ nextNumber: 4, heldNumbers: [3, 1] }))
    const section = html.slice(html.indexOf(">公開</h2>"))
    const line = section.slice(section.indexOf("items-end"), section.indexOf("</button>"))

    expect(line).toContain("type=\"number\"")
    expect(line).toContain("value=\"4\"")
    expect(line).toContain("type=\"date\"")
    expect(line).toContain("value=\"2026-08-10\"")
    expect(line).toMatch(/<button[^>]*>[\s\S]*公開$/)
    // The held numbers are not listed: the server refuses them, and the next free one is offered.
    expect(section).not.toContain("v3, v1")
  })

  it("says under the line that the release date is not a schedule", () => {
    const section = (html: string): string => html.slice(html.indexOf(">公開</h2>"))
    for (const html of [render(view()), render(view({ updating: { number: 3 }, heldNumbers: [3] }))]) {
      const under = section(html).slice(section(html).indexOf("</button>"))
      expect(under).toContain("予約にはならない")
    }
  })

  it("does not tell that the draft is deleted — publishing it is what it is for", () => {
    const html = render(view())
    const updated = render(view({ updating: { number: 3 }, heldNumbers: [3] }))
    expect(html).not.toContain("下書きは削除される")
    expect(updated).not.toContain("下書きは削除される")
  })

  it("asks for no number for an update, says what the update does, and dates it the day it went out", () => {
    const html = render(view({
      updating: { number: 3 },
      releaseDate: "2024-05-01",
      updatingReleaseDate: "2024-05-01",
      heldNumbers: [3, 1],
      researchFields: 2,
    }))

    expect(html).toContain("更新前の確認")
    expect(html).toContain("公開中の v3 の内容がこの下書きの内容に置き換わる")
    expect(html).toContain("v3 の更新")
    expect(html).not.toContain("type=\"number\"")
    expect(html).not.toContain("バージョン番号は")
    expect(html).toContain("value=\"2024-05-01\"")
  })

  it("answers a number a version took in the meantime", () => {
    const html = render(view(), { status: "number-unavailable" })

    expect(html).toContain("その番号は公開中のバージョンが持っています")
  })

  it("will not let the publish be pressed while something structural is missing", () => {
    const html = render(view({
      humLabel: null,
      blocks: [{ kind: "hum-label-missing", datasetId: null }],
    }))

    expect(html).toContain(">公開できない理由</h2>")
    // Said the way the research's own screen says it — a quiet sentence, not a line in red.
    expect(html).toContain("研究 ID は未発行です。")
    expect(html).not.toContain("text-danger")
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?公開<\/button>/)
    expect(html).toContain("公開できない理由が残っているため、公開できません。")
  })

  it("offers a dataset with no id both ways to get one: typing an accession, and issuing an NHA id", () => {
    const html = render(view({
      blocks: [{ kind: "dataset-id-missing", datasetId: "00000000-0000-0000-0000-0000000000d1" }],
    }))

    const row = /<tr>(?:(?!<\/tr>)[\s\S])*d1(?:(?!<\/tr>)[\s\S])*<\/tr>/.exec(html)?.[0] ?? ""
    expect(row).toContain("NHA ID の発行")
    expect(row).toContain("割り当て")
    // The box and the buttons take the row's height.
    expect(row).toMatch(/<input[^>]*min-h-6/)
  })

  it("does not offer issuing for a missing research ID, which is typed", () => {
    const html = render(view({
      humLabel: null,
      blocks: [{ kind: "hum-label-missing", datasetId: null }],
    }))

    expect(html).not.toContain("NHA ID の発行")
  })

  /** Two rows reading the same sentence would not say which dataset each is about. */
  it("names each dataset that has no id by its row in the research's table, and never by its identity", () => {
    const d1 = "00000000-0000-0000-0000-0000000000d1"
    const d2 = "00000000-0000-0000-0000-0000000000d2"
    const html = render(view({
      blocks: [
        { kind: "dataset-id-missing", datasetId: d1 },
        { kind: "dataset-id-missing", datasetId: d2 },
      ],
      datasetRows: {
        [d1]: { id: d1, label: "", typeOfData: { state: "plain", text: "WES", untranslated: false }, accessType: null, datePublished: null },
        [d2]: { id: d2, label: "", typeOfData: { state: "plain", text: "RNA-seq", untranslated: false }, accessType: null, datePublished: null },
      },
    }))

    expect(html).toContain(`name="datasetId" value="${d1}"`)
    expect(html).toContain(`name="datasetId" value="${d2}"`)
    expect(html).not.toContain(`>${d1}<`)
    expect(html.match(/ID 未発行/g)?.length).toBe(2)
    // The table alone: the section's sentence says why they are listed.
    expect(html).not.toContain("text-danger")
    expect(html).toContain(">割り当てる ID<")
    expect(html).not.toContain(">研究 ID<")
    // What kind of data each holds is what tells the two apart.
    expect(html).toContain("WES")
    expect(html).toContain("RNA-seq")
  })

  it("groups what is listed by kind and asks for one tick over the lot", () => {
    const html = render(view({
      findingCount: 13,
      groups: [
        {
          kind: "unsettled",
          count: 12,
          fileNames: [],
          places: [{ label: "研究の記述", href: "/admin/research/x/draft/y", count: 12, note: null }],
        },
        {
          kind: "empty-dataset",
          count: 1,
          fileNames: [],
          places: [{
            label: "JGAD000001",
            href: "/admin/research/x/draft/y/dataset/z",
            count: 1,
            note: null,
          }],
        },
      ],
    }))

    // One row to a kind, read at a glance: no fold to open first.
    expect(html).toContain(">公開前に確かめるもの</h2>")
    expect(html).not.toContain("<details")
    expect(html).toMatch(/<td[^>]*>未確定の値<\/td><td[^>]*>12 件<\/td>/)
    expect(html).toContain("JGAD000001")
    expect(html).toContain("上の 13 件を確認しました")
    expect(html).toContain("type=\"checkbox\"")
    // Nothing structural is missing, so the button is live.
    expect(html).not.toMatch(/disabled=""/)
  })

  /**
   * A description belongs to the version being written, so the screen names the
   * dataset and stops there — there is no count of other versions to give.
   */
  it("names a dataset whose description this publish changes, and says what it is measured against", () => {
    const html = render(view({
      comparedWith: 4,
      datasetChanges: [
        { datasetId: "d1", label: "JGAD000001", fields: 3, isNew: false, href: "/x" },
        { datasetId: "d2", label: null, fields: 0, isNew: true, href: "/y" },
      ],
    }))

    expect(html).toContain("公開中の v4 と比べて変わるもの。")
    expect(html).toContain("JGAD000001")
    expect(html).toContain("3 項目の変更")
    expect(html).toContain("新しく公開")
    // A dataset with no id is not named by its identity.
    expect(html).not.toContain(">d2<")
    expect(html).not.toContain("掲載")
  })

  it("says the first version has nothing to be measured against", () => {
    expect(render(view({ comparedWith: null, heldNumbers: [] }))).toContain("最初のバージョンのため")
  })

  /** Advice, not a gate: the button is live whatever the review says. */
  it("says what the review stands at — the link, who pressed which mark — without stopping the publish", () => {
    const html = render(view({
      review: {
        shared: true,
        expired: false,
        unresolved: 0,
        acknowledgements: [{ kind: "approved", name: "山田太郎", bySignedIn: true, createdAt: "2026-09-20T01:00:00Z", count: 1 }],
        comments: [],
        signedInName: "curator",
        datasetLabels: {},
      },
    }))

    expect(html).toContain(">レビュー</h2>")
    expect(html).toContain("共有中")
    expect(html).toContain("「修正の必要はありません」を押した人")
    expect(html).toContain("山田太郎")
    expect(html).toContain("href=\"/admin/research/00000000-0000-0000-0000-000000000001/draft/00000000-0000-0000-0000-000000000002/review\"")
    expect(html).not.toMatch(/disabled=""/)
  })

  /** The review screen's table (#217): a row per person, when they last pressed and how often. */
  it("lists who pressed each mark as the review screen does — a table of name, last time and count", () => {
    const html = render(view({
      review: {
        shared: true,
        expired: false,
        unresolved: 0,
        acknowledgements: [{ kind: "approved", name: "山田太郎", bySignedIn: true, createdAt: "2026-09-20T01:00:00Z", count: 3 }],
        comments: [],
        signedInName: "curator",
        datasetLabels: {},
      },
    }))
    const review = html.slice(html.indexOf(">レビュー</h2>"), html.indexOf(">公開前に確かめるもの</h2>"))
    // One table per mark, both standing, the empty one saying nobody pressed.
    expect(review.match(/<table/g)).toHaveLength(2)
    expect(review.match(/>名前<\/th>/g)).toHaveLength(2)
    expect(review).toContain(">最後に押した日時</th>")
    expect(review).toContain("2026-09-20 10:00")
    expect(review).toContain("3 回")
    expect(review).toContain("印を押した人はいません。")
  })

  it("says a link past its date as expired, apart from a draft never shared", () => {
    const base = { unresolved: 0, acknowledgements: [], comments: [], signedInName: "curator", datasetLabels: {} }
    const review = (html: string) => html.slice(html.indexOf(">レビュー</h2>"), html.indexOf(">公開</h2>"))
    const expired = review(render(view({ review: { ...base, shared: false, expired: true } })))
    expect(expired).toContain("共有の期限切れ")
    expect(expired).not.toContain("未共有")
    const never = review(render(view({ review: { ...base, shared: false, expired: false } })))
    expect(never).toContain("未共有")
    expect(never).not.toContain("期限切れ")
  })

  it("opens the open questions in a panel from the review, counting them on its way in", () => {
    const comment = {
      id: "c1",
      anchor: { kind: "research-field" as const, path: "title" },
      authorName: "データ提供者 A",
      bySignedIn: false,
      body: "題目を直してください",
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: "2026-09-20T01:00:00Z",
    }
    const html = render(view({
      review: { shared: true, expired: false, unresolved: 1, acknowledgements: [], comments: [comment], signedInName: "curator", datasetLabels: {} },
    }))
    const review = html.slice(html.indexOf(">レビュー</h2>"), html.indexOf(">公開</h2>"))
    // The panel's way in: a button, with the count on it, not a link away.
    expect(review).toMatch(/<button type="button"[^>]*>[\s\S]*?未解決のコメント[\s\S]*?>1<[\s\S]*?<\/button>/)
  })

  it("will not update a version with nothing that would change, and says why; a new release date is a change", () => {
    const same = render(view({ updating: { number: 3 }, releaseDate: "2024-05-01", updatingReleaseDate: "2024-05-01" }))
    expect(same).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?v3 の更新<\/button>/)
    expect(same).toContain("公開中の v3 と変わるものが無いため、更新できません。")

    const changed = render(view({ updating: { number: 3 }, releaseDate: "2024-05-01", updatingReleaseDate: "2024-05-01", researchFields: 1 }))
    expect(changed).not.toMatch(/disabled=""/)
  })

  it("reads in the order it is wanted: changes, what stops it, review, what to confirm, the press", () => {
    const html = render(view({
      blocks: [{ kind: "hum-label-missing", datasetId: null }],
      findingCount: 1,
      groups: [{ kind: "unsettled", count: 1, fileNames: [], places: [{ label: "研究の記述", href: "/x", count: 1, note: null }] }],
    }))
    const order = ["変更点", "公開できない理由", "レビュー", "公開前に確かめるもの", "公開"].map((title) => html.indexOf(`>${title}</h2>`))
    expect(order.every((at) => at > -1)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it("names its sections with nouns, not questions", () => {
    const html = render(view({ findingCount: 1, groups: [{ kind: "unsettled", count: 1, fileNames: [], places: [] }] }))
    expect(html).not.toMatch(/<h2[^>]*>[^<]*か<\/h2>/)
  })

  /** A section there only when something is wrong leaves a clean draft unable to say it was checked. */
  it("keeps both checks on the screen when they find nothing, and says so", () => {
    const html = render(view())
    expect(html).toContain(">公開できない理由</h2>")
    expect(html).toContain("公開を止めるものはありません。")
    expect(html).toContain(">公開前に確かめるもの</h2>")
    expect(html).toContain("公開前に確かめるものはありません。")
    expect(html).not.toContain("type=\"checkbox\"")
  })

  it("says so when there is nothing to change at all", () => {
    expect(render(view())).toContain("記述の変更はありません")
  })

  it("says why a publish came back rather than leaving the screen unchanged", () => {
    expect(render(view(), { status: "conflict" })).toContain("この画面を開いた後に別の場所で変更されました。")
    expect(render(view(), { status: "unacknowledged" })).toContain("確認のチェック")
    expect(render(view(), { status: "taken" })).toContain("既に別のものに割り当てられています")
  })

  it("names the way out once, at the top — the way back to the research", () => {
    const html = render(view())
    expect(html).toContain("href=\"/admin/research/00000000-0000-0000-0000-000000000001\"")
    expect(html).toContain("研究の編集へ")
    // No second way out at the form's foot: publishing is the one thing to
    // press, and leaving is the head's own way back.
    expect(html).not.toContain("下書きへ戻る")
  })

  it("carries no strip of steps of its own — the head names the screen and nothing more", () => {
    expect(render(view())).not.toContain("aria-label=\"下書きの段\"")
  })

  it("offers to publish the private files from their own row, and only there", () => {
    const html = render(view({
      findingCount: 2,
      groups: [
        { kind: "unsettled", count: 1, fileNames: [], places: [{ label: "研究の記述", href: "/x", count: 1, note: null }] },
        { kind: "private-file", count: 1, fileNames: ["a.zip"], places: [{ label: "JGAD000001", href: "/y", count: 1, note: null }] },
      ],
    }))
    const row = (kind: string): string => {
      const at = html.indexOf(`>${kind}</td>`)
      return html.slice(html.lastIndexOf("<tr", at), html.indexOf("</tr>", at))
    }
    expect(row("データセットが選択している未公開のファイル")).toMatch(/form="publish-files"[\s\S]*?まとめて公開 \(1\)/)
    expect(row("未確定の値")).not.toContain("まとめて公開")
  })
})
