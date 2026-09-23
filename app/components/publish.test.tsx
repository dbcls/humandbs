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
    heldNumbers: [1],
    releaseDate: "2026-08-10",
    updating: null,
    blocks: [],
    groups: [],
    findingCount: 0,
    steps: { datasets: 0, shared: false, unresolved: 0, blocks: 0, findings: 0 },
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
  it("offers the next number in a box, names the held ones, and dates it today", () => {
    const html = render(view({ nextNumber: 4, heldNumbers: [3, 1] }))

    expect(html).toContain("type=\"number\"")
    expect(html).toContain("value=\"4\"")
    expect(html).toContain("公開中の番号は選べません: v3, v1")
    expect(html).toContain("type=\"date\"")
    expect(html).toContain("value=\"2026-08-10\"")
  })

  it("says it is the first version while none is held", () => {
    const html = render(view({ nextNumber: 1, heldNumbers: [] }))

    expect(html).toContain("最初のバージョンです")
    expect(html).not.toContain("選べません")
  })

  it("asks for no number for an update, names the version, and dates it the day it went out", () => {
    const html = render(view({ updating: { number: 3 }, releaseDate: "2024-05-01", heldNumbers: [3, 1] }))

    expect(html).toContain("更新前の確認")
    expect(html).toContain("v3 を更新します")
    expect(html).toContain("v3 の更新")
    expect(html).not.toContain("type=\"number\"")
    expect(html).not.toContain("選べません")
    expect(html).toContain("value=\"2024-05-01\"")
  })

  it("answers a number a version took in the meantime", () => {
    const html = render(view(), { status: "number-unavailable" })

    expect(html).toContain("その番号は公開中のバージョンが持っています")
  })

  it("will not let the publish be pressed while something structural is missing", () => {
    const html = render(view({
      humLabel: null,
      blocks: [{ kind: "hum-label-missing", datasetId: null, label: null, suggestion: null }],
    }))

    expect(html).toContain("公開できないもの")
    expect(html).toContain("研究 ID が割り当てられていません")
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

    expect(html).toContain("未確定の値 12")
    expect(html).toContain("JGAD000001")
    expect(html).toContain("上の 13 件を確認しました")
    expect(html).toContain("type=\"checkbox\"")
    // Nothing structural is missing, so the button is live.
    expect(html).not.toContain("disabled=\"\"")
  })

  /**
   * A description belongs to the version being written, so the screen names the
   * dataset and stops there — there is no count of other versions to give.
   */
  it("names a dataset whose description this publish changes", () => {
    const html = render(view({
      datasetChanges: [{
        datasetId: "d1",
        label: "JGAD000001",
        fields: 3,
        isNew: false,
        href: "/admin/research/x/draft/y/dataset/d1",
      }],
    }))

    expect(html).toContain("JGAD000001")
    expect(html).not.toContain("公開バージョンに効きます")
  })

  it("says so when there is nothing to change at all", () => {
    expect(render(view())).toContain("記述の変更はありません")
  })

  it("says why a publish came back rather than leaving the screen unchanged", () => {
    expect(render(view(), { status: "conflict" })).toContain("別の場所で編集されました")
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
})
