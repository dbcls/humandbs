import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { PublishPageView, PublishResult } from "~/admin/pages.server"
import { orderCompare, type ChangeView } from "~/admin/publish-changes"

import { ChangedFields, PublishConfirmation } from "./publish"
import type { PlaceSources } from "./places"

const NO_PLACES: PlaceSources = { humLabel: null, rows: {}, datasets: [], experiments: {}, keyLabels: {} }

/** Changes to as many fields, each named, with nothing to set side by side. */
function changes(count: number): ChangeView[] {
  return Array.from({ length: count }, (_, at) => ({ path: `f${at}`, name: `hum0001 / 項目 ${at + 1}`, compare: null }))
}

const REORDERED = orderCompare(["a", "b"], ["b", "a"], (id) => id, { position: "順番", datasetId: "データセット ID" })

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
    draftName: "v2 予定",
    revision: 3,
    nextNumber: 2,
    nextNhaId: null,
    heldNumbers: [1],
    releaseDate: "2026-08-10",
    updating: null,
    blocks: [],
    groups: [],
    findingCount: 0,
    researchChanges: [],
    datasetChanges: [],
    order: null,
    comparedWith: 1,
    updatingReleaseDate: null,
    datasetRows: {},
    review: { shared: false, expired: false, unresolved: 0, acknowledgements: [], comments: [], signedInName: "curator", places: NO_PLACES },
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

  it("shows under the line that the release date is not a schedule", () => {
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

  it("requests no number for an update, shows what the update does, and dates it the day it went out", () => {
    const html = render(view({
      updating: { number: 3 },
      releaseDate: "2024-05-01",
      updatingReleaseDate: "2024-05-01",
      heldNumbers: [3, 1],
      researchChanges: changes(2),
    }))

    expect(html).toContain("更新前の確認")
    expect(html).toContain("公開中の v3 の内容がこの下書きの内容に置き換わる")
    expect(html).toContain("v3 の更新")
    expect(html).not.toContain("type=\"number\"")
    expect(html).not.toContain("バージョン番号は")
    expect(html).toContain("value=\"2024-05-01\"")
  })

  it("reports a number a version took in the meantime", () => {
    const html = render(view(), { status: "number-unavailable" })

    expect(html).toContain("その番号は公開中のバージョンで使われています")
  })

  it("will not let the publish be pressed while something structural is missing", () => {
    const html = render(view({
      humLabel: null,
      blocks: [{ kind: "hum-label-missing", datasetId: null }],
    }))

    expect(html).toContain(">公開できない理由</h2>")
    // Said the way the research's own screen shows it — a quiet sentence, not a line in red.
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
        [d1]: { id: d1, label: "", typeOfData: { state: "plain", text: "WES", untranslated: false }, accessType: null, datePublished: null, dateModified: null, experimentLabels: [] },
        [d2]: { id: d2, label: "", typeOfData: { state: "plain", text: "RNA-seq", untranslated: false }, accessType: null, datePublished: null, dateModified: null, experimentLabels: [] },
      },
    }))

    expect(html).toContain(`name="datasetId" value="${d1}"`)
    expect(html).toContain(`name="datasetId" value="${d2}"`)
    expect(html).not.toContain(`>${d1}<`)
    expect(html.match(/ID 未発行/g)?.length).toBe(2)
    // The table alone: the section's sentence shows why they are listed.
    expect(html).not.toContain("text-danger")
    expect(html).toContain(">割り当てる ID<")
    expect(html).not.toContain(">研究 ID<")
    // What kind of data each holds is what tells the two apart.
    expect(html).toContain("WES")
    expect(html).toContain("RNA-seq")
  })

  it("groups what is listed by kind and requests one tick over the lot", () => {
    const html = render(view({
      findingCount: 13,
      groups: [
        {
          kind: "unsettled",
          count: 12,
          fileNames: [], spots: [],
          places: [{ label: "研究の内容", href: "/admin/research/x/draft/y", count: 12, note: null }],
        },
        {
          kind: "empty-dataset",
          count: 1,
          fileNames: [], spots: [],
          places: [{
            label: "JGAD000001",
            href: "/admin/research/x/draft/y/dataset/z",
            count: 1,
            note: null,
          }],
        },
      ],
    }))

    // One row to a kind, read at a glance: no collapse to open first.
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
  it("names a dataset whose description this publish changes, and shows what it is measured against", () => {
    const html = render(view({
      comparedWith: 4,
      datasetChanges: [
        { datasetId: "d1", label: "JGAD000001", changes: changes(3), isNew: false, href: "/x" },
        { datasetId: "d2", label: null, changes: [], isNew: true, href: "/y" },
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

  it("counts the research's changes on the badge the editing screens mark a change with, as a button that opens them", () => {
    const html = render(view({ researchChanges: changes(6) }))
    const line = html.slice(html.indexOf(">研究の内容<"), html.indexOf("研究の編集"))
    expect(line).toMatch(/<button type="button"[^>]*border-dashed[^>]*>[\s\S]*?6 項目の変更<\/button>/)
    expect(html).not.toContain("研究の内容: ")
    // The research's own screen is still where a change is written.
    expect(html).toContain(`href="/admin/research/00000000-0000-0000-0000-000000000001/draft/00000000-0000-0000-0000-000000000002"`)
  })

  it("shows a new order of the datasets as the same badge, and a dataset's changes too", () => {
    const html = render(view({
      order: REORDERED,
      datasetChanges: [{ datasetId: "d1", label: "JGAD000001", changes: changes(3), isNew: false, href: "/x" }],
    }))
    expect(html).toMatch(/<button type="button"[^>]*border-dashed[^>]*>[\s\S]*?データセットの並び順の変更<\/button>/)
    expect(html).toMatch(/<button type="button"[^>]*border-dashed[^>]*>[\s\S]*?3 項目の変更<\/button>/)
  })

  it("draws the changed datasets and the ones without an id with the draft's dataset listing's columns", () => {
    const html = render(view({
      blocks: [{ kind: "dataset-id-missing", datasetId: "d2" }],
      datasetChanges: [{ datasetId: "d1", label: "JGAD000001", changes: changes(1), isNew: false, href: "/x" }],
    }))
    const headers = [...html.matchAll(/<thead>([\s\S]*?)<\/thead>/g)].map((head) =>
      [...(head[1] ?? "").matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((cell) => (cell[1] ?? "").replace(/<[^>]+>/g, "")))
    expect(headers).toContainEqual(["データセット ID", "変更点", "データの種類", "解析手法", "アクセス制限", "公開日", "更新日"])
    expect(headers).toContainEqual(["データセット ID", "データの種類", "解析手法", "アクセス制限", "公開日", "更新日", "割り当てる ID"])
  })

  it("opens the places of an unsettled value or a missing translation from one button, and leaves the other kinds' screens as they are", () => {
    const html = render(view({
      findingCount: 2,
      groups: [
        {
          kind: "unsettled",
          count: 1,
          fileNames: [],
          places: [{ label: "研究の内容", href: "/admin/research/x/draft/y", count: 1, note: null }],
          spots: [{ name: "hum0001 / 研究題目", language: "en", href: "/admin/research/x/draft/y" }],
        },
        {
          kind: "empty-dataset",
          count: 1,
          fileNames: [],
          places: [{ label: "JGAD000001", href: "/admin/research/x/draft/y/dataset/z", count: 1, note: null }],
          spots: [],
        },
      ],
    }))
    const row = (kind: string): string => {
      const at = html.indexOf(`>${kind}</td>`)
      return html.slice(html.lastIndexOf("<tr", at), html.indexOf("</tr>", at))
    }
    expect(row("未確定の値")).toMatch(/<button[^>]*>[\s\S]*?場所の一覧<\/button>/)
    expect(row("未確定の値")).not.toContain(">研究の内容<")
    expect(row("内容が空のデータセット")).toContain(">JGAD000001</a>")
    expect(row("内容が空のデータセット")).not.toContain("場所の一覧")
  })

  it("shows the first version has nothing to be measured against", () => {
    expect(render(view({ comparedWith: null, heldNumbers: [] }))).toContain("最初のバージョンのため")
  })

  /** Advice, not a publish check: the button is live whatever the review shows. */
  it("shows how far the review has got — the link, who pressed which indicator — without stopping the publish", () => {
    const html = render(view({
      review: {
        shared: true,
        expired: false,
        unresolved: 0,
        acknowledgements: [{ kind: "approved", name: "山田太郎", bySignedIn: true, createdAt: "2026-09-20T01:00:00Z", count: 1 }],
        comments: [],
        signedInName: "curator",
        places: NO_PLACES,
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
  it("lists who pressed each review button as the review screen does — a table of name, last time and count", () => {
    const html = render(view({
      review: {
        shared: true,
        expired: false,
        unresolved: 0,
        acknowledgements: [{ kind: "approved", name: "山田太郎", bySignedIn: true, createdAt: "2026-09-20T01:00:00Z", count: 3 }],
        comments: [],
        signedInName: "curator",
        places: NO_PLACES,
      },
    }))
    const review = html.slice(html.indexOf(">レビュー</h2>"), html.indexOf(">公開前に確かめるもの</h2>"))
    // One table per indicator, both drawn, the empty one showing that nobody pressed.
    expect(review.match(/<table/g)).toHaveLength(2)
    expect(review.match(/>名前<\/th>/g)).toHaveLength(2)
    expect(review).toContain(">最後に押した日時</th>")
    expect(review).toContain("2026-09-20 10:00")
    expect(review).toContain("3 回")
    expect(review).toContain("押した人はいません。")
  })

  it("shows a link past its date as expired, apart from a draft never shared", () => {
    const base = { unresolved: 0, acknowledgements: [], comments: [], signedInName: "curator", places: NO_PLACES }
    const review = (html: string) => html.slice(html.indexOf(">レビュー</h2>"), html.indexOf(">公開</h2>"))
    const expired = review(render(view({ review: { ...base, shared: false, expired: true } })))
    expect(expired).toContain("共有の期限切れ")
    expect(expired).not.toContain("未共有")
    const never = review(render(view({ review: { ...base, shared: false, expired: false } })))
    expect(never).toContain("未共有")
    expect(never).not.toContain("期限切れ")
  })

  it("opens the open questions in a panel from the review, counting them on its trigger", () => {
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
      review: { shared: true, expired: false, unresolved: 1, acknowledgements: [], comments: [comment], signedInName: "curator", places: NO_PLACES },
    }))
    const review = html.slice(html.indexOf(">レビュー</h2>"), html.indexOf(">公開</h2>"))
    // The panel's trigger: a button, with the count on it, not a link away.
    expect(review).toMatch(/<button type="button"[^>]*>[\s\S]*?未解決のコメント[\s\S]*?>1<[\s\S]*?<\/button>/)
  })

  it("will not update a version with nothing that would change, and shows why; a new release date is a change", () => {
    const same = render(view({ updating: { number: 3 }, releaseDate: "2024-05-01", updatingReleaseDate: "2024-05-01" }))
    expect(same).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?v3 の更新<\/button>/)
    expect(same).toContain("公開中の v3 と変わるものが無いため、更新できません。")

    const changed = render(view({ updating: { number: 3 }, releaseDate: "2024-05-01", updatingReleaseDate: "2024-05-01", researchChanges: changes(1) }))
    expect(changed).not.toMatch(/disabled=""/)
  })

  /** The public page lists the datasets in the version's order, so moving them is a change. */
  it("updates a version whose only change is the order of its datasets, and shows it", () => {
    const html = render(view({ updating: { number: 3 }, releaseDate: "2024-05-01", updatingReleaseDate: "2024-05-01", order: REORDERED }))

    expect(html).not.toMatch(/disabled=""/)
    expect(html).toContain("データセットの並び順の変更")
    expect(html).not.toContain("研究の内容の変更はありません。")
  })

  it("reads in the order it is wanted: changes, what stops it, review, what to confirm, the press", () => {
    const html = render(view({
      blocks: [{ kind: "hum-label-missing", datasetId: null }],
      findingCount: 1,
      groups: [{ kind: "unsettled", count: 1, fileNames: [], spots: [], places: [{ label: "研究の内容", href: "/x", count: 1, note: null }] }],
    }))
    const order = ["変更点", "公開できない理由", "レビュー", "公開前に確かめるもの", "公開"].map((title) => html.indexOf(`>${title}</h2>`))
    expect(order.every((at) => at > -1)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it("names its sections with nouns, not questions", () => {
    const html = render(view({ findingCount: 1, groups: [{ kind: "unsettled", count: 1, fileNames: [], spots: [], places: [] }] }))
    expect(html).not.toMatch(/<h2[^>]*>[^<]*か<\/h2>/)
  })

  /** A section there only when something is wrong leaves a clean draft unable to show it was checked. */
  it("keeps both checks on the screen when they find nothing, and shows it", () => {
    const html = render(view())
    expect(html).toContain(">公開できない理由</h2>")
    expect(html).toContain("公開できない理由はありません。")
    expect(html).toContain(">公開前に確かめるもの</h2>")
    expect(html).toContain("公開前に確かめるものはありません。")
    expect(html).not.toContain("type=\"checkbox\"")
  })

  it("shows it when there is nothing to change at all", () => {
    expect(render(view())).toContain("研究の内容の変更はありません")
  })

  it("shows why a publish came back rather than leaving the screen unchanged", () => {
    expect(render(view(), { status: "conflict" })).toContain("この画面を開いた後に別の場所で変更されました。")
    expect(render(view(), { status: "unacknowledged" })).toContain("確認のチェック")
    expect(render(view(), { status: "taken" })).toContain("既に別のものに割り当てられています")
  })

  it("shows the back link once, at the top — the link back to the research", () => {
    const html = render(view())
    expect(html).toContain("href=\"/admin/research/00000000-0000-0000-0000-000000000001\"")
    expect(html).toContain(">研究へ<")
    // No second back link at the form's foot: publishing is the one thing to
    // press, and leaving is the header's own back link.
    expect(html).not.toContain("下書きへ戻る")
  })

  it("offers to publish the private files from their own row, and only there", () => {
    const html = render(view({
      findingCount: 2,
      groups: [
        { kind: "unsettled", count: 1, fileNames: [], spots: [], places: [{ label: "研究の内容", href: "/x", count: 1, note: null }] },
        { kind: "private-file", count: 1, fileNames: ["a.zip"], spots: [], places: [{ label: "JGAD000001", href: "/y", count: 1, note: null }] },
      ],
    }))
    const row = (kind: string): string => {
      const at = html.indexOf(`>${kind}</td>`)
      return html.slice(html.lastIndexOf("<tr", at), html.indexOf("</tr>", at))
    }
    expect(row("データセットに紐づけた未公開のファイル")).toMatch(/form="publish-files"[\s\S]*?まとめて公開 \(1\)/)
    expect(row("未確定の値")).not.toContain("まとめて公開")
  })
})

describe("the fields a subject changes", () => {
  it("names each place as a heading and sets its two sides under it, or names it alone", () => {
    const html = renderToStaticMarkup(
      <ChangedFields
        locale="ja"
        against="公開中の v1"
        changes={[
          {
            path: "title",
            name: "hum0001 / 研究題目",
            compare: { kind: "lines", rows: [{ label: "ja", before: { state: "value", text: "古い" }, after: { state: "value", text: "新しい" } }] },
          },
          { path: "values.k", name: "JGAD000001 / 数値", compare: null },
        ]}
      />,
    )
    expect(html).toMatch(/<h3[^>]*>hum0001 \/ 研究題目<\/h3>/)
    expect(html).toContain("公開中の v1")
    expect(html).toContain("この下書き")
    expect(html).toMatch(/<h3[^>]*>JGAD000001 \/ 数値<\/h3><\/div><\/section>/)
  })

  it("marks a dataset that moved with the version's position struck and the draft's added", () => {
    const html = renderToStaticMarkup(<ChangedFields locale="ja" against="公開中の v1" changes={[{ path: "order", name: "順", compare: REORDERED }]} />)
    expect(html).toContain(">順番<")
    const moved = html.slice(html.indexOf("<tbody"))
    expect(moved).toMatch(/<del[^>]*>2<\/del>[\s\S]*<ins[^>]*>1<\/ins>/)
  })
})
