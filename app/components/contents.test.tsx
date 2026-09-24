import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { LocaleEditor } from "~/admin/contents.server"

import {
  ArticleTools,
  articleFormId,
  leftLanguageOf,
  LocaleEditors,
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
 * A language's form holds everything done to that language: the body, the
 * publish state, and — at its foot, right of the publish control — its own
 * save, which Ctrl+S finds by the form's id (`ArticleTools`).
 */
describe("the languages' forms", () => {
  it("carry their own save at the foot, right of the publish control, findable by the form's id", () => {
    const formId = articleFormId("document:x", "ja")
    const html = render(
      <LocaleEditors editors={[editor("ja", { published: true })]} locale="ja" remember="document:x" />,
    )

    expect(html).toContain(`id="${formId}"`)
    const form = html.slice(html.indexOf("<form"), html.indexOf("</form>"))
    const publishAt = form.indexOf("value=\"unpublish\"")
    const saveAt = form.indexOf("value=\"save\"")
    expect(publishAt).toBeGreaterThan(-1)
    expect(saveAt).toBeGreaterThan(publishAt)
    expect(form).toContain(`id="${formId}-save"`)
    expect(form).not.toContain("下書き")
    expect(html).toContain("公開中")
  })

  it("の保存は、打つまで押せず、打つと accent を着る — form の外に立つものではないので form 自身の答えを読む", () => {
    const html = render(<LocaleEditors editors={[editor("ja")]} locale="ja" remember="document:x" />)
    const form = html.slice(html.indexOf("<form"), html.indexOf("</form>"))
    const save = form.slice(form.indexOf("value=\"save\"") - 400, form.indexOf("value=\"save\""))
    // Nothing typed at first draw: the save waits, without the accent.
    expect(save).toMatch(/disabled=""/)
    expect(save).not.toMatch(/bg-accent/)
    // The words are laid out of sight to hold their room; none is being said.
    expect(form).not.toMatch(/<span class="col-start-1 row-start-1[^"]*">未保存の変更があります/)
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
    expect(title).toContain("<span aria-hidden=\"true\" class=\"ml-1 text-danger\">*</span>")
    expect(title).toContain("<span class=\"sr-only\">必須</span>")
    // Said once, for the title only: the body's own label carries none of it.
    expect(html.match(/必須/g)).toHaveLength(1)
    expect(html).not.toMatch(/<input[^>]*\brequired\b/)
  })
})

/** `articleFormId` is what both a language's form and Ctrl+S's lookup of its save are built from, so the two cannot disagree. */
describe("articleFormId", () => {
  it("記事とお知らせで別の根を持ち、言語ごとに別の id になる", () => {
    expect(articleFormId("document:x", "ja")).not.toBe(articleFormId("document:x", "en"))
    expect(articleFormId("document:x", "ja")).not.toBe(articleFormId("news:x", "ja"))
  })
})

/**
 * Which form Ctrl+S sends is read off the arrangement, not tracked a second
 * time — this is the table `usePanes`'s `left`/`showing` feeds it through.
 */
describe("leftLanguageOf", () => {
  it("既定 (左が編集 ja、右が公開ページ ja) では Ctrl+S は ja を送る", () => {
    expect(leftLanguageOf({ left: "form-ja", showing: "both" })).toBe("ja")
  })

  it("編集の言語が右だけにあるとき、左の Ctrl+S は宛先を持たない", () => {
    expect(leftLanguageOf({ left: "page", showing: "both" })).toBeNull()
  })

  it("左のペインが隠れているときは、編集の言語であっても送らない", () => {
    expect(leftLanguageOf({ left: "form-ja", showing: "left" })).toBe("ja")
    expect(leftLanguageOf({ left: "form-ja", showing: "right" })).toBeNull()
  })

  it("どちらのペインも公開ページなら、送る form は無い", () => {
    expect(leftLanguageOf({ left: "page", showing: "both" })).toBeNull()
  })
})

/**
 * The tools row itself holds the pane switch and nothing that saves — each
 * language's save stands at the foot of its own form.
 */
describe("ArticleTools", () => {
  it("切替だけを持ち、保存は 1 つも立てない", () => {
    const html = render(<ArticleTools panesControl={<span>SWITCH</span>} leftFormId={null} />)
    expect(html).toContain("SWITCH")
    expect(html).not.toContain("value=\"save\"")
    expect(html).not.toContain("保存")
  })
})

describe("an announcement's date, seen from its languages' forms", () => {
  const undated = { dated: false, ahead: false }
  const ahead = { dated: true, ahead: true }
  const arrived = { dated: true, ahead: false }

  it("keeps publishing shut while the item is undated, and says why", () => {
    const html = render(
      <LocaleEditors editors={[editor("ja")]} locale="ja" remember="news:x" publishing={undated} />,
    )
    // The whole tag: the attributes come in the order React writes them, and
    // `disabled` stands after the intent rather than before it.
    const at = html.indexOf("value=\"publish\"")
    const publish = html.slice(html.lastIndexOf("<button", at), html.indexOf(">", at) + 1)
    expect(publish).toMatch(/disabled=""/)
    expect(html).toContain("公開日時が未入力のため公開できません")
  })

  it("offers to schedule rather than publish while the date is ahead", () => {
    const html = render(
      <LocaleEditors editors={[editor("ja")]} locale="ja" remember="news:x" publishing={ahead} />,
    )
    expect(html).toMatch(/公開予定<\/button>/)
    expect(html).not.toMatch(/>公開<\/button>/)
    expect(html).not.toContain("公開日時が未入力")
  })

  it("offers to publish once the date has come", () => {
    const html = render(
      <LocaleEditors editors={[editor("ja")]} locale="ja" remember="news:x" publishing={arrived} />,
    )
    expect(html).toMatch(/公開<\/button>/)
    expect(html).not.toContain("公開予定")
  })

  it("names a published language waiting on its date 公開予定, with the way to take it down", () => {
    const html = render(
      <LocaleEditors editors={[editor("ja", { published: true })]} locale="ja" remember="news:x" publishing={ahead} />,
    )
    expect(html).toContain("公開予定")
    expect(html).not.toContain("公開中")
    expect(html).toContain("value=\"unpublish\"")
  })

  it("draws an article, which has no date, as before", () => {
    const html = render(<LocaleEditors editors={[editor("ja")]} locale="ja" remember="document:x" />)
    expect(html).toMatch(/公開<\/button>/)
    expect(html).not.toContain("公開予定")
    expect(html).not.toContain("公開日時が未入力")
  })
})

describe("StateCell, for an announcement", () => {
  it("says 公開予定 for a published language whose date is ahead, and nothing new otherwise", () => {
    expect(render(<StateCell state={{ published: true }} locale="ja" ahead />)).toContain("公開予定")
    expect(render(<StateCell state={{ published: true }} locale="ja" />)).toContain("公開中")
    expect(render(<StateCell state={{ published: false }} locale="ja" ahead />)).toContain("未公開")
  })
})
