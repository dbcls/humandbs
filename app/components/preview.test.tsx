import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { CommentView } from "~/review/comments"
import type { PreviewShell } from "~/review/preview.server"

import type { CommentContext } from "./comments"
import { PreviewActionNotice, FieldAnnotations, PreviewHead } from "./preview"

function render(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/preview/token"]} />)
}

const CONTEXT: CommentContext = {
  locale: "ja",
  action: "/preview/token",
  subject: { kind: "research" },
  canResolve: false,
  signedInName: null,
}

/** Nothing has changed against the published version, so `PreviousIndicator` stays silent. */
const VIEW = { changed: [], previous: {}, current: {} }

describe("the indicators a preview draws beside a value", () => {
  it("opens the same comment panel a field-review button opens, named plainly with no field name to give", () => {
    const html = render(
      <FieldAnnotations context={CONTEXT} at="summary.aims" view={VIEW} comments={[]} heading="" />,
    )
    expect(html).toContain("title=\"コメント\"")
  })

  it("names the panel after the field once the caller has one to give", () => {
    const html = render(
      <FieldAnnotations
        context={CONTEXT}
        at="summary.aims"
        view={VIEW}
        comments={[]}
        heading=""
        fieldLabel="研究の目的"
      />,
    )
    expect(html).toContain("title=\"研究の目的 へのコメント\"")
  })
})

describe("the indicator showing that the published version reads otherwise", () => {
  const CHANGED = {
    changed: ["summary.aims"],
    previous: { "summary.aims": { kind: "field" as const, field: { state: "plain" as const, text: "旧い目的", untranslated: false } } },
    current: { "summary.aims": { kind: "field" as const, field: { state: "plain" as const, text: "新しい目的", untranslated: false } } },
  }

  it("is worded as a state, and is shown after the comment button", () => {
    const html = render(<FieldAnnotations context={CONTEXT} at="summary.aims" view={CHANGED} comments={[]} heading="公開中の v8" />)
    expect(html).toContain("変更あり")
    expect(html).not.toContain("公開バージョンと違う")
    expect(html.indexOf("変更あり")).toBeGreaterThan(html.indexOf("title=\"コメント\""))
  })

  /*
    What changed is what a provider reviewing an update reads first, so it is
    the large badge the request for a value is, in the accent — not the small
    comment button beside it.
  */
  it("is a large accent badge that is a button, and opens the comparison in a panel over the page", () => {
    const html = render(<FieldAnnotations context={CONTEXT} at="summary.aims" view={CHANGED} comments={[]} heading="公開中の v8" />)
    expect(html).not.toContain("<details")
    const classes = [...html.matchAll(/<button[^>]*class="([^"]*)"/g)].map((match) => match[1] ?? "")
    expect(classes).toHaveLength(2)
    expect(classes[1]).not.toBe(classes[0])
    expect(classes[1]).toMatch(/\bborder-dashed\b.*\btext-sm\b.*\bborder-accent text-accent bg-accent-surface\b/)
    expect(html).toMatch(/<button[^>]*>[\s\S]*?変更あり[\s\S]*?<\/button>/)
    // The two are shown on one line, centred against each other rather than hung from the top.
    expect(html).toMatch(/^<span class="[^"]*\bitems-center\b/)
    expect(html).toContain("<dialog")
    // Nothing is inside a panel until it opens (`Dialog`), so the old value is not on the page yet.
    expect(html).not.toContain("旧い目的")
  })

  it("is shown alone, pressing nothing, where there is no old value to show", () => {
    const html = render(
      <FieldAnnotations context={CONTEXT} at="summary.aims" view={{ changed: ["summary.aims"], previous: {}, current: {} }} comments={[]} heading="" />,
    )
    const badge = html.indexOf("変更あり")
    expect(badge).toBeGreaterThan(-1)
    const before = html.slice(0, badge)
    expect(before.lastIndexOf("</button>")).toBeGreaterThan(before.lastIndexOf("<button"))
  })

  it("shows nothing where the place has not changed", () => {
    const html = render(<FieldAnnotations context={CONTEXT} at="summary.aims" view={VIEW} comments={[]} heading="" />)
    expect(html).not.toContain("変更あり")
  })
})

describe("the header of a preview", () => {
  const WHOLE: CommentView = {
    id: "c-1",
    anchor: { kind: "draft" },
    authorName: "提供者 A",
    bySignedIn: false,
    body: "全体についての長い問い",
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  }

  function shell(over: Partial<PreviewShell> = {}): PreviewShell {
    return {
      locale: "ja",
      token: "token",
      humLabel: "hum0001",
      signedInName: null,
      // One on the whole and one on a field: only the first is the whole's.
      comments: [WHOLE, { ...WHOLE, id: "c-2", anchor: { kind: "research-field", path: "title" }, body: "題目への問い" }],
      acknowledgements: [
        { kind: "commented", name: "押した人 B", bySignedIn: false, createdAt: "2026-01-02T00:00:00.000Z", count: 1 },
        { kind: "approved", name: "押した人 C", bySignedIn: true, createdAt: "2026-01-03T00:00:00.000Z", count: 1 },
      ],
      publishedNumber: 3,
      ...over,
    }
  }

  /** `null` for a page with no whole to comment on (a dataset's). */
  function head(over: Partial<PreviewShell> = {}, whole: CommentContext | null = { ...CONTEXT, subject: "draft" }): string {
    return render(
      <PreviewHead shell={shell(over)} label="hum0001" locale="ja" problem={null} whole={whole ?? undefined}>
        <p>ページの本文</p>
      </PreviewHead>,
    )
  }

  it("shows what is asked in a card of its own, before the page's header bar", () => {
    const html = head()
    const notice = html.indexOf("公開前のご確認をお願いいたします")
    const headerBar = html.indexOf("公開前の確認")
    const body = html.indexOf("ページの本文")
    expect(notice).toBeGreaterThan(-1)
    expect(headerBar).toBeGreaterThan(notice)
    expect(body).toBeGreaterThan(headerBar)
    // The notice's box closes before the header bar opens: the header bar is not inside it.
    expect(html.slice(notice, headerBar)).toMatch(/<\/div>\s*<div>\s*<header|<\/div><div>/)
  })

  it("does not list who pressed either indicator", () => {
    const html = head()
    expect(html).not.toContain("押した人 B")
    expect(html).not.toContain("押した人 C")
    expect(html).not.toContain("コメントを書き終えた人")
    expect(html).not.toContain("直すところが無いと答えた人")
  })

  it("does not count the places that differ or list the places with comments", () => {
    const html = head()
    expect(html).not.toContain("か所違います")
    expect(html).not.toContain("コメントの付いている場所")
  })

  it("opens the comments on the whole in a panel rather than laying the thread out on the page", () => {
    const html = head()
    expect(html).toMatch(/<button[^>]*>[\s\S]*?全体へのコメント[\s\S]*?<\/button>/)
    expect(html).not.toContain("全体についての長い問い")
  })

  it("counts on the whole's entry only what was said to the whole", () => {
    const entry = /<button[^>]*>[\s\S]*?全体へのコメント([\s\S]*?)<\/button>/.exec(head())?.[1] ?? ""
    expect(entry).toContain(">1<")
    expect(entry).not.toContain(">2<")
  })

  it("sends both indicators from one form, the pressed button naming which, with the typed name joining it", () => {
    const html = head()
    expect(html.match(/<form[^>]*id="preview-decide"/g)).toHaveLength(1)
    const kindButtons = [...html.matchAll(/<button[^>]*>/g)].map((match) => match[0])
      .filter((tag) => tag.includes("name=\"kind\""))
    expect(kindButtons.map((tag) => /value="(\w+)"/.exec(tag)?.[1])).toEqual(["commented", "approved"])
    expect(kindButtons.every((tag) => tag.includes("type=\"submit\""))).toBe(true)
    expect(html).toMatch(/<input[^>]*name="name"[^>]*form="preview-decide"|<input[^>]*form="preview-decide"[^>]*name="name"/)
  })

  it("draws the whole's entry at the size of the two indicators it shares a row with", () => {
    const sizeOf = (tag: string) => (/class="([^"]*)"/.exec(tag)?.[1] ?? "").split(" ")
      .filter((one) => /^(?:px|py|gap|text-(?:xs|sm|base|lg))/.test(one))
      .sort()
    const buttons = [...head().matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map((match) => match[0])
    const whole = buttons.find((one) => one.includes("全体へのコメント")) ?? ""
    const kindButtons = buttons.filter((one) => one.includes("name=\"kind\""))
    expect(kindButtons).toHaveLength(2)
    for (const button of kindButtons) expect(sizeOf(whole)).toEqual(sizeOf(button))
  })

  it("requests no name from a reader who is signed in", () => {
    const html = head({ signedInName: "山田" })
    expect(html).not.toMatch(/<input[^>]*name="name"/)
    expect(html).toContain("山田")
  })

  const stepsOf = (html: string): string[] =>
    [...html.slice(html.indexOf("<ol"), html.indexOf("</ol>")).matchAll(/<li>(.*?)<\/li>/g)].map((match) => match[1] ?? "")

  it("requests a name or a sign-in first, and offers both beside each other", () => {
    const html = head()
    const steps = stepsOf(html)
    expect(steps[0]).toContain("お名前を入力するか、DDBJ アカウントでログイン")
    const name = html.search(/<input[^>]*name="name"/)
    const login = html.indexOf("href=\"/auth/login?redirect=%2Fpreview%2Ftoken\"")
    expect(name).toBeGreaterThan(-1)
    expect(login).toBeGreaterThan(name)
    expect(html.slice(name, login)).toContain("または")
  })

  it("shows which name the comments are posted under once signed in, and asks for neither", () => {
    const html = head({ signedInName: "山田花子" })
    expect(stepsOf(html)[0]).toMatch(/DDBJ アカウント <span[^>]*bg-surface[^>]*><code[^>]*>山田花子<\/code><\/span> でログインしています/)
    // The line under the steps shows the same name at the steps' size, not the hint's.
    expect(html).toMatch(/<p class="text-sm"><span class="text-ink-muted">お名前: <\/span><span[^>]*bg-surface[^>]*><code[^>]*>山田花子<\/code>/)
    expect(html).not.toContain("/auth/login")
    expect(html).not.toMatch(/<input[^>]*name="name"/)
  })

  it("explains the changed badge only on a draft that updates a published version", () => {
    expect(head({ publishedNumber: 3 })).toContain("「変更あり」と表示された項目は")
    expect(head({ publishedNumber: null })).not.toContain("「変更あり」と表示された項目は")
  })

  it("names each button in its own step, commenting before the final confirmation, by the button's own word", () => {
    const html = head()
    const steps = stepsOf(html)
    const at = ["commented", "approved"].map((value) => {
      const word = new RegExp(`value="${value}"[^>]*>(?:<[^>]+>)*([^<]+)<`).exec(html)?.[1]
      expect(word).toBeDefined()
      const found = steps.findIndex((step) => step.includes(`「${word}」`))
      expect(found).toBeGreaterThan(-1)
      // One button to a step: a step naming both reads as pressing both.
      expect(steps.filter((step) => step.includes(`「${word}」`))).toHaveLength(1)
      return found
    })
    expect(at[0]).toBeLessThan(at[1] ?? -1)
    expect(at[1]).toBe(steps.length - 1)
    expect(steps.at(-1)).toContain("最終確認")
  })

  it("sends the reader to each dataset's page as a step of its own, before the buttons", () => {
    const steps = stepsOf(head())
    const datasets = steps.findIndex((step) => step.includes("データセットごとのページ"))
    const commented = steps.findIndex((step) => step.includes("コメントを書き終えたら"))
    expect(datasets).toBeGreaterThan(-1)
    expect(datasets).toBeLessThan(commented)
  })

  it("is polite in every step: each closes as a request or a polite statement", () => {
    for (const step of stepsOf(head())) {
      expect(step).toMatch(/(ください|ます|いたします)。$/)
    }
  })

  it("has only the notice and the name on a page with no whole to comment on", () => {
    const html = head({}, null)
    expect(html).toContain("公開前のご確認をお願いいたします")
    expect(html).toContain("このページはまだ公開されていません")
    expect(html).not.toContain("ご確認の手順")
    expect(html).not.toContain("preview-decide")
    expect(html).not.toMatch(/<input[^>]*name="name"/)
  })
})

describe("the answer to an indicator", () => {
  it("shows that the indicator's press reached the office, naming the indicator by its first sentence", () => {
    expect(render(<PreviewActionNotice answer={{ status: "acknowledged", kind: "commented" }} locale="ja" />))
      .toContain("「コメントを書き終えました」を事務局にお送りしました。")
    expect(render(<PreviewActionNotice answer={{ status: "acknowledged", kind: "approved" }} locale="ja" />))
      .toContain("「修正の必要はありません」を事務局にお送りしました。")
  })

  it("uses the page's language, down to the names read aloud", () => {
    const html = render(<PreviewActionNotice answer={{ status: "acknowledged", kind: "approved" }} locale="en" />)
    expect(html).toContain("&quot;No corrections are needed&quot; has been sent to the office.")
    expect(html).toContain("aria-label=\"Result\"")
    expect(html).toContain("aria-label=\"Close\"")
    expect(html).not.toContain("操作の結果")
  })

  it("shows nothing before an indicator is pressed, or when the name was missing", () => {
    for (const answer of [undefined, { status: "invalid", problem: "name-required" } as const]) {
      const html = render(<PreviewActionNotice answer={answer} locale="ja" />)
      expect(html).not.toContain("お送りしました")
    }
  })
})
