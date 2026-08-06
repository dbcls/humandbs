import { describe, expect, it } from "vitest"

import { renderMarkdown } from "./markdown.server"

describe("rendering content markdown", () => {
  it("renders the constructs the published text actually uses", () => {
    expect(renderMarkdown("[DRA](https://ddbj.nig.ac.jp/)"))
      .toContain("<a href=\"https://ddbj.nig.ac.jp/\">DRA</a>")
    expect(renderMarkdown("- a\n- b")).toContain("<li>a</li>")
    expect(renderMarkdown("**strong**")).toContain("<strong>strong</strong>")
  })

  it("keeps the raw HTML the articles carry meaning in", () => {
    expect(renderMarkdown("10<sup>-8</sup>")).toContain("<sup>-8</sup>")
    expect(renderMarkdown("one<br>two")).toContain("<br>")
  })

  it("drops anything that would execute on the portal's origin", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).not.toContain("<script")
    expect(renderMarkdown("<img src=x onerror=alert(1)>")).not.toContain("onerror")
    expect(renderMarkdown("<a href=\"javascript:alert(1)\">x</a>")).not.toContain("javascript:")
    expect(renderMarkdown("<iframe src=\"https://example.com\"></iframe>")).not.toContain("<iframe")
  })

  it("renders nothing for an empty value", () => {
    expect(renderMarkdown("")).toBe("")
  })
})
