import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { renderMarkdown } from "./markdown.server"

/**
 * The renderer's guarantee is about its output, not about the shapes of input
 * anybody thought to try — so the input space here is deliberately full of the
 * things a sanitiser would have had to catch, mixed with ordinary prose.
 */
const DANGEROUS = [
  "<script>alert(1)</script>",
  "<iframe src=\"https://forms.gle/x\"></iframe>",
  "<img src=x onerror=alert(1)>",
  "<div style=\"position:fixed\">x</div>",
  "<u>x</u>",
  "<a href=\"javascript:alert(1)\">x</a>",
  "<svg onload=alert(1)></svg>",
  "<style>body{display:none}</style>",
  "[x](javascript:alert(1))",
  "[x](  javascript:alert(1)  )",
  "[x](JaVaScRiPt:alert(1))",
  "[x](//evil.example/)",
  "[x](data:text/html,<script>1</script>)",
  "![x](javascript:alert(1))",
  "<https://example.com>",
  "# h1",
  "| a | b |\n| - | - |\n| 1 | 2 |",
  "- item\n- item",
  "> quote",
  "`code`",
  "**bold** *italic*",
  "ふつうの文章。",
  "a & b < c > d",
]

const body = fc.array(fc.constantFrom(...DANGEROUS), { minLength: 1, maxLength: 8 })
  .map((parts) => parts.join("\n\n"))

/** Everything the renderer is allowed to emit — the markdown vocabulary. */
const ALLOWED = new Set([
  "a", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "img", "input", "li", "ol", "p", "pre", "strong", "sup", "section", "table",
  "tbody", "td", "th", "thead", "tr", "ul",
])

/**
 * What a blockquote turns into — the note's box and the glyph in it. These are
 * the only elements the renderer emits that markdown has no syntax for, so they
 * are allowed **only when the source has a blockquote in it**: `<div>` and
 * `<svg>` are two of the things an author might write, and a set that always
 * contained them would stop noticing if one got through.
 */
const NOTE_TAGS = ["div", "span", "svg", "circle", "path"]

const TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)/g

describe("サイトコンテンツの markdown の不変量", () => {
  it("markdown で書けない要素は出力に現れない", () => {
    fc.assert(fc.property(body, (source) => {
      const allowed = new Set(ALLOWED)
      if (/^>/m.test(source)) for (const tag of NOTE_TAGS) allowed.add(tag)
      for (const match of renderMarkdown(source).matchAll(TAG)) {
        expect(allowed).toContain(match[1])
      }
    }))
  })

  it("引用は注記として出る", () => {
    const html = renderMarkdown("> 但し書き。")
    expect(html).toContain("但し書き。")
    expect(html).toContain("<svg")
    expect(html).not.toContain("blockquote")
    // The words are not wrapped in a paragraph of their own: the note's padding
    // is the only space around a one-paragraph aside.
    expect(html).not.toContain("<p>")
  })

  it("リンクと画像の行き先は許した scheme かサイト内の絶対パスしか残らない", () => {
    const destination = /(?:href|src)="([^"]*)"/g
    fc.assert(fc.property(body, (source) => {
      for (const match of renderMarkdown(source).matchAll(destination)) {
        const value = match[1] ?? ""
        const allowed = /^(?:https?:\/\/|mailto:)/i.test(value)
          || (value.startsWith("/") && !value.startsWith("//"))
        expect(allowed).toBe(true)
      }
    }))
  })

  it("出力にイベントハンドラ属性が現れない", () => {
    fc.assert(fc.property(body, (source) => {
      expect(/<[a-z]+[^>]*\son[a-z]+=/i.test(renderMarkdown(source))).toBe(false)
    }))
  })
})
