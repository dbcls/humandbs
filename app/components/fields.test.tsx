import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { FieldProblem } from "~/admin/form.server"

import { type Marks, PairField, SlotEditor, StateSwitch, toggledState } from "./fields"

/** Rendered inside a router, since the state switch beside the box closes on a move. */
function render(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin"]} />)
}

function slot(problems: FieldProblem[], multiline = false): React.ReactNode {
  return (
    <SlotEditor
      language="ja"
      value={{ state: "value", text: "## 見出し" }}
      multiline={multiline}
      onChange={() => { /* nothing is typed here */ }}
      locale="ja"
      problems={problems}
    />
  )
}

const HEADING: FieldProblem = { path: "summary.aims", syntax: "heading", line: 1 }
const TABLE: FieldProblem = { path: "summary.aims", syntax: "table", line: 3 }

/** The ids the boxes name, in the order the boxes stand. */
function describedBy(html: string): string[] {
  return [...html.matchAll(/<(?:input|textarea)[^>]*aria-describedby="([^"]+)"/g)].map((found) => found[1] ?? "")
}

/** What the element carrying this id says, with the markup taken out. */
function textOf(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`)
  if (start < 0) return ""
  const end = html.indexOf("</ul>", start)
  return html.slice(start, end).replace(/<[^>]*>/g, "")
}

describe("the problems a save found in one box", () => {
  for (const multiline of [false, true]) {
    const box = multiline ? "a box of several lines" : "a one-line box"

    it(`are named by ${box}, so a reader on it hears what is wrong`, () => {
      const html = render(slot([HEADING, TABLE], multiline))
      const [id, ...more] = describedBy(html)
      expect(more).toEqual([])
      expect(id).toBeDefined()
      expect(html).toMatch(/aria-invalid="true"/)
      // The name leads to the list itself, and the list holds every problem.
      expect(textOf(html, id ?? "")).toContain("見出し (1 行目)")
      expect(textOf(html, id ?? "")).toContain("表 (3 行目)")
    })

    it(`leave ${box} unmarked when there are none`, () => {
      const html = render(slot([], multiline))
      expect(describedBy(html)).toEqual([])
      expect(html).not.toContain("aria-invalid")
      expect(html).not.toContain("text-danger")
    })
  }

  it("are each box's own when two boxes of one field both have some", () => {
    const html = render(
      <>
        {slot([HEADING])}
        {slot([TABLE])}
      </>,
    )
    const ids = describedBy(html)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    expect(textOf(html, ids[0] ?? "")).toContain("見出し (1 行目)")
    expect(textOf(html, ids[0] ?? "")).not.toContain("表")
    expect(textOf(html, ids[1] ?? "")).toContain("表 (3 行目)")
  })
})

/**
 * The rule that keeps the two marks exclusive lives here rather than in the
 * button wiring, so it is checked as a fact about the function — not by
 * simulating a click the static render below cannot make.
 */
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

describe("a slot marked unsettled or not-applicable", () => {
  it("folds the box away and stands the state's own word in its place", () => {
    const html = render(
      <SlotEditor
        language="ja"
        value={{ state: "unknown", text: "書きかけ" }}
        onChange={() => { /* nothing is typed here */ }}
        locale="ja"
        problems={[]}
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
        problems={[]}
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
        problems={[]}
      />,
    )
    expect(html).toContain("<input")
    expect(html).toContain("書きかけ")
  })
})

describe("the dialect badge on a field's name row", () => {
  const marks = (): Marks => ({ at: "summary.aims", changed: false, onTake: null, problems: [] })
  const pair = { ja: { state: "value" as const, text: "" }, en: { state: "value" as const, text: "" } }

  it("stands on the name row even when the field has no name of its own", () => {
    const html = render(
      <PairField value={pair} multiline marks={marks()} locale="ja" onChange={() => { /* nothing changes here */ }} />,
    )
    expect(html).toContain("リンクと改行")
  })

  it("is absent from a field that does not read prose", () => {
    const html = render(
      <PairField value={pair} marks={marks()} locale="ja" onChange={() => { /* nothing changes here */ }} />,
    )
    expect(html).not.toContain("リンクと改行")
  })
})
