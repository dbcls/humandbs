import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { DatasetListRowView } from "~/public/view.server"

import { cartColumns, CartRowCells } from "./cart"

const ROW: DatasetListRowView = {
  id: null,
  label: "JGAD000001",
  humLabel: "hum0001",
  accessType: { code: "controlled-access-type-1", label: "制限公開 (Type I)", maker: null },
  typeOfData: { state: "plain", text: "NGS (Exome)", untranslated: false },
  experimentLabels: ["WES", "RNA-seq"],
  datePublished: "2024-05-01",
  dateModified: "2025-01-01",
}

function cells(row: DatasetListRowView): string[] {
  const Stub = createRoutesStub([{ path: "*", Component: () => <table><tbody><tr><CartRowCells row={row} locale="ja" /></tr></tbody></table> }])
  const html = renderToStaticMarkup(<Stub initialEntries={["/cart"]} />)
  return [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1] ?? "")
}

describe("the cart's table", () => {
  it("has the dataset listing's columns in its order, less the cart and the dates", () => {
    expect(cartColumns("ja")).toEqual(["データセット ID", "研究 ID", "データの種類", "解析手法", "アクセス制限"])
  })

  it("draws one cell for each column after the id, each holding its value", () => {
    const drawn = cells(ROW)
    expect(drawn).toHaveLength(cartColumns("ja").length - 1)
    expect(drawn[0]).toContain("href=\"/research/hum0001\"")
    expect(drawn[1]).toContain("NGS (Exome)")
    expect(drawn[2]).toContain("WES")
    expect(drawn[2]).toContain("RNA-seq")
    expect(drawn[3]).toContain("制限公開 (Type I)")
  })

  it("leaves the cells empty where the dataset has no type of data, experiment or access type", () => {
    const drawn = cells({ ...ROW, typeOfData: null, experimentLabels: [], accessType: null })
    expect(drawn.slice(1).map((cell) => cell.replace(/<[^>]+>/g, ""))).toEqual(["", "", ""])
  })
})
