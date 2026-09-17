import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { FieldProblem } from "~/admin/form.server"

import { SlotEditor } from "./fields"

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
