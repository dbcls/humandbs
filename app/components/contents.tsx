/**
 * The parts the site-content screens share: what a language is up to, and the
 * pair of forms that write one.
 *
 * **Editing and taking down are two forms, side by side rather than nested.**
 * A body that was typed but not sent travels with the form it was typed in, so
 * "take this down" cannot carry it — and publishing, which sits under the body,
 * takes exactly what is on screen.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react"

import type { LocaleState } from "~/admin/contents"
import type { BodyProblem, ContentsResult, LocaleEditor } from "~/admin/contents.server"
import { adminArticlePreviewPath } from "~/admin/urls"
import type { ArticleContent } from "~/content/types"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import type { ArticleView } from "~/public/site.server"

import { usePanes } from "./admin"
import { Badge, Button, type ButtonSize, Dialog, Heading, Stack, Stated } from "./base"
import { TOOLS_HEIGHT, useDrawn } from "./draft-tools"
import { Editing, Field, MarkdownEditor, Result, Submit, Unsaved } from "./form"
import { Icon, type IconName } from "./icons"
import { Markdown } from "./markdown"
import { Card, Section } from "./page"

/**
 * What the last form did.
 *
 * **A refused body is answered in one sentence here and line by line under
 * the box** (`BodyProblems`): the answer floats over the screen and goes, and
 * a line number read there is gone before the author has counted to it.
 */
export function ResultLine({ result, locale }: {
  result: ContentsResult | undefined
  locale: Locale
}) {
  if (result === undefined) return null
  const t = messagesFor(locale).admin.contents
  if (result.status === "ok") return <Result ok>{t.done}</Result>
  if (result.status === "body") return <Result ok={false}>{t.bodyRefused}</Result>
  return <Result ok={false}>{t.problems[result.status]}</Result>
}

/**
 * The width the control that changes the publish state is held at.
 *
 * **The word changes with the state and the width may not.** 「公開」 and
 * 「公開停止」 are 28px apart and 「表示する」 and 「非表示にする」 further than
 * that, so a control drawn to fit moves the save beside it every time it is
 * pressed — and this is the one row on the screen a reader presses twice in a
 * row to see what changed.
 */
export const SHOWING = "min-w-36"

/**
 * The glyph a publish state is drawn by: an eye for what readers can see, a
 * lock for what they cannot.
 *
 * **The same pair in the pane and down the table**, so that the shape a curator
 * narrows by is the shape they then read in the rows. It rides in front of the
 * word rather than standing alone: an eye or a lock is only obvious once you
 * know the question is who can see this.
 */
export function stateMark(published: boolean): IconName {
  return published ? "eye" : "lock"
}

/** The glyph on its own, for the pane's choice of state. */
export function StateIcon({ published }: { published: boolean }) {
  return <Icon name={stateMark(published)} aria-hidden="true" className="mr-1 text-ink-muted" />
}

/**
 * What one language of an article is up to, down a listing.
 *
 * **A glyph and a word, the way the research listing draws a status**
 * (`routes/admin-research-list.tsx`): the question is who can see this, and an
 * eye or a lock is only obvious once you know that is the question.
 *
 * **Only the draft is a badge, because only the draft is the exception.**
 * Nearly every article is out in both languages, and a row that says so in two
 * outlined boxes leaves a listing with nothing for the eye to catch — the rows
 * that need somebody look exactly like the rows that do not.
 *
 * **One language per cell.** A pair squeezed into one column has to name the
 * languages to tell them apart, and the names then repeat down every row of the
 * listing; as two columns the heading says it once.
 *
 * **It is the part every row's state is drawn with** (`base.tsx` の `Stated`),
 * not a copy of it: the part is what holds the pair in a box of one line's
 * height, and a copy left on the baseline moved every cell of the row 1.9px up.
 */
export function StateCell({ state, locale }: { state: LocaleState, locale: Locale }) {
  const t = messagesFor(locale).admin.contents
  return (
    <Stated icon={stateMark(state.published)}>
      {state.published ? t.published : t.unpublished}
    </Stated>
  )
}

/**
 * The way a slug is changed, on every screen that lets one be.
 *
 * **One panel, whatever holds the slug.** An article and a file in `common/`
 * are renamed from different screens, and a reader who learned the form on one
 * — the sentence saying what breaks under the name, the box with its rule
 * under it, the two buttons — finds the same on the other. A screen is not
 * handed the choice of leaving the box open on the page and asking in the
 * panel: the box on the page is a second place to type on a screen whose
 * subject is the body, and it says nothing about what pressing beside it does.
 *
 * **The way in wears the warning face** (`Confirm`): the address readers hold
 * stops answering, which is the break deleting it makes.
 *
 * **The panel does not name the slug in its title.** The box inside carries it,
 * and a title would disagree with the box the moment anything is typed
 * (`docs/ui.md` の「押せるもの」).
 */
export function SlugEditor({ locale, intent, name, value, hint, size, disabled }: {
  locale: Locale
  /** What the form is asked to do, on the button that sends it. */
  intent: string
  /** The field the new slug is sent as. */
  name: string
  value: string
  /** The rule the slug has to follow, under the box. */
  hint: string
  /** How large the way in is drawn among its neighbours (`Dialog`). */
  size?: ButtonSize
  /** Why the slug cannot be changed now, when it cannot (`Dialog`). */
  disabled?: string
}) {
  const t = messagesFor(locale).admin.contents
  return (
    <Dialog
      label={t.rename}
      title={t.renameTitle}
      note={t.renameWarning}
      variant="danger"
      size={size}
      disabled={disabled}
      icon={<Icon name="edit" />}
      dismiss={t.cancel}
      action={() => (
        <Submit variant="danger" icon={<Icon name="edit" />} intent={intent}>{t.renameConfirm}</Submit>
      )}
    >
      <Field label={t.slug} name={name} value={value} width="w-full" hint={hint} />
    </Dialog>
  )
}

/** What a language's form holds now, read off the form itself. */
function typedIn(form: HTMLFormElement): ArticleContent {
  const value = (name: string): string => {
    const element = form.elements.namedItem(name)
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.value
      : ""
  }
  return { title: value("title"), body: value("body") }
}

/**
 * Putting the caret on a line of the body, selected, and bringing it into view.
 *
 * **What a gutter would have let the author do by eye.** The box has no line
 * numbers to count by, so the number a save came back with is turned into the
 * line itself. The scroll is set from the line's height rather than measured:
 * a textarea scrolls its own text, and the line's top is its number times the
 * height every line takes.
 */
function goToLine(form: HTMLFormElement | null, line: number): void {
  const box = form?.elements.namedItem("body")
  if (!(box instanceof HTMLTextAreaElement)) return
  const lines = box.value.split("\n")
  const start = lines.slice(0, line - 1).reduce((sum, one) => sum + one.length + 1, 0)
  const end = start + (lines[line - 1]?.length ?? 0)
  box.focus()
  box.setSelectionRange(start, end)
  const lineHeight = Number.parseFloat(getComputedStyle(box).lineHeight) || 16
  box.scrollTop = Math.max(0, (line - 1) * lineHeight - box.clientHeight / 2)
}

/**
 * The lines a save refused, under the box they are in.
 *
 * **Each names its line, says what is wrong with it, and offers the way
 * there — and does not quote it.** The way puts the caret on the line in the
 * editor, which shows its numbers and colours the refused ones, so the line is
 * read where it can be mended; a quote under the box was the same line a
 * second time, cut short, in a place nothing can be done about it.
 *
 * **It is the box's own error** (`MarkdownEditor` の `refused`), which is why
 * it stands at the distance an error stands under its box, wears the mark an
 * error wears, and is not counted above — the list is the count.
 *
 * **The way there is a control in a line of text**, so it takes the row size
 * and the outlined face every such control takes (`docs/ui.md` の「押せるものの
 * 大きさ」).
 */
function BodyProblems({ id, problems, locale, goTo }: {
  id: string
  problems: BodyProblem[]
  locale: Locale
  goTo: (form: HTMLFormElement | null, line: number) => void
}) {
  const t = messagesFor(locale).admin.contents
  return (
    <ul id={id} className="flex flex-col gap-2 text-danger text-xs">
      {problems.map((problem) => (
        <li key={`${String(problem.line)}:${problem.syntax}`} className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1">
            <Icon name="alert" />
            {t.lineProblem(problem.line, t.syntaxes[problem.syntax])}
          </span>
          <Button
            type="button"
            size="row"
            icon={<Icon name="chevron-right" aria-hidden="true" />}
            onClick={(event) => { goTo(event.currentTarget.form, problem.line) }}
          >
            {t.goToLine}
          </Button>
        </li>
      ))}
    </ul>
  )
}

export function LocaleEditors({ editors, locale, remember, result, onTyped, onDirty }: {
  editors: LocaleEditor[]
  locale: Locale
  /**
   * What this screen's arrangement is filed under, and the root each
   * language's own form id is built from — the save standing in the tools
   * row above the panes sends it by that id (`useArticlePanes`).
   */
  remember: string
  /** What the last form did, for the language whose body it refused. */
  result?: ContentsResult
  /** Told what a language's form holds as it is typed, for the page drawn beside it. */
  onTyped?: (language: Locale, typed: ArticleContent) => void
  /** Told whenever a language's own "has this been typed into" answer changes. */
  onDirty?: (language: Locale, dirty: boolean) => void
}) {
  return (
    <>
      {editors.map((editor) => (
        <LanguageSection
          key={editor.locale}
          editor={editor}
          locale={locale}
          id={articleFormId(remember, editor.locale)}
          problems={result?.status === "body"
            ? result.problems.filter((one) => one.locale === editor.locale)
            : []}
          onTyped={onTyped}
          onDirty={onDirty}
        />
      ))}
    </>
  )
}

function LanguageSection({ editor, locale, id, problems, onTyped, onDirty }: {
  editor: LocaleEditor
  locale: Locale
  /** Sent by the save standing outside this form (`form` attribute). */
  id: string
  problems: BodyProblem[]
  onTyped?: (language: Locale, typed: ArticleContent) => void
  onDirty?: (language: Locale, dirty: boolean) => void
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.contents
  // The list of refused lines, named so the box can point at it.
  const problemsId = useId()
  // The editor's own way to a line, once it stands; the textarea's until then.
  const jump = useRef<((line: number) => void) | null>(null)
  const onReady = useCallback((goToLine: ((line: number) => void) | null) => {
    jump.current = goToLine
  }, [])
  const goTo = (form: HTMLFormElement | null, line: number) => {
    if (jump.current !== null) jump.current(line)
    else goToLine(form, line)
  }

  return (
    <Section title={t.languages[editor.locale]} fill>
      {/*
        The state and the publish date name the language section but are not
        part of its heading — `Section`'s title is text only, with no slot
        for a right-hand side, so what would sit beside the h2 sits on the
        first line under it instead.

        **A screen about one article draws the state as a badge**, the way
        the alert screen does. What keeps the badge out of a listing is the
        count: fifty rows that all say the same thing in an outlined box
        leave the eye nothing to catch, whereas here there is one per
        language and it is the first thing the section says.
      */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {editor.published
          ? <Badge tone="accent" icon={<Icon name="eye" />}>{t.published}</Badge>
          : <Badge tone="muted" icon={<Icon name="lock" />}>{t.unpublished}</Badge>}
        {editor.publishedAt !== null && (
          <span className="text-ink-muted text-xs">
            {t.publishedOn}
            {" "}
            {editor.publishedAt}
          </span>
        )}
      </div>

      {/*
        **Two things can be done to a language, and they stand in one row.**
        Saving writes the one body there is, public or not, and the state
        says whether the page is up. There is no draft between the words and
        the page — a rewrite that must not be read on the way is a new
        revision under a series. **A language's words are never taken away
        on their own**: a language that must not be read is taken down, which
        keeps the words, and what takes words away is the item's own
        deletion, beside its name (`docs/editing.md` の「サイトコンテンツ」).

        **The publish state is one control rather than two.** It has two
        values, so a pair of buttons would always leave one of them naming
        what is already true.

        **Publishing is not held to the same condition as saving.** What
        goes out is what is on the screen whether or not it was typed just
        now, so a language with unsaved words can be published as it is.
      */}
      <Editing
        id={id}
        method="post"
        className="flex min-h-0 flex-1 flex-col gap-4"
        onInput={(event) => { onTyped?.(editor.locale, typedIn(event.currentTarget)) }}
        onDirty={(dirty) => { onDirty?.(editor.locale, dirty) }}
      >
        <input type="hidden" name="locale" value={editor.locale} />
        <input type="hidden" name="revision" value={editor.revision ?? ""} />
        {/* **The mark says what publishing would refuse**, not what saving
            does — a title-less body still saves, and only the switch below
            can turn it into a published page (`docs/admin-ui.md` の「画面の
            名乗り」). The server is what refuses it; the box carries no HTML
            `required`. */}
        <Field label={t.title} name="title" value={editor.title} width="w-full" required={messages.admin.required} />
        {/* The box and the lines it was refused for are one part of the form:
            the list stands under the box at an error's distance (8px), not at
            the distance the form keeps between its parts. **The part does not
            grow**: what the pane has left over goes under the buttons, so the
            buttons stand right under the box whatever the window's height. */}
        <div className="flex min-h-0 flex-col gap-2">
          <MarkdownEditor
            label={t.body}
            name="body"
            value={editor.body}
            accepts={messages.admin.accepts.markdown}
            refused={problems.length === 0
              ? undefined
              : { id: problemsId, lines: problems.map((one) => one.line) }}
            onReady={onReady}
          />
          {problems.length > 0 && <BodyProblems id={problemsId} problems={problems} locale={locale} goTo={goTo} />}
        </div>
        {/* **Saving stands in the tools row above the panes, not here**
            (`ArticleTools`) — one control per open language rather than one
            per form, since two of these can be open at once. Publishing
            stays: it is pressed back and forth with its own opposite, not
            pressed on the way out of the box. */}
        <div className="flex flex-wrap items-center gap-3">
          {editor.published
            ? (
                <Submit intent="unpublish" icon={<Icon name="lock" />} className={SHOWING}>
                  {t.unpublish}
                </Submit>
              )
            : (
                <Submit intent="publish" icon={<Icon name="upload" />} className={SHOWING}>
                  {t.publish}
                </Submit>
              )}
        </div>
      </Editing>
    </Section>
  )
}

function contentOf(editors: LocaleEditor[], language: Locale): ArticleContent {
  const editor = editors.find((one) => one.locale === language)
  return { title: editor?.title ?? "", body: editor?.body ?? "" }
}

/**
 * The page a language's words make, drawn as readers would see it — and
 * nothing else: whether it is up is said in the form beside it, and a badge
 * over the page would be a word readers never see. Until the first drawing
 * arrives the saved body stands, drawn the same way by the loader.
 */
function ArticlePage({ language, drawn, dated }: {
  language: Locale
  drawn: ArticleView | null
  dated: string | null
}) {
  return (
    <div lang={language}>
      {/* **The public page's own card, at the public page's own steps**
          (`routes/document.tsx`), not a management card with a name at its
          head. */}
      <Card>
        {drawn !== null && (
          <Stack gap="normal">
            {/* **Not the screen's name** — the page is drawn inside the
                editing screen, whose name is the bar above (`docs/ui.md` の
                「編集画面の 2 ペイン」). */}
            <Heading level="h2" look="h1" title={drawn.title} />
            {dated !== null && <p className="text-ink-muted text-sm">{dated}</p>}
            <Markdown html={drawn.html} />
          </Stack>
        )}
      </Card>
    </div>
  )
}

/** What a language's own form is sent by, from outside the pane it stands in. */
export function articleFormId(remember: string, language: Locale): string {
  return `${remember}-${language}`
}

/** The two-pane arrangement `usePanes` hands back — just the part these read. */
interface PaneArrangement {
  left: string
  right: string
  showing: "both" | "left" | "right"
}

/**
 * Which languages currently stand open for editing, read off the arrangement
 * rather than tracked a second time — a save exists exactly where a
 * "編集 xx" pane stands, so the two cannot drift apart
 * (`docs/admin-ui.md` の「道具の行」).
 */
export function openLanguagesOf(panes: PaneArrangement): Locale[] {
  const shown = new Set([
    ...(panes.showing !== "right" ? [panes.left] : []),
    ...(panes.showing !== "left" ? [panes.right] : []),
  ])
  return (["ja", "en"] as const).filter((language) => shown.has(`form-${language}`))
}

/** Which language, if any, the left pane holds for editing — what Ctrl+S sends. */
export function leftLanguageOf(panes: Pick<PaneArrangement, "left" | "showing">): Locale | null {
  if (panes.showing === "right") return null
  return panes.left === "form-ja" ? "ja" : panes.left === "form-en" ? "en" : null
}

/**
 * One open language's own way to send what is typed into it — pressed from
 * the tools row rather than from inside the form, which the row does not
 * contain (`ArticleTools`).
 *
 * **It sends a form it does not stand in.** `Submit`'s `form` names it by id,
 * the way `docs/admin-ui.md` の「道具の行」 describes, and `dirty` stands in
 * for `Changed` — the button is not inside the form's own tree, so it cannot
 * read that context.
 */
function LanguageSave({ locale, language, formId, dirty }: {
  locale: Locale
  language: Locale
  formId: string
  dirty: boolean
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <span className="flex items-center gap-2">
      <Submit
        id={`${formId}-save`}
        form={formId}
        intent="save"
        saves
        dirty={dirty}
        icon={<Icon name="save" aria-hidden="true" />}
      >
        {t.save}
        {/* **The mark, not a second word.** The button already says "保存";
            what is next to it says which of the two open forms this one
            sends (`docs/admin-ui.md` の「語と文」). */}
        <span className="text-xs" lang={language}>{language}</span>
      </Submit>
      <Unsaved locale={locale} dirty={dirty} />
    </span>
  )
}

/**
 * The tools row an article or an announcement keeps at hand: the pane switch,
 * and one save per language currently open for editing — the same shape a
 * research draft's `DraftTools` stands in (`draft-tools.tsx`).
 *
 * **Neither unresolved comments nor who else is here stand in it** — a
 * document and an announcement carry neither; both belong to a draft, and
 * these have none.
 *
 * **Ctrl+S and Cmd+S send the left pane's form**, when it holds one — the one
 * form a curator typing has to reach without moving the pointer.
 */
export function ArticleTools({ locale, panesControl, saves, leftFormId }: {
  locale: Locale
  panesControl: ReactNode
  /** One entry per language whose edit form currently stands in a pane, left to right. */
  saves: { language: Locale, formId: string, dirty: boolean }[]
  leftFormId: string | null
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "s" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      event.preventDefault()
      if (leftFormId === null) return
      const button = document.getElementById(`${leftFormId}-save`)
      if (button instanceof HTMLButtonElement) button.click()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
    }
  }, [leftFormId])

  return (
    <div className={`sticky top-0 z-30 flex ${TOOLS_HEIGHT} items-center gap-4 rounded-b bg-white px-6`}>
      {panesControl}
      <div className="ml-auto flex shrink-0 items-center gap-4 whitespace-nowrap text-sm">
        {saves.map((save) => (
          <LanguageSave
            key={save.language}
            locale={locale}
            language={save.language}
            formId={save.formId}
            dirty={save.dirty}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * The two panes an article or an announcement is written in: the form, and the
 * page it makes — the same arrangement a research draft is written in
 * (`editor.tsx`), remembered per screen.
 *
 * **The page is drawn by the server from what the form holds**, a pause after
 * the last key (`useDrawn`), through the function the public page runs — so the
 * pane never disagrees with what a save would publish, and there is no second
 * reading of the markdown to keep in step (docs/editing.md の「サイトコンテンツ」).
 * Each language is drawn on its own, since each is its own form.
 */
export function useArticlePanes({ locale, remember, editors, result, dated = null }: {
  locale: Locale
  /** What this screen's arrangement is filed under for the session. */
  remember: string
  editors: LocaleEditor[]
  result: ContentsResult | undefined
  /** What the page says under its title — the day an announcement went out. */
  dated?: string | null
}): { view: ReactNode, tools: ReactNode } {
  const words = messagesFor(locale).admin.editor
  const [typed, setTyped] = useState<Record<Locale, ArticleContent>>(() => ({
    ja: contentOf(editors, "ja"),
    en: contentOf(editors, "en"),
  }))
  const onTyped = useCallback((language: Locale, content: ArticleContent) => {
    setTyped((was) => ({ ...was, [language]: content }))
  }, [])
  const [dirty, setDirty] = useState<Record<Locale, boolean>>({ ja: false, en: false })
  const onDirty = useCallback((language: Locale, next: boolean) => {
    setDirty((was) => (was[language] === next ? was : { ...was, [language]: next }))
  }, [])
  const at = adminArticlePreviewPath()
  const initial = (language: Locale): ArticleView => {
    const editor = editors.find((one) => one.locale === language)
    return { title: editor?.title ?? "", html: editor?.html ?? "" }
  }
  const drawnJa = useDrawn<ArticleView>(at, JSON.stringify({ locale: "ja", ...typed.ja }), initial("ja"))
  const drawnEn = useDrawn<ArticleView>(at, JSON.stringify({ locale: "en", ...typed.en }), initial("en"))

  // **Each language's form on its own, facing its own page.** What belongs to
  // the article rather than to a language — an announcement's date, an
  // article's way under version control — stands in the head above the tools
  // row, so the boxes hold nothing but a language and its page.
  //
  // **The column fills the pane** (`fill`, down to the body's box), so that a
  // short window shrinks the box rather than the pane scrolling, and the box
  // never makes the pane as long as the body — it stops at thirty lines and
  // scrolls inside itself (`form.tsx` の `MarkdownEditor`).
  const form = (language: Locale): ReactNode => (
    <Card fill>
      <Stack gap="block" fill>
        <LocaleEditors
          editors={editors.filter((one) => one.locale === language)}
          locale={locale}
          remember={remember}
          result={result}
          onTyped={onTyped}
          onDirty={onDirty}
        />
      </Stack>
    </Card>
  )

  const panes = usePanes({
    locale,
    remember,
    opens: "page",
    under: "bar",
    contents: [
      { id: "form-ja", label: words.paneFormJa, body: form("ja") },
      { id: "form-en", label: words.paneFormEn, body: form("en") },
      { id: "page", label: words.panePageJa, body: <ArticlePage language="ja" drawn={drawnJa} dated={dated} /> },
      { id: "page-en", label: words.panePageEn, body: <ArticlePage language="en" drawn={drawnEn} dated={dated} /> },
    ],
  })

  const openLanguages = openLanguagesOf(panes)
  const leftLanguage = leftLanguageOf(panes)

  const tools = (
    <ArticleTools
      locale={locale}
      panesControl={panes.control}
      leftFormId={leftLanguage === null ? null : articleFormId(remember, leftLanguage)}
      saves={openLanguages.map((language) => ({
        language,
        formId: articleFormId(remember, language),
        dirty: dirty[language],
      }))}
    />
  )

  return { view: panes.view, tools }
}
