import fc from "fast-check"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { nextOpenedFrom, readOpenedFrom, usePanes, type OpenedFrom } from "./admin"

/**
 * A stand-in for a screen that arranges two panes: the same two contents
 * either way, so the only thing under test is where `usePanes` puts the
 * switch — on the panes' own tabs, or handed back for the caller to place.
 */
function Panes({ under }: { under: "page" | "bar" }) {
  const panes = usePanes({
    locale: "ja",
    under,
    contents: [
      { id: "form", label: "編集", body: <p>form</p> },
      { id: "page", label: "公開ページ", body: <p>page</p> },
    ],
  })
  return (
    <>
      <div data-testid="view">{panes.view}</div>
      <div data-testid="control-slot">{panes.control}</div>
    </>
  )
}

function parts(under: "page" | "bar"): { view: string, control: string } {
  const html = renderToStaticMarkup(<Panes under={under} />)
  const at = html.indexOf("data-testid=\"control-slot\"")
  return { view: html.slice(0, at), control: html.slice(at) }
}

describe("usePanes", () => {
  it("draws the switch on the panes' own tabs when nothing is shown above them", () => {
    const { view } = parts("page")
    expect(view).toContain("表示 pane")
  })

  it("draws it once, not also on the tabs, when a row above the panes will hold it", () => {
    const { view } = parts("bar")
    expect(view).not.toContain("表示 pane")
  })

  it("hands the switch back either way, for a caller with somewhere else to put it", () => {
    expect(parts("page").control).toContain("表示 pane")
    expect(parts("bar").control).toContain("表示 pane")
  })

  it("shows the word beside the switch once, hidden from the reader the group's name already reaches", () => {
    const { control } = parts("bar")
    expect(control).toContain("aria-hidden=\"true\">表示 pane<")
    expect(control).toContain("aria-label=\"表示 pane\"")
    expect(control.match(/表示 pane/g)).toHaveLength(2)
  })
})

/** The screens a tab walks through, one after another, and what is kept after the last. */
function walk(...paths: string[]): OpenedFrom {
  return paths.reduce(nextOpenedFrom, { last: null, from: {} })
}

const RESEARCH = "/admin/research/r"
const EDITOR = `${RESEARCH}/draft/d`
const DATASETS = `${EDITOR}/dataset`
const DATASET = `${DATASETS}/x`
const PUBLISH = `${EDITOR}/publish`
const REVIEW = `${EDITOR}/review`
const IMPORT = `${EDITOR}/import`

describe("nextOpenedFrom", () => {
  it("records the screen a screen was opened from", () => {
    expect(walk(EDITOR, DATASETS).from[DATASETS]).toBe(EDITOR)
    expect(walk(RESEARCH, DATASETS).from[DATASETS]).toBe(RESEARCH)
    expect(walk(RESEARCH, PUBLISH, EDITOR).from[EDITOR]).toBe(PUBLISH)
    expect(walk(RESEARCH, PUBLISH, REVIEW).from[REVIEW]).toBe(PUBLISH)
  })

  it("keeps where a screen was opened from when coming back to it from a screen it opened", () => {
    expect(walk(EDITOR, DATASETS, DATASET, DATASETS).from[DATASETS]).toBe(EDITOR)
    expect(walk(PUBLISH, EDITOR, DATASETS, EDITOR).from[EDITOR]).toBe(PUBLISH)
    expect(walk(PUBLISH, EDITOR, IMPORT, EDITOR).from[EDITOR]).toBe(PUBLISH)
    expect(walk(PUBLISH, EDITOR, DATASETS, DATASET, DATASETS, EDITOR).from[EDITOR]).toBe(PUBLISH)
  })

  it("records the new screen when one is reached another way, however it was reached before", () => {
    expect(walk(EDITOR, DATASETS, EDITOR, RESEARCH, DATASETS).from[DATASETS]).toBe(RESEARCH)
    expect(walk(EDITOR, DATASETS, RESEARCH, PUBLISH, DATASET, DATASETS).from[DATASETS]).toBe(DATASET)
    // Publishing, its editor, back twice to the research, and the editor again from there.
    expect(walk(RESEARCH, PUBLISH, EDITOR, PUBLISH, RESEARCH, EDITOR).from[EDITOR]).toBe(RESEARCH)
  })

  it("changes nothing when the same screen is shown again, as a reload does", () => {
    const held = walk(EDITOR, DATASETS)
    expect(nextOpenedFrom(held, DATASETS)).toBe(held)
  })

  it("keeps only the screens on the way back from the one shown", () => {
    const held = walk(RESEARCH, PUBLISH, EDITOR, DATASETS, DATASET)
    expect(held.from).toEqual({ [DATASET]: DATASETS, [DATASETS]: EDITOR, [EDITOR]: PUBLISH, [PUBLISH]: RESEARCH })
    expect(walk(RESEARCH, PUBLISH, EDITOR, RESEARCH).from).toEqual({ [RESEARCH]: EDITOR, [EDITOR]: PUBLISH, [PUBLISH]: RESEARCH })
  })

  it("keeps no more than the screens visited, and always ends on the one shown, whatever the walk", () => {
    const screens = fc.constantFrom(RESEARCH, EDITOR, DATASETS, DATASET, PUBLISH, REVIEW, IMPORT)
    fc.assert(fc.property(fc.array(screens, { maxLength: 30 }), (paths) => {
      const held = walk(...paths)
      expect(held.last).toBe(paths.at(-1) ?? null)
      expect(Object.keys(held.from).length).toBeLessThanOrEqual(new Set(paths).size)
      for (const [screen, opener] of Object.entries(held.from)) {
        expect(screen).not.toBe(opener)
        expect(paths).toContain(opener)
      }
    }))
  })
})

describe("readOpenedFrom", () => {
  it("reads back what was written", () => {
    const held = walk(RESEARCH, PUBLISH, EDITOR)
    expect(readOpenedFrom(JSON.stringify(held))).toEqual(held)
  })

  it("reads anything else as nothing kept", () => {
    for (const raw of [null, "", "{", "null", "[]", "3", JSON.stringify({ last: 3, from: {} }), JSON.stringify({ last: null })]) {
      expect(readOpenedFrom(raw), String(raw)).toEqual({ last: null, from: {} })
    }
  })

  it("drops an entry that is not a path", () => {
    expect(readOpenedFrom(JSON.stringify({ last: EDITOR, from: { [EDITOR]: PUBLISH, [PUBLISH]: 4 } })))
      .toEqual({ last: EDITOR, from: { [EDITOR]: PUBLISH } })
  })
})
