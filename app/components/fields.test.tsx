import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { ItemList, LanguageMark, type Marks, PairField, Section, SlotEditor, StateSwitch, toggledState } from "./fields"

/** Rendered inside a router, since the state switch beside the box closes on a move. */
function render(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin"]} />)
}

describe("toggledState", () => {
  it("takes on the mark that was pressed, from a value", () => {
    expect(toggledState("value", "unknown")).toBe("unknown")
    expect(toggledState("value", "not-applicable")).toBe("not-applicable")
  })

  it("releases a mark back to a value when the same mark is pressed again", () => {
    expect(toggledState("unknown", "unknown")).toBe("value")
    expect(toggledState("not-applicable", "not-applicable")).toBe("value")
  })

  it("switches directly from one mark to the other, never holding both", () => {
    expect(toggledState("unknown", "not-applicable")).toBe("not-applicable")
    expect(toggledState("not-applicable", "unknown")).toBe("unknown")
  })
})

describe("the state switch", () => {
  const pressedIn = (html: string): string =>
    /<button[^>]*aria-pressed="true"[^>]*>/.exec(html)?.[0] ?? ""
  const unpressedIn = (html: string): string[] =>
    [...html.matchAll(/<button[^>]*aria-pressed="false"[^>]*>[\s\S]*?<\/button>/g)].map((found) => found[0])

  /**
   * **Both marks are always on the screen**, since either changes what the
   * page shows; a switch that only appeared once used was one nobody used
   * (`docs/admin-ui.md` の「欄の状態」).
   */
  it("shows both marks by name, with the one in force pressed and filled", () => {
    const html = render(
      <StateSwitch state="unknown" locale="ja" onChange={() => { /* nothing changes here */ }} />,
    )
    expect(html).toContain("aria-label=\"値の扱い\"")
    expect(html).toContain("aria-label=\"未確定\"")
    expect(html).toContain("aria-label=\"該当なし\"")
    expect(pressedIn(html)).toContain("bg-brand")
    expect(unpressedIn(html)).toHaveLength(1)
    expect(unpressedIn(html)[0]).not.toContain("bg-brand")
  })

  it("draws the ordinary answer (a value) with neither mark pressed or filled", () => {
    const html = render(
      <StateSwitch state="value" locale="ja" onChange={() => { /* nothing changes here */ }} />,
    )
    expect(html).not.toContain("aria-pressed=\"true\"")
    expect(html).not.toContain("bg-brand")
  })
})

describe("what a state mark says it does", () => {
  it("draws the effect over the mark — taking it on, or letting it go once held — and keeps the state's word as the name", () => {
    const value = render(<StateSwitch state="value" locale="ja" onChange={() => { /* nothing changes here */ }} />)
    expect(value).toContain("未確定にする")
    expect(value).toContain("該当なしにする")
    expect(value).not.toContain("の解除")
    const held = render(<StateSwitch state="unknown" locale="ja" onChange={() => { /* nothing changes here */ }} />)
    expect(held).toContain("未確定の解除")
    expect(held).toContain("該当なしにする")
    expect(held).toContain("aria-label=\"未確定\"")
  })

  it("is a drawn sentence, not a title the browser shows late", () => {
    const html = render(<StateSwitch state="value" locale="ja" onChange={() => { /* nothing changes here */ }} />)
    expect(html).not.toContain("title=")
    expect(html.match(/role="tooltip"/g)?.length).toBe(2)
    expect(html).toMatch(/aria-describedby="[^"]+"/)
  })
})

describe("a slot marked unsettled or not-applicable", () => {
  it("folds the box away and stands the state's own word in its place", () => {
    const html = render(
      <SlotEditor
        language="ja"
        value={{ state: "unknown", text: "書きかけ" }}
        onChange={() => { /* nothing is typed here */ }}
        locale="ja"
      />,
    )
    expect(html).not.toContain("<input")
    expect(html).not.toContain("<textarea")
    expect(html).toContain("未確定")
  })

  it("folds a multiline box the same way for not-applicable", () => {
    const html = render(
      <SlotEditor
        language="ja"
        value={{ state: "not-applicable", text: "書きかけ" }}
        multiline
        onChange={() => { /* nothing is typed here */ }}
        locale="ja"
      />,
    )
    expect(html).not.toContain("<textarea")
    expect(html).toContain("該当なし")
  })

  it("keeps showing the typed text once the state is a value again", () => {
    // `onChange={(state) => onChange({ ...value, state })}` is what SlotEditor
    // hands `StateSwitch` — the spread is what keeps `text` untouched by a
    // state change, and this is the other half: the box, unfolded, is a plain
    // display of whatever `text` it is given, so a value carried through a
    // fold and back still reads on the box.
    const html = render(
      <SlotEditor
        language="ja"
        value={{ state: "value", text: "書きかけ" }}
        onChange={() => { /* nothing is typed here */ }}
        locale="ja"
      />,
    )
    expect(html).toContain("<input")
    expect(html).toContain("書きかけ")
  })
})

describe("the dialect badge on a field's name row", () => {
  const marks = (): Marks => ({ at: "summary.aims", changed: false, onTake: null })
  const pair = { ja: { state: "value" as const, text: "" }, en: { state: "value" as const, text: "" } }

  it("stands right after the name, before anything else on the row", () => {
    const html = render(
      <PairField label="対象" value={pair} multiline marks={{ ...marks(), changed: true }} locale="ja" onChange={() => { /* nothing changes here */ }} />,
    )
    const name = html.indexOf(">対象<")
    const badge = html.indexOf("リンクと改行")
    const changed = html.indexOf("変更あり")
    expect(name).toBeGreaterThan(-1)
    expect(badge).toBeGreaterThan(name)
    expect(changed).toBeGreaterThan(badge)
    expect(html.slice(name, badge)).not.toContain("ml-auto")
  })

  it("is not drawn by a field with no name of its own — the heading naming it carries it", () => {
    const html = render(
      <PairField value={pair} multiline marks={marks()} locale="ja" onChange={() => { /* nothing changes here */ }} />,
    )
    expect(html).not.toContain("リンクと改行")
    const section = render(<Section id="releaseNote" title="リリースノート" accepts="リンクと改行"><p>欄</p></Section>)
    expect(section).toMatch(/<h2[^>]*>リリースノート[\s\S]*?リンクと改行[\s\S]*?<\/h2>/)
  })

  it("is absent from a field that does not read prose", () => {
    const html = render(
      <PairField value={pair} marks={marks()} locale="ja" onChange={() => { /* nothing changes here */ }} />,
    )
    expect(html).not.toContain("リンクと改行")
  })
})

describe("the language mark beside a box", () => {
  it("names the language as its code, at the size of the words beside it", () => {
    const html = render(<LanguageMark language="en" />)
    expect(html).toContain("lang=\"en\"")
    expect(html).toContain(">en<")
    expect(html).toContain("text-sm")
    expect(html).not.toContain("text-xs")
  })
})

describe("a list of repeated elements", () => {
  interface Row { id: string, name: string, number: string }
  const columns = [
    { header: "研究課題名", cell: (row: Row) => row.name },
    { header: "研究課題番号", cell: (row: Row) => row.number },
  ]
  const list = (items: Row[]) => render(
    <ItemList
      path="grants"
      locale="ja"
      items={items}
      title="助成金情報"
      summary={(row) => row.name}
      columns={columns}
      onChange={() => { /* nothing changes here */ }}
      makeEmpty={() => ({ id: "new", name: "", number: "" })}
    >
      {() => null}
    </ItemList>,
  )

  it("stands as a table with the columns given, the four operations at each row's end, in the list's order", () => {
    const html = list([{ id: "a", name: "課題 A", number: "JP1" }, { id: "b", name: "課題 B", number: "JP2" }])
    expect(html).toContain("<table")
    for (const header of ["研究課題名", "研究課題番号", "操作"]) expect(html).toContain(header)
    expect(html.indexOf("課題 A")).toBeLessThan(html.indexOf("課題 B"))
    expect(html).toContain("JP1")
    for (const label of ["編集", "上へ", "下へ", "削除"]) {
      expect(html.match(new RegExp(`aria-label="${label}"`, "g"))?.length, label).toBe(2)
    }
  })

  it("lets a long value wrap rather than cutting it short", () => {
    const html = list([{ id: "a", name: "ロングリード技術による ".repeat(8), number: "" }])
    expect(html).not.toContain("truncate")
  })

  it("says 未入力 in the first column of a row with nothing written, and leaves the other cells empty", () => {
    const html = list([{ id: "a", name: "", number: "" }])
    expect(html.match(/未入力/g)?.length).toBe(1)
  })

  it("stands no table while the list is empty — only the way to add one", () => {
    const html = list([])
    expect(html).not.toContain("<table")
    expect(html).toContain("追加")
  })
})
