import { describe, expect, it } from "vitest"

import { isEmptyRichText, linkHref, toMarkdown, toPlainText } from "./richtext"

describe("toPlainText", () => {
  it("puts nothing between spans, because a span boundary is not a word boundary", () => {
    expect(toPlainText([[{ text: "1.73m" }, { text: "²" }]])).toBe("1.73m²")
  })

  it("keeps a link's text and loses its destination", () => {
    expect(toPlainText([[{ text: "JGAD000234", href: "https://ddbj.nig.ac.jp/x" }]]))
      .toBe("JGAD000234")
  })

  it("writes one line per line, blank ones included", () => {
    expect(toPlainText([[{ text: "a" }], [], [{ text: "b" }]])).toBe("a\n\nb")
  })

  it("produces nothing for prose nobody has written", () => {
    expect(toPlainText([])).toBe("")
  })
})

describe("isEmptyRichText", () => {
  it("reads lines that carry no text as nothing having been written", () => {
    expect(isEmptyRichText([])).toBe(true)
    expect(isEmptyRichText([[], []])).toBe(true)
    expect(isEmptyRichText([[{ text: "" }]])).toBe(true)
  })

  it("reads any text at all as something having been written", () => {
    expect(isEmptyRichText([[], [{ text: "a" }]])).toBe(false)
    expect(isEmptyRichText([[{ text: "", href: "https://example.com/" }, { text: "a" }]])).toBe(false)
  })
})

describe("toMarkdown", () => {
  it("writes a link back as a link", () => {
    expect(toMarkdown([[{ text: "NBDC policy", href: "/nbdc-policy" }]]))
      .toBe("[NBDC policy](/nbdc-policy)")
  })

  it("wraps a destination holding a space in angle brackets", () => {
    expect(toMarkdown([[{ text: "panel", href: "/files/hum0405/TGS probe.xlsx" }]]))
      .toBe("[panel](</files/hum0405/TGS probe.xlsx>)")
  })

  it("escapes what would otherwise be read back as syntax", () => {
    expect(toMarkdown([[{ text: "call rate < 0.95" }]])).toBe("call rate \\< 0.95")
    expect(toMarkdown([[{ text: "*not emphasis*" }]])).toBe("\\*not emphasis\\*")
    expect(toMarkdown([[{ text: "[not a link](x)" }]])).toBe("\\[not a link\\](x)")
    expect(toMarkdown([[{ text: "a & b" }]])).toBe("a \\& b")
  })

  it("escapes at the start of a line what only means something there", () => {
    expect(toMarkdown([[{ text: "- not a list" }]])).toBe("\\- not a list")
    expect(toMarkdown([[{ text: "# not a heading" }]])).toBe("\\# not a heading")
    expect(toMarkdown([[{ text: "1. not a list" }]])).toBe("1\\. not a list")
    expect(toMarkdown([[{ text: "a" }, { text: "- still not a list" }]]))
      .toBe("a- still not a list")
  })

  it("leaves an underscore inside a word alone, as markdown does", () => {
    expect(toMarkdown([[{ text: "PI_HAT > 0.175" }]])).toBe("PI_HAT > 0.175")
    expect(toMarkdown([[{ text: "_leading" }]])).toBe("\\_leading")
  })

  it("writes one line per line", () => {
    expect(toMarkdown([[{ text: "a" }], [], [{ text: "b" }]])).toBe("a\n\nb")
    expect(toMarkdown([])).toBe("")
  })
})

describe("linkHref", () => {
  it("follows the destinations the published text uses", () => {
    expect(linkHref("https://ddbj.nig.ac.jp/")).toBe("https://ddbj.nig.ac.jp/")
    expect(linkHref("http://example.com/")).toBe("http://example.com/")
    expect(linkHref("mailto:someone@example.com")).toBe("mailto:someone@example.com")
    expect(linkHref("/files/hum0009/hum0009.v1.CpG.v1.zip"))
      .toBe("/files/hum0009/hum0009.v1.CpG.v1.zip")
    expect(linkHref("  https://example.com/  ")).toBe("https://example.com/")
  })

  it("refuses anything that could run on the portal's origin", () => {
    expect(linkHref("javascript:alert(1)")).toBeNull()
    expect(linkHref("JaVaScRiPt:alert(1)")).toBeNull()
    expect(linkHref("  javascript:alert(1)")).toBeNull()
    // Browsers strip control characters before reading the scheme; the check
    // does not, so a scheme broken up this way has to fail the check instead.
    expect(linkHref("java\tscript:alert(1)")).toBeNull()
    expect(linkHref("data:text/html,<script>alert(1)</script>")).toBeNull()
    expect(linkHref("vbscript:msgbox(1)")).toBeNull()
  })

  it("refuses a destination with no scheme, which names a host and not a path", () => {
    expect(linkHref("//example.com/")).toBeNull()
    expect(linkHref("example.com")).toBeNull()
    expect(linkHref("")).toBeNull()
  })
})
