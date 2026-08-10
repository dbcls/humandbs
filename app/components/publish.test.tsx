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
    fixNumber: null,
    staleAgainst: null,
    today: "2026-08-10",
    blocks: [],
    groups: [],
    findingCount: 0,
    researchFields: 0,
    datasetChanges: [],
    listingAdded: [],
    listingRemoved: [],
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
  it("offers a new version, and no fix while there is no version to replace", () => {
    const html = render(view())

    expect(html).toContain("v2 になります")
    expect(html).not.toContain("いまの版を差し替える")
    expect(html).toContain("type=\"date\"")
  })

  it("offers the fix once the draft came from a version", () => {
    const html = render(view({ fixNumber: 5 }))

    expect(html).toContain("いまの版を差し替える")
    expect(html).toContain("v5 のまま")
  })

  it("will not let the publish be pressed while something structural is missing", () => {
    const html = render(view({
      humLabel: null,
      blocks: [{ kind: "hum-label-missing", datasetId: null, label: null, suggestion: null }],
    }))

    expect(html).toContain("公開できないもの")
    expect(html).toContain("hum ラベルが pin されていません")
    expect(html).toContain("disabled=\"\"")
  })

  it("puts the id it proposes into the field rather than only describing it", () => {
    const html = render(view({
      blocks: [{
        kind: "dataset-id-missing",
        datasetId: "00000000-0000-0000-0000-0000000000d1",
        label: null,
        suggestion: "hum0001-NHA001",
      }],
    }))

    expect(html).toContain("value=\"hum0001-NHA001\"")
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
          kind: "upstream-edited",
          count: 1,
          fileNames: [],
          places: [{
            label: "JGAD000001",
            href: "/admin/research/x/draft/y/dataset/z",
            count: 1,
            note: "相手の変更 2 項目が戻り、1 項目は手元の値が勝ちます",
          }],
        },
      ],
    }))

    expect(html).toContain("未確定の値 12")
    expect(html).toContain("相手の変更 2 項目が戻り")
    expect(html).toContain("上の 13 件を確認しました")
    expect(html).toContain("type=\"checkbox\"")
    // Nothing structural is missing, so the button is live.
    expect(html).not.toContain("disabled=\"\"")
  })

  it("says how many published versions a dataset's description reaches", () => {
    const html = render(view({
      datasetChanges: [{
        datasetId: "d1",
        label: "JGAD000001",
        fields: 3,
        affects: 5,
        affectsIfFix: 4,
        isNew: false,
        href: "/admin/research/x/draft/y/dataset/d1",
      }],
    }))

    expect(html).toContain("5 件の公開版に効きます")
  })

  it("says so when there is nothing to change at all", () => {
    expect(render(view())).toContain("記述の変更はありません")
  })

  it("warns when the version this draft came from has moved on", () => {
    expect(render(view({ staleAgainst: 7 }))).toContain("v7")
  })

  it("says why a publish came back rather than leaving the screen unchanged", () => {
    expect(render(view(), { status: "conflict" })).toContain("別の場所で編集されました")
    expect(render(view(), { status: "unacknowledged" })).toContain("確認のチェック")
    expect(render(view(), { status: "taken" })).toContain("別の対象に pin されています")
  })
})
