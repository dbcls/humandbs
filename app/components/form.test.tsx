import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { Icon } from "~/components/icons"

import { Field, MarkdownEditor, Select, Submit, TextArea } from "./form"

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
