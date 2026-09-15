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
    choices: [],
    suggestedNumber: null,
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
  it("offers a new version, and nothing to replace while no version exists", () => {
    const html = render(view())

    expect(html).toContain("v2 になります")
    expect(html).not.toContain("を更新する")
    expect(html).toContain("type=\"date\"")
  })

  it("offers to update a version that holds one of the numbers", () => {
    const html = render(view({
      choices: [{ number: 1, releaseDate: "2025-04-01" }],
      suggestedNumber: 1,
    }))

    expect(html).toContain("v1 を更新する")
    expect(html).toContain("2025-04-01")
  })

  /**
   * A number a withdrawal left free has no version behind it, so nothing is
   * being replaced — and the day it offers is today rather than one it lost.
   */
  it("offers a free number as a plain publish", () => {
    const html = render(view({ choices: [{ number: 3, releaseDate: null }] }))

    expect(html).toContain("v3 として公開する")
    expect(html).not.toContain("v3 を更新する")
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
})
