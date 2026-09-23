import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { LocaleEditor } from "~/admin/contents.server"

import {
  ArticleTools,
  articleFormId,
  leftLanguageOf,
  LocaleEditors,
  openLanguagesOf,
  ResultLine,
  SlugEditor,
  StateCell,
} from "./contents"

function render(element: React.ReactElement): string {
  const Stub = createRoutesStub([{ path: "/", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />)
}

/**
 * The state of one language down a listing is the part every row's state is
 * drawn with, so it stands in the same one-line box (`base.tsx` の `Stated`)
 * — a copy of the pair left on the baseline stretched the row and moved every
 * cell in it up.
 */
describe("StateCell", () => {
  it("is drawn with Stated, in a box of one line's height aligned to its top", () => {
    const html = render(<StateCell state={{ published: true }} locale="ja" />)
    expect(html).toContain("公開中")
    const box = (/<span class="([^"]*)"><svg/.exec(html)?.[1] ?? "").split(/\s+/)
    expect(box).toContain("h-[1lh]")
    expect(box).toContain("align-top")
    // Nothing wraps it: one inline-flex box, the part's own.
    expect(html.match(/inline-flex/g)).toHaveLength(1)
  })
})

/**
 * The one thing the shared panel has to hold whichever screen draws it: **the
 * box is in the panel, not on the page.** A screen that showed the box beside
 * the way in would be back to the two forms the panel was made to close.
 */
describe("SlugEditor", () => {
  const drawn = render(
    <SlugEditor locale="ja" intent="rename" name="slug" value="committee-1" hint="規則" />,
  )

  it("入口は警告の面を着た 1 つのボタンで、slug の編集を名乗る", () => {
    expect(drawn.match(/<button/g)?.length).toBe(1)
    expect(drawn).toContain("slug の編集")
    expect(drawn).toMatch(/<button[^>]*class="[^"]*danger/)
  })

  it("開く前は、欄も今の値も警告もページに無い", () => {
    expect(drawn).not.toContain("<input")
    expect(drawn).not.toContain("committee-1")
    expect(drawn).not.toContain("規則")
    expect(drawn).not.toContain("これまでのアドレス")
  })
})

function editor(locale: "ja" | "en", over: Partial<LocaleEditor> = {}): LocaleEditor {
  return {
    locale,
    published: false,
    publishedAt: null,
    title: "題",
    body: "一行目\n\n<b>三行目</b>",
    html: "<p>一行目</p>",
    revision: 1,
    ...over,
  }
}

describe("the lines a save refused", () => {
  const refused = {
    status: "body" as const,
    problems: [
      { locale: "ja" as const, syntax: "html" as const, line: 3 },
      { locale: "ja" as const, syntax: "link" as const, line: 5 },
    ],
  }

  it("stand under the box of the language they are in, each with its line, what is wrong and the way there", () => {
    const html = render(
      <LocaleEditors editors={[editor("ja"), editor("en")]} locale="ja" remember="document:x" result={refused} />,
    )

    expect(html).toContain("3 行目: HTML のタグは書けません")
    expect(html).toContain("5 行目: このリンクの行き先は開けません")
    expect(html.match(/その行へ/g)).toHaveLength(2)
    // The box that was refused is the one marked, and only that one.
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(1)
    expect(html.indexOf("3 行目")).toBeLessThan(html.indexOf("英語"))
  })

  it("are the box's own error: it is described by the list and counts nothing above it", () => {
    const html = render(
      <LocaleEditors editors={[editor("ja")]} locale="ja" remember="document:x" result={refused} />,
    )

    const [, listId] = /<textarea[^>]*aria-describedby="([^"]+)"/.exec(html) ?? []
    expect(listId).toBeDefined()
    expect(html).toMatch(new RegExp(`<ul id="${listId ?? ""}"`))
    expect(html).not.toContain("か所あります")
    // The box is marked wrong before the list, which is under it.
    expect(html.indexOf("aria-invalid=\"true\"")).toBeLessThan(html.indexOf("3 行目"))
  })

  it("put the way there beside the line's words, and quote nothing of the line", () => {
    const html = render(
      <LocaleEditors editors={[editor("ja")]} locale="ja" remember="document:x" result={refused} />,
    )

    const list = html.slice(html.indexOf("<ul"), html.indexOf("</ul>"))
    const first = list.slice(list.indexOf("3 行目"), list.indexOf("5 行目"))
    expect(first).toContain("その行へ")
    // The body holds 三行目; the list does not repeat it.
    expect(list).not.toContain("三行目")
    expect(list).not.toContain("<code")
    // The way there is drawn as a control in a line: outlined, at the row size,
    // carrying the glyph for going to a place in the same document.
    expect(first).toMatch(/<button[^>]*class="[^"]*border-brand[^"]*"[^>]*><svg[^>]*>[\s\S]*?<\/svg>その行へ/)
    expect(first).not.toMatch(/<button[^>]*class="[^"]*border-transparent[^"]*"[^>]*>/)
  })

  it("mark nothing when the save went through", () => {
    const html = render(
      <LocaleEditors editors={[editor("ja"), editor("en")]} locale="ja" remember="document:x" result={{ status: "ok" }} />,
    )

    expect(html).not.toContain("行目: ")
    expect(html).not.toContain("その行へ")
    expect(html).not.toContain("aria-invalid")
  })

  it("are answered above in one sentence rather than line by line", () => {
    const html = render(<ResultLine result={refused} locale="ja" />)

    expect(html).toContain("本文に直すところがあるため、保存していません。")
    expect(html).not.toContain("3 行目")
  })
})

/**
 * A language's form is sent from outside itself now (`ArticleTools`), so what
 * is left inside it is what only that form can do: hold the body, and flip
 * the publish state.
 */
describe("the languages' forms", () => {
  it("carry no save of their own — it stands in the tools row, addressed by the form's own id", () => {
    const html = render(
      <LocaleEditors editors={[editor("ja", { published: true })]} locale="ja" remember="document:x" />,
    )

    expect(html).toContain(`id="${articleFormId("document:x", "ja")}"`)
    const form = html.slice(html.indexOf("<form"), html.indexOf("</form>"))
    expect(form).not.toContain("value=\"save\"")
    expect(form).not.toContain("下書き")
    expect(html).toContain("公開中")
  })

  it("keep publishing inside the form — it is pressed back and forth, not on the way out of the box", () => {
    const published = render(
      <LocaleEditors editors={[editor("ja", { published: true })]} locale="ja" remember="document:x" />,
    )
    expect(published).toContain("value=\"unpublish\"")

    const unpublished = render(
      <LocaleEditors editors={[editor("ja", { published: false })]} locale="ja" remember="document:x" />,
    )
    expect(unpublished).toContain("value=\"publish\"")
  })

  it("タイトルの欄だけ必須の印を持ち、HTML の required は置かない — 断るのは server", () => {
    const html = render(<LocaleEditors editors={[editor("ja")]} locale="ja" remember="document:x" />)

    const title = html.slice(html.indexOf("タイトル"), html.indexOf("</label>"))
    expect(title).toContain("<span aria-hidden=\"true\" class=\"text-danger\">*</span>")
    expect(title).toContain("<span class=\"sr-only\">必須</span>")
    // Said once, for the title only: the body's own label carries none of it.
    expect(html.match(/必須/g)).toHaveLength(1)
    expect(html).not.toMatch(/<input[^>]*\brequired\b/)
  })
})

/** `articleFormId` and `ArticleTools`'s `saves` array are built from the same function, so the two cannot disagree. */
describe("articleFormId", () => {
  it("記事とお知らせで別の根を持ち、言語ごとに別の id になる", () => {
    expect(articleFormId("document:x", "ja")).not.toBe(articleFormId("document:x", "en"))
    expect(articleFormId("document:x", "ja")).not.toBe(articleFormId("news:x", "ja"))
  })
})

/**
 * Which languages a save stands for is read off the arrangement, not tracked
 * a second time — this is the table `usePanes`'s `left`/`right`/`showing`
 * feeds it through.
 */
describe("openLanguagesOf / leftLanguageOf", () => {
  it("既定 (左が編集 ja、右が公開ページ ja) では ja の 1 つだけ開く", () => {
    const panes = { left: "form-ja", right: "page", showing: "both" as const }
    expect(openLanguagesOf(panes)).toStrictEqual(["ja"])
    expect(leftLanguageOf(panes)).toBe("ja")
  })

  it("両方のペインが編集のとき、両方の言語が開く", () => {
    const panes = { left: "form-ja", right: "form-en", showing: "both" as const }
    expect(openLanguagesOf(panes)).toStrictEqual(["ja", "en"])
    expect(leftLanguageOf(panes)).toBe("ja")
  })

  it("編集の言語が右だけにあるとき、開くのは en の 1 つだけで、左の Ctrl+S は宛先を持たない", () => {
    const panes = { left: "page", right: "form-en", showing: "both" as const }
    expect(openLanguagesOf(panes)).toStrictEqual(["en"])
    expect(leftLanguageOf(panes)).toBeNull()
  })

  it("隠れている側のペインは、編集の言語であっても数えない", () => {
    const onlyLeft = { left: "form-ja", right: "form-en", showing: "left" as const }
    expect(openLanguagesOf(onlyLeft)).toStrictEqual(["ja"])
    expect(leftLanguageOf(onlyLeft)).toBe("ja")

    const onlyRight = { left: "form-ja", right: "form-en", showing: "right" as const }
    expect(openLanguagesOf(onlyRight)).toStrictEqual(["en"])
    // The left pane holds an edit form but is not shown, so Ctrl+S sends nothing.
    expect(leftLanguageOf(onlyRight)).toBeNull()
  })

  it("どちらのペインも公開ページなら、開く言語は無い", () => {
    const panes = { left: "page", right: "page-en", showing: "both" as const }
    expect(openLanguagesOf(panes)).toStrictEqual([])
    expect(leftLanguageOf(panes)).toBeNull()
  })
})

/**
 * The tools row itself: one save per open language, each addressed to the
 * right form by the `form` attribute, and none at all when neither pane
 * holds one.
 */
describe("ArticleTools", () => {
  it("開いている言語ごとに保存を 1 つ立て、form 属性で正しい form を指す", () => {
    const html = render(
      <ArticleTools
        locale="ja"
        panesControl={null}
        leftFormId={articleFormId("document:x", "ja")}
        saves={[
          { language: "ja", formId: articleFormId("document:x", "ja"), dirty: true },
          { language: "en", formId: articleFormId("document:x", "en"), dirty: false },
        ]}
      />,
    )

    expect(html.match(/value="save"/g)).toHaveLength(2)
    expect(html).toContain(`form="${articleFormId("document:x", "ja")}"`)
    expect(html).toContain(`form="${articleFormId("document:x", "en")}"`)
    // Ctrl+S looks the left one up by this id.
    expect(html).toContain(`id="${articleFormId("document:x", "ja")}-save"`)
  })

  it("両方のペインが編集 (ja と en) のとき、保存は 2 つ立つ", () => {
    const panes = { left: "form-ja", right: "form-en", showing: "both" as const }
    const saves = openLanguagesOf(panes).map((language) => ({
      language, formId: articleFormId("document:x", language), dirty: false,
    }))
    const html = render(<ArticleTools locale="ja" panesControl={null} leftFormId={null} saves={saves} />)
    expect(html.match(/value="save"/g)).toHaveLength(2)
  })

  it("開いている編集の言語が無ければ、保存は 1 つも立たない", () => {
    const html = render(<ArticleTools locale="ja" panesControl={null} leftFormId={null} saves={[]} />)
    expect(html).not.toContain("value=\"save\"")
  })

  it("未保存 (dirty) だけが押せて accent を着る。保存済みは押せず色を持たない", () => {
    const html = render(
      <ArticleTools
        locale="ja"
        panesControl={null}
        leftFormId={null}
        saves={[{ language: "ja", formId: articleFormId("document:x", "ja"), dirty: true }]}
      />,
    )
    expect(html).toMatch(/<button[^>]*bg-accent[^>]*>/)
    expect(html).not.toMatch(/<button[^>]* disabled=""/)
    expect(html).toContain("未保存の変更があります")

    const saved = render(
      <ArticleTools
        locale="ja"
        panesControl={null}
        leftFormId={null}
        saves={[{ language: "ja", formId: articleFormId("document:x", "ja"), dirty: false }]}
      />,
    )
    expect(saved).not.toMatch(/bg-accent/)
    expect(saved).toMatch(/<button[^>]* disabled=""/)
    expect(saved).not.toContain("未保存の変更があります")
  })
})
