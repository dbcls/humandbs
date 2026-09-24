import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { messagesFor } from "~/i18n/messages"

import { AccessionSection } from "./accession"

const t = messagesFor("ja").admin.templates

function draw(): string {
  const Stub = createRoutesStub([{
    path: "/*",
    Component: () => <AccessionSection locale="ja" researchId="r-1" draftId="d-1" revision={3} />,
  }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin/research/r-1/draft/d-1/dataset"]} />)
}

describe("外部アクセッションからの作成", () => {
  it("データセットの画面の節として開いたまま立ち、面も別の画面へのリンクも持たない", () => {
    const html = draw()
    expect(html).toMatch(new RegExp(`<h2[^>]*>${t.openDataset}</h2>`))
    expect(html).not.toContain("<dialog")
    expect(html).not.toContain("href=\"/admin/research/r-1/draft/d-1/dataset/upstream\"")
  })

  it("番号の窓と「検索」が最初から立ち、調べるのはその場で (GET) 行う", () => {
    const html = draw()
    expect(html).toContain(t.accessionHint)
    expect(html).toContain(t.look)
    expect(html).toMatch(/<form[^>]*method="get"[^>]*action="\/admin\/research\/r-1\/draft\/d-1\/dataset\/upstream"|<form[^>]*action="\/admin\/research\/r-1\/draft\/d-1\/dataset\/upstream"[^>]*method="get"/)
  })

  it("調べる前は、作成の押せるものを描かない", () => {
    expect(draw()).not.toContain(t.add)
  })
})
