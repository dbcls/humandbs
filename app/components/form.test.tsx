import fc from "fast-check"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { Icon } from "~/components/icons"

import { Answer, Field, landingPath, MarkdownEditor, SaveNews, Select, Submit, TextArea } from "./form"

/** Rendered under a router, since a panel off a control watches the address to close. */
function render(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin"]} />)
}

describe("a select", () => {
  const options = [
    { value: "text", label: "自由文" },
    { value: "vocabulary", label: "語彙" },
    { value: "number", label: "数値" },
  ]

  it("is drawn by the site, and carries the choice in force in a hidden field", () => {
    const html = render(<Select label="型" name="kind" value="vocabulary" options={options} />)

    expect(html).not.toContain("<select")
    expect(html).toContain("type=\"hidden\" name=\"kind\" value=\"vocabulary\"")
    expect(html.match(/role="option"/g)).toHaveLength(3)
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
  })

  it("names the choice in force on the closed box, ahead of the list", () => {
    const html = render(<Select label="型" name="kind" value="vocabulary" options={options} />)

    expect(html.indexOf("語彙")).toBeLessThan(html.indexOf("role=\"listbox\""))
    expect(html).toContain("aria-haspopup=\"listbox\"")
  })

  it("falls back to the first choice when none is in force", () => {
    const html = render(<Select label="型" name="kind" options={options} />)

    expect(html).toContain("type=\"hidden\" name=\"kind\" value=\"text\"")
  })

  it("sends nothing of its own when the screen holds the value", () => {
    const html = render(<Select label="単位" value="GB" options={[{ value: "GB", label: "GB" }, { value: "TB", label: "TB" }]} onChange={() => undefined} />)

    expect(html).not.toContain("type=\"hidden\"")
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
  })

  it("keeps its name when the label is hidden", () => {
    const html = render(<Select label="単位" name="unit" value="GB" options={[{ value: "GB", label: "GB" }]} hideLabel />)

    expect(html).toContain("sr-only\">単位<")
    expect(html).toContain("aria-label=\"単位\"")
  })
})

describe("a box that has to be filled", () => {
  it("wears the mark hard against its name, with the word for anyone not looking", () => {
    const html = render(<TextArea label="日本語" name="ja" required="必須" />)
    expect(html).toMatch(/日本語<span aria-hidden="true"[^>]*>\*<\/span><span class="sr-only">必須<\/span>/)
  })

  it("keeps the mark out of the badge that names its dialect", () => {
    const html = render(<TextArea label="日本語" name="ja" required="必須" accepts="markdown" />)
    expect(html.indexOf("*")).toBeLessThan(html.indexOf("markdown"))
    expect(html).not.toMatch(/必須<\/span><\/span><span[^>]*>markdown/)
  })

  it("wears nothing while it need not be filled", () => {
    expect(render(<TextArea label="日本語" name="ja" />)).not.toContain("*")
    expect(render(<Field label="slug" name="slug" />)).not.toContain("必須")
  })

  it("keeps the word when the name is hidden", () => {
    const html = render(<Field label="slug" name="slug" required="必須" hideLabel />)
    expect(html).toContain("必須")
  })
})

describe("a submit that cannot be pressed", () => {
  it("says why over itself when handed a sentence", () => {
    const html = render(<Submit disabled="日本語と英語の両方が揃うまで表示できません。">表示</Submit>)
    expect(html).toMatch(/<button[^>]*\bdisabled=""/)
    expect(html).toContain("role=\"tooltip\"")
    expect(html).toContain("日本語と英語の両方が揃うまで表示できません。")
  })

  it("is merely off when handed no sentence", () => {
    const html = render(<Submit disabled>表示</Submit>)
    expect(html).toMatch(/<button[^>]*\bdisabled=""/)
    expect(html).not.toContain("tooltip")
  })
})

/**
 * A submit waits in place once pressed (`docs/ui.md` の「壊れるもの」): until
 * then it is an ordinary button, with its own icon and nothing said beside it.
 */
describe("a submit that has not been pressed", () => {
  it("keeps its icon, can be pressed, and has no spinner and nothing read out", () => {
    const html = render(<Submit icon={<Icon name="save" />}>保存</Submit>)
    expect(html).toMatch(/<button[^>]*type="submit"/)
    expect(html).not.toMatch(/<button[^>]*\bdisabled=""/)
    expect(html).not.toContain("aria-busy")
    expect(html).not.toContain("animate-spin")
    expect(html).not.toContain("role=\"status\"")
    expect(html.match(/<svg/g)).toHaveLength(1)
  })
})

describe("a body's box", () => {
  const html = render(<MarkdownEditor label="本文" name="body" value="一行目" />)

  it("stops at thirty lines and keeps a floor, rather than taking the room left", () => {
    const [, seat] = /<\/textarea><div class="([^"]*)"/.exec(html) ?? []
    expect(seat).toBeDefined()
    expect(seat).toContain("max-h-[calc(30*1.3125rem+0.75rem+2px)]")
    expect(seat).toContain("min-h-96")
    expect(seat).not.toContain("flex-1")
  })

  it("is thirty rows where there is no script to stand the editor over it", () => {
    expect(html).toMatch(/<textarea[^>]*rows="30"/)
  })
})

describe("a box the caret was brought to", () => {
  it("wears the warning ground only while marked landed, and keeps the one ring colour", () => {
    const html = render(<TextArea label="研究題目" name="title" value="" />)
    expect(html).toContain("data-landed:bg-warning-surface")
    expect(html).not.toMatch(/data-landed:outline-/)
  })
})

describe("the news beside a save", () => {
  const WORDS = ["保存中", "未保存の変更があります", "保存しました"] as const
  const shown = (html: string): string =>
    /<span class="col-start-1 row-start-1[^"]*">([^<]*)<\/span>/.exec(html)?.[1] ?? "missing"

  it("holds the room of every word it can say, out of sight and out of the reading order, while saying nothing", () => {
    const html = renderToStaticMarkup(<SaveNews words={WORDS} said={null} />)
    for (const word of WORDS) {
      expect(html).toContain(`<span aria-hidden="true" class="invisible col-start-1 row-start-1">${word}</span>`)
    }
    expect(shown(html)).toBe("")
  })

  it("draws the word being said in the same cell, so what stands beside it keeps its place", () => {
    const html = renderToStaticMarkup(<SaveNews words={WORDS} said={{ word: "未保存の変更があります", tone: "accent" }} />)
    expect(html).toMatch(/^<span role="status" class="inline-grid">/)
    expect(shown(html)).toBe("未保存の変更があります")
    expect(html).toContain("row-start-1 text-accent")
  })

  it("says a quiet word in the muted ink", () => {
    const html = renderToStaticMarkup(<SaveNews words={WORDS} said={{ word: "保存しました", tone: "muted" }} />)
    expect(shown(html)).toBe("保存しました")
    expect(html).toContain("row-start-1 text-ink-muted")
  })
})

describe("landingPath", () => {
  const segment = fc.stringMatching(/^[a-z0-9-]{1,8}$/)
  const path = fc.array(segment, { minLength: 1, maxLength: 5 }).map((parts) => parts.join("."))

  it("takes the place itself when the form marks it", () => {
    fc.assert(fc.property(path, (at) => {
      expect(landingPath(at, () => true)).toBe(at)
    }))
  })

  it("takes the nearest marked place the path runs through, and never one it does not", () => {
    fc.assert(fc.property(path, fc.array(path, { maxLength: 6 }), (at, marks) => {
      const marked = new Set(marks)
      const found = landingPath(at, (candidate) => marked.has(candidate))
      const through = at.split(".").map((_, index, parts) => parts.slice(0, index + 1).join("."))
      const expected = [...through].reverse().find((candidate) => marked.has(candidate)) ?? null
      expect(found).toBe(expected)
    }))
  })

  it("lands a cell of a list's table on the element's row", () => {
    const marked = new Set(["grants.g1", "title"])
    expect(landingPath("grants.g1.title", (candidate) => marked.has(candidate))).toBe("grants.g1")
    expect(landingPath("grants.g2.title", (candidate) => marked.has(candidate))).toBeNull()
    expect(landingPath("title", (candidate) => marked.has(candidate))).toBe("title")
  })
})

describe("the answer to what was sent (Answer)", () => {
  type Sent = { status: "ok", did: string } | { status: "taken" } | { status: "gone" }
  const said = (answer: Sent) => answer.status === "ok" ? `${answer.did}しました。` : answer.status === "taken" ? "使われています。" : null

  it("says what went through in one box that says it is done", () => {
    const html = render(<Answer<Sent> answer={{ status: "ok", did: "key を作成" }} locale="ja" said={said} />)
    expect(html).toContain("key を作成しました。")
    expect(html).toContain("border-line-strong")
    expect(html).not.toContain("border-danger")
  })

  it("says a refusal as a failure", () => {
    const html = render(<Answer<Sent> answer={{ status: "taken" }} locale="ja" said={said} />)
    expect(html).toContain("使われています。")
    expect(html).toContain("border-danger")
  })

  it("raises nothing for an answer the screen does not speak to, nor for none", () => {
    const quiet = render(<Answer<Sent> answer={{ status: "gone" }} locale="ja" said={said} />)
    const none = render(<Answer<Sent> answer={undefined} locale="ja" said={said} />)
    expect(quiet).toBe(none)
    expect(quiet).not.toContain("role=\"status\"><div")
  })

  it("lets the screen say which answers went through", () => {
    const html = render(<Answer answer={{ status: "issued" }} locale="ja" said={() => "NHA000001 を発行しました。"} ok={(answer) => answer.status === "issued"} />)
    expect(html).not.toContain("border-danger")
  })
})
