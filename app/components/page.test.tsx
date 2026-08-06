import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { RichText } from "~/content/types"
import type { FieldView } from "~/public/view.server"

import { Value } from "./page"

function render(field: FieldView): string {
  return renderToStaticMarkup(<Value field={field} locale="ja" />)
}

function prose(text: RichText): string {
  return render({ state: "rich", text, untranslated: false })
}

describe("a rendered value", () => {
  it("breaks the line between lines and nowhere else", () => {
    expect(prose([[{ text: "1.73m" }, { text: "²" }], [{ text: "next" }]]))
      .toBe("1.73m²<br/>next")
  })

  it("links a span whose destination the page may follow", () => {
    expect(prose([[{ text: "NBDC policy", href: "/nbdc-policy" }]]))
      .toBe("<a href=\"/nbdc-policy\">NBDC policy</a>")
  })

  it("keeps the text of a span whose destination it may not, and drops the link", () => {
    expect(prose([[{ text: "click", href: "javascript:alert(1)" }]])).toBe("click")
    expect(prose([[{ text: "click", href: "//example.com/" }]])).toBe("click")
  })

  it("writes text as text, so markup in a value cannot become markup", () => {
    const html = prose([[{ text: "<script>alert(1)</script>" }]])
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("renders nothing for prose nobody has written", () => {
    expect(prose([])).toBe("")
    expect(render({ state: "plain", text: "", untranslated: false })).toBe("")
  })

  it("shows a settled 'no such value' rather than an empty space", () => {
    expect(render({ state: "not-applicable" })).toContain("該当なし")
  })
})
