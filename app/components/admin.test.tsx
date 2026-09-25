import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { usePanes } from "./admin"

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
