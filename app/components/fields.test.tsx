import fc from "fast-check"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { ConflictBanner, elementPanelTitle, ItemList, keptOnClose, shortfallsOf, LanguageLabel, SingleField, type FieldAnnotations, PairField, Section, SlotEditor, StateSwitch, toggledState } from "./fields"

/** Rendered inside a router, since the state switch beside the box closes on a move. */
function render(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin"]} />)
}

describe("toggledState", () => {
  it("takes on the state that was pressed, from a value", () => {
    expect(toggledState("value", "unknown")).toBe("unknown")
    expect(toggledState("value", "not-applicable")).toBe("not-applicable")
  })

  it("releases an indicator back to a value when the same indicator is pressed again", () => {
    expect(toggledState("unknown", "unknown")).toBe("value")
    expect(toggledState("not-applicable", "not-applicable")).toBe("value")
  })

  it("switches directly from one indicator to the other, never holding both", () => {
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
   * **Both indicators are always on the screen**, since either changes what the
   * page shows; a switch that only appeared once used was one nobody used.
   */
  it("shows both indicators by name, with the one in force pressed and filled", () => {
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

  it("draws the ordinary answer (a value) with neither toggle pressed or filled", () => {
    const html = render(
      <StateSwitch state="value" locale="ja" onChange={() => { /* nothing changes here */ }} />,
    )
    expect(html).not.toContain("aria-pressed=\"true\"")
    expect(html).not.toContain("bg-brand")
  })
})

describe("what a state toggle shows it does", () => {
  it("draws the effect over the indicator — taking it on, or letting it go once held — and keeps the state's word as the name", () => {
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
  it("collapses the box and shows the state's own word in its place", () => {
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

  it("collapses a multiline box the same way for not-applicable", () => {
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
    // state change, and this is the other half: the box, expanded, is a plain
    // display of whatever `text` it is given, so a value kept through a
    // collapse and back still reads on the box.
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
  const annotations = (): FieldAnnotations => ({ at: "summary.aims", changed: false, onImport: null })
  const pair = { ja: { state: "value" as const, text: "" }, en: { state: "value" as const, text: "" } }

  it("is shown right after the name, before anything else on the row", () => {
    const html = render(
      <PairField label="対象" value={pair} multiline annotations={{ ...annotations(), changed: true }} locale="ja" onChange={() => { /* nothing changes here */ }} />,
    )
    const name = html.indexOf(">対象<")
    const badge = html.indexOf("リンクと改行")
    const changed = html.indexOf("別の場所で変更")
    expect(name).toBeGreaterThan(-1)
    expect(badge).toBeGreaterThan(name)
    expect(changed).toBeGreaterThan(badge)
    expect(html.slice(name, badge)).not.toContain("ml-auto")
  })

  it("is not drawn by a field with no name of its own — the heading naming it shows it", () => {
    const html = render(
      <PairField value={pair} multiline annotations={annotations()} locale="ja" onChange={() => { /* nothing changes here */ }} />,
    )
    expect(html).not.toContain("リンクと改行")
    const section = render(<Section id="releaseNote" title="リリースノート" accepts="リンクと改行"><p>欄</p></Section>)
    expect(section).toMatch(/<h2[^>]*>リリースノート[\s\S]*?リンクと改行[\s\S]*?<\/h2>/)
  })

  it("draws no row for a field with no name, however much the review has to show — the heading shows it", () => {
    const html = render(
      <PairField
        value={{ ja: { state: "value", text: "値" }, en: { state: "value", text: "" } }}
        annotations={{ ...annotations(), changed: true }}
        locale="ja"
        onChange={() => { /* nothing changes here */ }}
      />,
    )
    expect(html).not.toContain("未翻訳")
    expect(html).not.toContain("別の場所で変更")
    const section = render(<Section id="title" title="研究題目" flags={<i>未翻訳</i>}><p>欄</p></Section>)
    expect(section).toMatch(/<h2[^>]*>研究題目[\s\S]*?<i>未翻訳<\/i>[\s\S]*?<\/h2>/)
  })

  it("is absent from a field that does not read prose", () => {
    const html = render(
      <PairField value={pair} annotations={annotations()} locale="ja" onChange={() => { /* nothing changes here */ }} />,
    )
    expect(html).not.toContain("リンクと改行")
  })
})

describe("the language label beside a field", () => {
  it("names the language as its code, at the size of the words beside it", () => {
    const html = render(<LanguageLabel language="en" />)
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
      columns={columns}
      onChange={() => { /* nothing changes here */ }}
      makeEmpty={() => ({ id: "new", name: "", number: "" })}
    >
      {() => null}
    </ItemList>,
  )

  it("is shown as a table with the columns given, the four operations at each row's end, in the list's order", () => {
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

  it("shows 未入力 in the first column of a row with nothing written, and leaves the other cells empty", () => {
    const html = list([{ id: "a", name: "", number: "" }])
    expect(html.match(/未入力/g)?.length).toBe(1)
  })

  it("lowers each row's operations onto the first line of the row's words", () => {
    const html = list([{ id: "a", name: "課題 A", number: "JP1" }])
    const operations = /<td[^>]*>(?:(?!<\/td>)[\s\S])*aria-label="編集"/.exec(html)?.[0] ?? ""
    expect(operations).toMatch(/<td[^>]*class="[^"]*\bpy-0\b/)
  })

  it("draws no table while the list is empty — only the way to add one", () => {
    const html = list([])
    expect(html).not.toContain("<table")
    expect(html).toContain("追加")
  })
})

describe("an element's panel", () => {
  it("is named for the list, 「の追加」 for the element just added and 「の編集」 for one already there", () => {
    expect(elementPanelTitle("助成金情報", "new", "new", "ja")).toBe("助成金情報の追加")
    expect(elementPanelTitle("助成金情報", "a", "new", "ja")).toBe("助成金情報の編集")
    expect(elementPanelTitle("助成金情報", "a", null, "ja")).toBe("助成金情報の編集")
  })

  it("never takes anything written in the element into its name", () => {
    fc.assert(fc.property(fc.string(), fc.boolean(), (list, added) => {
      const title = elementPanelTitle(list, "x", added ? "x" : null, "ja")
      return title === `${list}の追加` || title === `${list}の編集`
    }))
  })
})

describe("what an element's row shows it is short of", () => {
  const pair = (ja: string, en: string) => ({ ja: { state: "value", text: ja }, en: { state: "value", text: en } })

  it("finds a pair with one language written anywhere in the element, however deep", () => {
    expect(shortfallsOf({ id: "a", agency: { name: pair("科研費", "") }, title: pair("課題", "Title") }))
      .toEqual({ untranslated: true, unsettled: false })
  })

  it("finds a value marked unsettled, in either language or in a single slot", () => {
    expect(shortfallsOf({ id: "a", title: { ja: { state: "unknown", text: "" }, en: { state: "value", text: "" } } }).unsettled).toBe(true)
    expect(shortfallsOf({ id: "a", doi: { state: "unknown", text: "" } }).unsettled).toBe(true)
  })

  it("shows nothing of a pair both sides left empty, both written, or one not applicable", () => {
    expect(shortfallsOf({ id: "a", name: pair("", "") })).toEqual({ untranslated: false, unsettled: false })
    expect(shortfallsOf({ id: "a", name: pair("名", "Name") })).toEqual({ untranslated: false, unsettled: false })
    expect(shortfallsOf({ id: "a", name: { ja: { state: "value", text: "名" }, en: { state: "not-applicable", text: "" } } }))
      .toEqual({ untranslated: false, unsettled: false })
  })

  it("does not check links for translation", () => {
    expect(shortfallsOf({ id: "a", url: { ja: { state: "value", links: [{ url: "https://x" }] }, en: { state: "value", links: [] } } }))
      .toEqual({ untranslated: false, unsettled: false })
  })

  it("puts the indicators on the row, after the element's name", () => {
    const html = render(
      <ItemList
        path="grants"
        locale="ja"
        items={[{ id: "a", title: pair("課題 A", "") }, { id: "b", title: pair("課題 B", "Grant B") }]}
        title="助成金情報"
        columns={[{ header: "研究課題名", cell: (row: { id: string, title: { ja: { text: string } } }) => row.title.ja.text }]}
        onChange={() => { /* nothing changes here */ }}
        makeEmpty={() => ({ id: "new", title: pair("", "") })}
      >
        {() => null}
      </ItemList>,
    )
    const rowA = /<tr[^>]*data-at="grants\.a"[\s\S]*?<\/tr>/.exec(html)?.[0] ?? ""
    const rowB = /<tr[^>]*data-at="grants\.b"[\s\S]*?<\/tr>/.exec(html)?.[0] ?? ""
    expect(rowA.indexOf("課題 A")).toBeLessThan(rowA.indexOf("未翻訳"))
    expect(rowB).not.toContain("未翻訳")
  })
})

describe("the conflict banner", () => {
  it("draws each changed place as a bordered way to its section, not as a bare word", () => {
    const html = render(<ConflictBanner locale="ja" changed={["summary.aims", "publications"]} />)
    const ways = [...html.matchAll(/<a\b[^>]*href="#([^"]*)"[^>]*class="([^"]*)"/g)]
    expect(ways.map((way) => way[1])).toEqual(["summary", "publications"])
    for (const way of ways) expect(way[2]).toMatch(/\bborder\b/)
  })

  it("draws no ways when nothing it can name has changed", () => {
    const html = render(<ConflictBanner locale="ja" changed={[]} />)
    expect(html).not.toContain("<a")
  })
})

describe("a list's row as a place on the form", () => {
  it("names each row by the element's path, so a cell of the page's table can focus it", () => {
    const html = render(
      <ItemList
        path="grants"
        locale="ja"
        items={[{ id: "a", name: "課題 A" }, { id: "b", name: "課題 B" }]}
        title="助成金情報"
        columns={[{ header: "研究課題名", cell: (row: { id: string, name: string }) => row.name }]}
        onChange={() => { /* nothing changes here */ }}
        makeEmpty={() => ({ id: "new", name: "" })}
      >
        {() => null}
      </ItemList>,
    )
    expect(html).toMatch(/<tr[^>]*data-at="grants\.a"/)
    expect(html).toMatch(/<tr[^>]*data-at="grants\.b"/)
    expect(html).toMatch(/<tr[^>]*data-highlighted:bg-warning-surface/)
  })
})

describe("keptOnClose", () => {
  interface Row { id: string, name: string, tags: string[] }
  const row = fc.record({ id: fc.uuid(), name: fc.string(), tags: fc.array(fc.string(), { maxLength: 3 }) })
  const rows = fc.uniqueArray(row, { selector: (one) => one.id, maxLength: 5 })

  it("drops the element just added when it closes exactly as it was made", () => {
    fc.assert(fc.property(rows, row, (before, made) => {
      fc.pre(!before.some((one) => one.id === made.id))
      expect(keptOnClose([...before, made], { ...made, tags: [...made.tags] })).toEqual(before)
    }))
  })

  it("keeps the element just added once anything in it has been written", () => {
    fc.assert(fc.property(rows, row, fc.string({ minLength: 1 }), (before, made, typed) => {
      fc.pre(!before.some((one) => one.id === made.id))
      const written: Row = { ...made, name: made.name + typed }
      const items = [...before, written]
      expect(keptOnClose(items, made)).toBe(items)
    }))
  })

  it("hands back the same list when nothing was just added, however empty a row is", () => {
    fc.assert(fc.property(rows, (items) => {
      expect(keptOnClose(items, null)).toBe(items)
    }))
    const empty = [{ id: "a", name: "", tags: [] }]
    expect(keptOnClose(empty, null)).toBe(empty)
  })

  it("hands back the same list when the element just added is no longer in it", () => {
    fc.assert(fc.property(rows, row, (items, made) => {
      fc.pre(!items.some((one) => one.id === made.id))
      expect(keptOnClose(items, made)).toBe(items)
    }))
  })
})

describe("a field with one value", () => {
  const value = { state: "value" as const, text: "https://doi.org/10.1/x" }
  const annotations = (): FieldAnnotations => ({ at: "relatedPublications.p1.doi", changed: false, onImport: null })
  const field = (props: { wide?: boolean, hint?: string }) => render(
    <SingleField label="DOI" value={value} annotations={annotations()} locale="ja" onChange={() => { /* nothing changes here */ }} {...props} />,
  )

  it("holds an identifier to a short box unless told the value is long", () => {
    expect(field({})).toContain("md:max-w-md")
    expect(field({ wide: true })).not.toContain("md:max-w-md")
  })

  it("shows the hint under the box, and nothing where there is none", () => {
    const hint = "論文の DOI を、https://doi.org/ から始まる完全な URL で書く。"
    const html = field({ wide: true, hint })
    expect(html).toContain(hint)
    expect(html.indexOf(hint)).toBeGreaterThan(html.indexOf("<input"))
    expect(field({ wide: true })).not.toContain("完全な URL")
  })
})
