import fc from "fast-check"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { DatasetRowView } from "~/public/view.server"

import type { FieldAnnotations } from "./fields"
import { CitableTable, IdList } from "./research-fields"

function render(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin"]} />)
}

function row(id: string): DatasetRowView {
  return { id, label: `JGAD00000${id}`, typeOfData: null, accessType: null, datePublished: "2025-08-08" }
}

const ROWS = ["1", "2", "3"].map(row)

function table(selected: string[]): string {
  return render(<CitableTable locale="ja" datasets={ROWS} selected={selected} onChange={() => { /* nothing changes here */ }} />)
}

/** The checkbox in the table header, as drawn. */
function head(html: string): string {
  return /<thead[\s\S]*?(<input[^>]*>)/.exec(html)?.[1] ?? ""
}

describe("the table a publication's datasets are chosen from", () => {
  it("draws the public table's columns, with the date published", () => {
    const html = table([])
    for (const column of ["データセット ID", "データの種類", "アクセス制限", "公開日"]) expect(html).toContain(column)
    expect(html).toContain("2025-08-08")
  })

  it("names the checkbox in the table header for what it does", () => {
    expect(head(table([]))).toContain("aria-label=\"すべて選択\"")
  })

  it("ticks the checkbox in the table header exactly when every row is chosen, whatever else is chosen besides", () => {
    fc.assert(fc.property(
      fc.subarray(["1", "2", "3"]),
      fc.array(fc.constantFrom("elsewhere-1", "elsewhere-2"), { maxLength: 2 }),
      (chosen, others) => {
        const checked = /\bchecked=""/.test(head(table([...others, ...chosen])))
        expect(checked).toBe(chosen.length === 3)
      },
    ))
  })

  it("ticks each row that is chosen and no other", () => {
    const html = table(["2"])
    const rows = [...html.matchAll(/<tbody[\s\S]*?<\/tbody>/g)][0]?.[0] ?? ""
    const boxes = [...rows.matchAll(/<input[^>]*>/g)].map((match) => /\bchecked=""/.test(match[0]))
    expect(boxes).toEqual([false, true, false])
  })

  it("shows it in words when the research has no dataset to choose", () => {
    const html = render(<CitableTable locale="ja" datasets={[]} selected={[]} onChange={() => { /* nothing changes here */ }} />)
    expect(html).not.toContain("<table")
  })
})

describe("a list of IDs typed one to a box", () => {
  const annotations: FieldAnnotations = { at: "relatedPublications.p1.datasetIds", changed: false, onImport: null }
  const list = (value: string[]) => render(
    <IdList
      label="外部データセット ID"
      itemLabel="外部データセット ID"
      addLabel="ID の追加"
      placeholder="JGAD000000"
      locale="ja"
      value={value}
      annotations={annotations}
      onChange={() => { /* nothing changes here */ }}
    />,
  )

  it("shows the shape of an ID in every field, and one field per ID", () => {
    const boxes = [...list(["", "JGAD000001"]).matchAll(/<input[^>]*>/g)].map((match) => match[0])
    expect(boxes).toHaveLength(2)
    for (const box of boxes) expect(box).toContain("placeholder=\"JGAD000000\"")
  })

  it("names itself as a list of dataset IDs, not as some other kind of ID", () => {
    expect(list([])).toContain("外部データセット ID")
  })
})
