import fc from "fast-check"
import { renderToString } from "react-dom/server"
import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it } from "vitest"

import { IdForm, shownNhaId } from "./dataset-id"

function render(nextNhaId: string | null, size?: "row"): string {
  const router = createMemoryRouter([{
    path: "/",
    element: <form><IdForm nextNhaId={nextNhaId} locale="ja" size={size} /></form>,
  }])
  return renderToString(<RouterProvider router={router} />)
}

describe("the box a dataset's id is given in", () => {
  it("opens as a box to type an accession in, refusing it empty, with the two ways beside it", () => {
    const html = render("NHA000007")
    const box = /<input[^>]*name="label"[^>]*>/.exec(html)?.[0] ?? ""
    const buttons = html.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? []
    const named = (word: string) => buttons.find((button) => button.includes(word)) ?? ""

    expect(box).toContain("required=\"\"")
    expect(box).toContain("aria-label=\"データセット ID\"")
    expect(named("割り当て")).toContain("value=\"pin\"")
    // Pressed before the script is ready, it must not send anything: issuing
    // happens only through「割り当て」.
    expect(named("NHA ID の発行")).toContain("type=\"button\"")
    expect(named("NHA ID の発行")).not.toContain("name=\"intent\"")
  })

  it("shows no number until issuing is pressed, so nothing is proposed into the box", () => {
    const html = render("NHA000007")

    expect(html).not.toContain("NHA000007")
    expect(html).not.toMatch(/name="label"[^>]*value=/)
  })

  it("takes a table row's height when it is shown in one", () => {
    const html = render("NHA000007", "row")

    expect(html).toMatch(/<input[^>]*class="[^"]*min-h-6[^"]*py-0\.5/)
    expect(html).not.toMatch(/<input[^>]*class="[^"]*py-1\.5/)
    expect(html.match(/<button[^>]*min-h-6/g)?.length).toBe(2)
  })
})

describe("what a row shows while issuing", () => {
  it("counts on from the next number in the order the rows were pressed", () => {
    expect(shownNhaId("NHA000007", ["b", "a"], "b")).toBe("NHA000007")
    expect(shownNhaId("NHA000007", ["b", "a"], "a")).toBe("NHA000008")
    // A row not pressed yet shows the number it would take.
    expect(shownNhaId("NHA000007", ["b", "a"], "c")).toBe("NHA000009")
    expect(shownNhaId("NHA000007", [], "c")).toBe("NHA000007")
  })

  it("shows nothing when there is no next number to count from", () => {
    expect(shownNhaId(null, ["a"], "a")).toBeNull()
  })

  it("never shows the same number on two pressed rows", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 900_000 }),
      fc.uniqueArray(fc.string({ minLength: 1 }), { maxLength: 20 }),
      (next, rows) => {
        const shown = rows.map((row) => shownNhaId(`NHA${String(next).padStart(6, "0")}`, rows, row))
        return new Set(shown).size === rows.length
      },
    ))
  })
})
