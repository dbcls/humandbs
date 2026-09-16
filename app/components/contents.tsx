/**
 * The parts the site-content screens share: what a language is up to, and the
 * pair of forms that write one.
 *
 * **Editing and taking down are two forms, side by side rather than nested.**
 * A body that was typed but not sent travels with the form it was typed in, so
 * "take this down" cannot carry it — and publishing, which sits under the body,
 * takes exactly what is on screen.
 */

import type { LocaleState } from "~/admin/contents"
import type { ContentsResult, LocaleEditor } from "~/admin/contents.server"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { Badge, Confirm } from "./base"
import { Editing, Field, Result, Submit, TextArea, Unsaved } from "./form"
import { Icon } from "./icons"
import { Section } from "./page"

/**
 * What the last form did. A refused body says which language and which line,
 * because "there is HTML in it" sends the author back to read the whole thing.
 */
export function ResultLine({ result, locale }: {
  result: ContentsResult | undefined
  locale: Locale
}) {
  if (result === undefined) return null
  const t = messagesFor(locale).admin.contents
  if (result.status === "ok") return <Result ok>{t.done}</Result>
  if (result.status === "body") {
    return (
      <Result ok={false}>
        {result.problems
          .map((problem) => t.bodyProblem(
            t.languages[problem.locale],
            problem.line,
            t.syntaxes[problem.syntax],
          ))
          .join(" / ")}
      </Result>
    )
  }
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
 * The glyph a publish state is drawn by.
 *
 * **The same pair in the pane and down the table**, so that the shape a curator
 * narrows by is the shape they then read in the rows. It rides in front of the
 * word rather than standing alone: an eye or a lock is only obvious once you
 * know the question is who can see this.
 */
export function StateIcon({ published }: { published: boolean }) {
  return (
    <Icon
      name={published ? "eye" : "lock"}
      aria-hidden="true"
      className="mr-1 text-ink-muted"
    />
  )
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
 */
export function StateCell({ state, locale }: { state: LocaleState, locale: Locale }) {
  const t = messagesFor(locale).admin.contents
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center text-nowrap">
        <StateIcon published={state.published} />
        {state.published ? t.published : t.unpublished}
      </span>
      {state.hasDraft && <Badge tone="accent">{t.draft}</Badge>}
    </span>
  )
}

export function LocaleEditors({ editors, locale, lastWarning }: {
  editors: LocaleEditor[]
  locale: Locale
  /**
   * What the panel says when the language being taken away is the last one.
   *
   * **The screen writes this rather than the part.** What goes with the last
   * language differs — an article takes its slug out of use, an announcement
   * takes nothing — and only the screen knows which of the two it is.
   */
  lastWarning: string
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.contents
  /** The languages that have a row, which are the ones there is anything to take away. */
  const written = editors.filter((one) => one.revision !== null)
  return (
    <>
      {editors.map((editor) => (
        <Section key={editor.locale} title={t.languages[editor.locale]}>
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
            {editor.hasDraft && <Badge tone="accent">{t.draft}</Badge>}
            {editor.publishedAt !== null && (
              <span className="text-ink-muted text-xs">
                {t.publishedOn}
                {" "}
                {editor.publishedAt}
              </span>
            )}
          </div>

          {/*
            **Three things can be done to a language, and they stand in one
            row.** Whether the body sits in a draft or in the published column
            is how the table is built, not something the writer asked about —
            what they decide is whether to keep the words, whether the page is
            up, and whether this language exists at all.

            **The publish state is one control rather than two.** It has two
            values, so a pair of buttons would always leave one of them naming
            what is already true.

            **Publishing is not held to the same condition as saving.** What
            goes out is what is on the screen whether or not it was typed just
            now, so a language with unsaved words can be published as it is.
          */}
          <Editing method="post" className="flex flex-col gap-4">
            <input type="hidden" name="locale" value={editor.locale} />
            <input type="hidden" name="revision" value={editor.revision ?? ""} />
            <Field label={t.title} name="title" value={editor.draftTitle} width="w-full" />
            <TextArea
              label={t.body}
              name="body"
              value={editor.draftBody}
              accepts={messages.admin.accepts.markdown}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex flex-wrap items-center gap-3">
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
                <Submit intent="save-draft" icon={<Icon name="save" />} saves>
                  {messages.admin.editor.save}
                </Submit>
                <Unsaved locale={locale} />
              </span>
              {/*
                **Only a language that has been written can be taken away**, and
                the last one takes the whole thing with it — which is what the
                panel says when it is the last one.
              */}
              {editor.revision !== null && (
                <Confirm
                  label={t.removeLocale}
                  title={t.removeLocaleTitle(t.languages[editor.locale])}
                  warning={written.length <= 1 ? lastWarning : t.removeLocaleWarning}
                  confirm={t.removeLocaleConfirm}
                  cancel={t.cancel}
                  intent="delete-locale"
                />
              )}
            </div>
          </Editing>
        </Section>
      ))}
    </>
  )
}
