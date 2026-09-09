import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { Chip, Clamped, Fold, foldShown, PaneHeading } from "./base"

/** Rendered at an address, since a part may hold a link. */
function render(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/research"]} />)
}

const many = (count: number) =>
  Array.from({ length: count }, (_, at) => `JGAD${String(at + 1).padStart(6, "0")}`)

function clamped(count: number): string {
  return render(
    <Clamped
      items={many(count)}
      more={(rest) => `他 ${String(rest)} 件`}
      less="閉じる"
    />,
  )
}

describe("a list cut short", () => {
  it("shows everything while there is nothing to cut", () => {
    const html = clamped(3)
    expect(html).toContain("JGAD000003")
    expect(html).not.toContain("他 ")
  })

  /**
   * The control is a line of its own, so trading the last entry for it shows
   * less in the same room. Measured over a hundred research rows, no cell with
   * one entry left over decided its own row's height.
   */
  it("keeps the last entry rather than hiding one behind a control", () => {
    const html = clamped(4)
    expect(html).toContain("JGAD000004")
    expect(html).not.toContain("他 ")
  })

  it("cuts once more than one would be hidden, and says how many", () => {
    const html = clamped(5)
    expect(html).toContain("JGAD000003")
    expect(html).not.toContain("JGAD000004")
    expect(html).toContain("他 2 件")
  })

  it("counts what is hidden, not what is shown", () => {
    expect(clamped(47)).toContain("他 44 件")
  })
})

/** What a part draws, with the words only a screen reader hears taken out. */
function visible(html: string): string {
  return html.replace(/<span class="sr-only">.*?<\/span>/g, "").replace(/<[^>]+>/g, "")
}

describe("the name of a pane", () => {
  it("is a second-level heading, or a third where the pane sits under one", () => {
    expect(render(<PaneHeading title="絞り込み" />)).toContain("<h2")
    expect(render(<PaneHeading title="絞り込み" level="h3" />)).toContain("<h3")
  })

  /**
   * The rule is pulled out through the card's padding so that it stands on the
   * same line as the page heading's own; the line under it belongs to the pane
   * and spans it. Moving the pull onto the row would drag the line out too, and
   * the pane would read as hanging off the left of everything below it.
   */
  it("hangs the rule out of the card without dragging the line with it", () => {
    const html = render(<PaneHeading title="絞り込み" />)
    const row = /<div class="([^"]*border-b[^"]*)"/.exec(html)?.[1] ?? ""
    const heading = /<h2 class="([^"]*)"/.exec(html)?.[1] ?? ""
    expect(row).not.toContain("-ml-6")
    expect(heading).toContain("-ml-6")
    expect(heading).toContain("border-l-4")
  })

  /*
    The other place a mark may stand: at the start of the thing it names, for a
    pane with no edge of the card to line up with. What must not move with it is
    the line, which is the pane's either way. **The gap goes with the mark**:
    hung out it has to leave room for the words to land back on the content
    edge, standing at the start it only has to bind itself to the word.
  */
  it("stands the rule at the start when asked, without moving the line", () => {
    const html = render(<PaneHeading title="絞り込み" rule="start" />)
    const row = /<div class="([^"]*border-b[^"]*)"/.exec(html)?.[1] ?? ""
    const heading = /<h2 class="([^"]*)"/.exec(html)?.[1] ?? ""
    expect(heading).not.toContain("-ml-6")
    expect(heading).toContain("border-l-4")
    // The hung-out gap would put the words 10px left of everything under them.
    expect(heading).not.toContain("pl-5")
    expect(row).toContain("border-b")
    expect(row).not.toContain("-ml-6")
  })

  it("keeps what shares its line out of the heading's own name", () => {
    const html = render(<PaneHeading title="絞り込み"><span>すべて解除</span></PaneHeading>)
    const named = /<h2[^>]*>(.*?)<\/h2>/.exec(html)?.[1] ?? ""
    expect(named).toContain("絞り込み")
    expect(named).not.toContain("すべて解除")
    expect(html).toContain("すべて解除")
  })
})

describe("a condition in force", () => {
  it("is one link, so what is drawn and what is undone are the same thing", () => {
    const html = render(<Chip field="性別" value="男性" to="/research" remove="解除" />)
    expect((html.match(/<a /g) ?? []).length).toBe(1)
  })

  it("draws what the condition is about before what it says", () => {
    expect(visible(render(<Chip field="性別" value="男性" to="/research" remove="解除" />)))
      .toBe("性別男性")
  })

  it("draws only the value when the condition names no field", () => {
    expect(visible(render(<Chip value="title:ゲノム" to="/research" remove="解除" />)))
      .toBe("title:ゲノム")
  })

  /** The glyph is hidden, so without this the link is read out as "link". */
  it("says what pressing it takes off", () => {
    expect(render(<Chip field="性別" value="男性" to="/research" remove="性別: 男性 を解除" />))
      .toContain("性別: 男性 を解除")
  })
})

describe("a part of a panel that folds", () => {
  it("is open while there is a reason for it to be", () => {
    expect(render(<Fold summary="疾患" open>C34</Fold>)).toContain("<details open")
  })

  it("is shut when there is none", () => {
    expect(render(<Fold summary="疾患">C34</Fold>)).not.toContain("<details open")
  })

  it("opens when a reason appears", () => {
    expect(foldShown(false, true)).toBe(true)
  })

  /**
   * The reason going away is not the reader asking for the section to be put
   * away. Written as the reason alone, lifting the last condition of a facet
   * would fold it up under a reader who was reading it.
   */
  it("stays open when the reason goes away, which nobody asked for", () => {
    expect(foldShown(true, false)).toBe(true)
  })

  it("stays shut while nothing has opened it", () => {
    expect(foldShown(false, false)).toBe(false)
  })

  /**
   * The same distances either way, but only one of them is inside the thing
   * that gets pressed: on the `<details>` it left a 22.4px target — the line of
   * words and nothing else — under 8px of margin nobody could press.
   */
  it("puts its padding inside the thing that gets pressed", () => {
    const html = render(<Fold summary="疾患">C34</Fold>)

    expect(html).toMatch(/<summary[^>]*\bpy-2\b/)
    expect(html).not.toMatch(/<details[^>]*\bpy-2\b/)
  })
})
