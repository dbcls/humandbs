import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { researchContentInput, type DraftInput } from "~/admin/form"
import type { AdminDraftPageView } from "~/admin/pages.server"
import { emptyResearchContent } from "~/content/empty"

import { DraftEditor } from "./editor"

function view(produce: (input: DraftInput) => void = () => undefined): AdminDraftPageView {
  const input: DraftInput = { note: "", content: researchContentInput(emptyResearchContent()) }
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
    undo: [],
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
    expect(html).toContain("未確定にする")
    expect(html).toContain("該当なしにする")
  })

  it("keeps the half-typed text of a slot marked unsettled, and stops it being edited", () => {
    const html = render(view((input) => {
      input.content.title.ja = { state: "unknown", text: "half written" }
    }))

    expect(html).toContain("half written")
    expect(html).toContain("disabled")
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

  it("offers no dataset to list when the research has none", () => {
    expect(render(view())).toContain("この研究にはまだデータセットがありません。")
  })

  it("shows the memo, which is saved with the content and never reaches the preview", () => {
    const html = render(view((input) => {
      input.note = "2026 年公開分の下書き"
    }))

    expect(html).toContain("2026 年公開分の下書き")
    expect(html).toContain("preview には出ません")
  })
})
