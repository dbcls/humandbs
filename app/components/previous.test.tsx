import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CompareTable, lineRows, RowsCompare } from "./previous"

const draw = (element: React.ReactNode) => renderToStaticMarkup(element)

describe("CompareTable", () => {
  it("marks what the published side loses and what the draft adds, each on its own side and in its own colour", () => {
    const html = draw(
      <CompareTable
        locale="ja"
        against="公開中の v4"
        rows={[{ label: "en", before: { state: "value", text: "The old words" }, after: { state: "value", text: "The new words" } }]}
      />,
    )
    const left = html.slice(html.indexOf("The "), html.lastIndexOf("The "))
    const right = html.slice(html.lastIndexOf("The "))
    expect(left).toMatch(/<del[^>]*>old<\/del>/)
    expect(left).not.toContain("<ins")
    expect(right).toMatch(/<ins[^>]*>new<\/ins>/)
    expect(right).not.toContain("<del")
    expect(left).toContain("bg-diff-del-word")
    expect(right).toContain("bg-diff-ins-word")
  })

  it("tints a changed side as a line, leaves a line both sides share untinted, and puts no sign at the head of a line", () => {
    const html = draw(
      <CompareTable
        locale="ja"
        against="公開中の v4"
        rows={[
          { label: "ja", before: { state: "value", text: "同じ" }, after: { state: "value", text: "同じ" } },
          { label: "en", before: { state: "value", text: "old" }, after: { state: "value", text: "new" } },
        ]}
      />,
    )
    const shared = html.slice(html.indexOf(">ja<"), html.indexOf(">en<"))
    expect(shared).not.toMatch(/bg-diff-/)
    const moved = html.slice(html.indexOf(">en<"))
    expect(moved).toMatch(/bg-diff-del">/)
    expect(moved).toMatch(/bg-diff-ins">/)
    expect(html).not.toMatch(/>[−+]</)
  })

  it("strikes or underlines a sentence only one side has, so the change is said without the colour", () => {
    const html = draw(
      <CompareTable locale="ja" against="公開中の v4" rows={[{ label: "", before: { state: "value", text: "一。" }, after: { state: "value", text: "一。二。" } }]} />,
    )
    expect(html).toMatch(/<ins class="underline[^"]*">二。<\/ins>/)
  })

  it("names both columns, the published one as the screen words it", () => {
    const html = draw(<CompareTable locale="ja" against="公開中の v4" rows={[]} />)
    expect(html.indexOf("公開中の v4")).toBeLessThan(html.indexOf("この下書き"))
  })

  it("shows a state in words and marks the other side whole, since the two cannot be compared piece by piece", () => {
    const html = draw(
      <CompareTable
        locale="ja"
        against="公開中の v4"
        rows={[{ label: "ja", before: { state: "value", text: "血液" }, after: { state: "not-applicable" } }]}
      />,
    )
    expect(html).toMatch(/<del[^>]*>血液<\/del>/)
    expect(html).toContain("該当なし")
  })

  it("leaves a side empty where only the other side has the line", () => {
    const html = draw(
      <CompareTable locale="ja" against="公開中の v4" rows={[{ label: "", before: null, after: { state: "value", text: "新しい行" } }]} />,
    )
    expect(html).toMatch(/<ins[^>]*>新しい行<\/ins>/)
    expect(html).not.toContain("<del")
  })

  it("drops the language column when no line has a language", () => {
    const html = draw(
      <CompareTable locale="ja" against="公開中の v4" rows={[{ label: "", before: { state: "value", text: "a" }, after: { state: "value", text: "b" } }]} />,
    )
    expect(html).toContain("grid-cols-2")
  })
})

describe("lineRows", () => {
  it("pairs the lines by position and keeps a line only one side has", () => {
    const rows = lineRows(
      [{ label: "ja", state: "value", text: "旧" }],
      [{ label: "ja", state: "value", text: "新" }, { label: "en", state: "unknown", text: "typed" }],
    )
    expect(rows).toEqual([
      { label: "ja", before: { state: "value", text: "旧" }, after: { state: "value", text: "新" } },
      { label: "en", before: null, after: { state: "unknown" } },
    ])
  })

  it("reads a value made of terms as their labels", () => {
    const rows = lineRows(
      [{ label: "", state: "value", text: "肺がん", termIds: ["t1"] }],
      [],
      (id) => (id === "t1" ? "C34" : id),
    )
    expect(rows[0]?.before).toEqual({ state: "value", text: "肺がん (C34)" })
  })
})

describe("the lines of a comparison", () => {
  const value = (text: string) => ({ state: "value" as const, text })

  it("gives a sentence to a line, and tints only the one that moved", () => {
    const html = draw(
      <CompareTable
        locale="ja"
        against="公開中の v4"
        rows={[{ label: "ja", before: value("血液を解析する。組織を調べる。"), after: value("血液を解析する。臓器を調べる。") }]}
      />,
    )
    const kept = [...html.matchAll(/<div data-side="[a-z]+" class="([^"]*)">血液を解析する。/g)]
    expect(kept).toHaveLength(2)
    for (const cell of kept) expect(cell[1]).not.toMatch(/bg-diff-/)
    expect(html).toMatch(/<del[^>]*line-through[^>]*>組織<\/del>/)
    expect(html).toMatch(/<ins[^>]*underline[^>]*>臓器<\/ins>/)
  })

  it("draws every sentence, the unchanged ones untinted around the one that moved", () => {
    const same = ["一。", "二。", "三。", "四。", "五。"]
    const html = draw(<CompareTable locale="ja" against="公開中の v4" rows={[{ label: "", before: value([...same, "旧。"].join("")), after: value([...same, "新。"].join("")) }]} />)
    for (const one of same) expect(html.split(one)).toHaveLength(3)
    expect(html).not.toContain("変更の無い")
  })

  it("rules the language column off from the two sides, on every line", () => {
    const html = draw(
      <CompareTable
        locale="ja"
        against="公開中の v4"
        rows={[{ label: "ja", before: value("一。二。"), after: value("一。三。") }]}
      />,
    )
    const labels = [...html.matchAll(/<span class="([^"]*)">(?:ja)?<\/span>/g)].map((match) => match[1] ?? "")
    expect(labels.length).toBeGreaterThanOrEqual(3)
    for (const look of labels) expect(look).toContain("border-r")
  })
})

describe("selecting one side of a comparison", () => {
  it("marks each cell with its side, and takes the names and the language column out of any selection", () => {
    const html = draw(
      <CompareTable
        locale="ja"
        against="公開中の v4"
        rows={[{ label: "ja", before: { state: "value", text: "一。" }, after: { state: "value", text: "二。" } }]}
      />,
    )
    expect(html.match(/data-side="del"/g)).toHaveLength(1)
    expect(html.match(/data-side="ins"/g)).toHaveLength(1)
    // The grid names what a press in either column takes out of the selection.
    expect(html).toContain("data-[pick=del]:[&amp;_[data-side=ins]]:select-none")
    expect(html).toContain("data-[pick=ins]:[&amp;_[data-side=del]]:select-none")
    const language = /<span class="([^"]*)">ja<\/span>/.exec(html)?.[1] ?? ""
    expect(language).toContain("select-none")
    const heading = /<span class="([^"]*)">公開中の v4<\/span>/.exec(html)?.[1] ?? ""
    expect(heading).toContain("select-none")
  })
})

describe("RowsCompare", () => {
  const columns = ["研究代表者", "所属機関"]

  it("draws the page's own table once, with every column and heading", () => {
    const html = draw(
      <RowsCompare
        locale="ja"
        against="公開中の v8"
        before={{ columns, rows: [{ id: "a", cells: ["宇佐美 真一", "信州大学"] }] }}
        after={{ columns, rows: [{ id: "a", cells: ["宇佐美 真一", "信州大学"] }] }}
      />,
    )
    expect(html.match(/<table/g)?.length).toBe(1)
    expect(html).toContain(">研究代表者</th>")
    expect(html).toContain(">所属機関</th>")
    expect(html).toContain("信州大学")
    // A row that did not move is not tinted.
    expect(html).not.toMatch(/bg-diff-/)
  })

  it("shows how many rows each side holds, a side holding none included", () => {
    const html = draw(
      <RowsCompare
        locale="ja"
        against="公開中の v8"
        before={{ columns, rows: [{ id: "a", cells: ["A", "X"] }, { id: "b", cells: ["B", "Y"] }] }}
        after={null}
      />,
    )
    expect(html).toContain("公開中の v8: 2 件 / この下書き: 0 件")
  })

  it("strikes a dropped row on the published tint and underlines an added one on the draft's, with no sign at their head", () => {
    const html = draw(
      <RowsCompare
        locale="ja"
        against="公開中の v8"
        before={{ columns, rows: [{ id: "a", cells: ["Gone", "X"] }] }}
        after={{ columns, rows: [{ id: "n", cells: ["New", "Y"] }] }}
      />,
    )
    expect(html).toMatch(/<tr class="bg-diff-del">[\s\S]*?<del[^>]*>Gone<\/del>/)
    expect(html).toMatch(/<tr class="bg-diff-ins">[\s\S]*?<ins[^>]*>New<\/ins>/)
    expect(html).not.toMatch(/<td[^>]*>[−+-]/)
  })

  it("shows a moved cell twice, the published words over the draft's, and leaves its neighbour as it is", () => {
    const html = draw(
      <RowsCompare
        locale="ja"
        against="公開中の v8"
        before={{ columns, rows: [{ id: "a", cells: ["Same", "Old place"] }] }}
        after={{ columns, rows: [{ id: "a", cells: ["Same", "New place"] }] }}
      />,
    )
    const moved = html.slice(html.indexOf("place") - 200)
    expect(moved.indexOf("<del")).toBeLessThan(moved.indexOf("<ins"))
    expect(html).toMatch(/<del[^>]*>Old<\/del>/)
    expect(html).toMatch(/<ins[^>]*>New<\/ins>/)
    expect(html).toMatch(/<td[^>]*>Same<\/td>/)
  })
})
