/**
 * The parts the site-content screens share: what a language is up to, and the
 * pair of forms that write one.
 *
 * **Editing and taking down are two forms, side by side rather than nested.**
 * A body that was typed but not sent travels with the form it was typed in, so
 * "take this down" cannot carry it — and publishing, which sits under the body,
 * takes exactly what is on screen.
 */

import { Form } from "react-router"

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
 * What one language of an article is up to.
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

export function LocaleEditors({ editors, locale }: { editors: LocaleEditor[], locale: Locale }) {
  const messages = messagesFor(locale)
  const t = messages.admin.contents
  return (
    <>
      {editors.map((editor) => (
        <Section key={editor.locale} title={t.languages[editor.locale]}>
          {/*
            The state and the publish date name the language section but are not
            part of its heading — `Section`'s title is text only, with no slot
            for a right-hand side, so what would sit beside the h2 sits on the
            first line under it instead.
          */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StateCell
              state={{ published: editor.published, hasDraft: editor.hasDraft }}
              locale={locale}
            />
            {editor.publishedAt !== null && (
              <span className="text-ink-muted text-xs">
                {t.publishedOn}
                {" "}
                {editor.publishedAt}
              </span>
            )}
          </div>

          {/* **Publishing is not held to the same condition as saving.** What
              goes out is what is on the screen whether or not it was typed
              just now, so a language that has a draft can be published without
              touching it first. */}
          <Editing method="post" className="flex flex-col gap-3">
            <input type="hidden" name="locale" value={editor.locale} />
            <input type="hidden" name="revision" value={editor.revision ?? ""} />
            <Field label={t.title} name="title" value={editor.draftTitle} width="w-full" />
            <TextArea
              label={t.body}
              name="body"
              value={editor.draftBody}
              accepts={messages.admin.accepts.markdown}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Submit intent="save-draft" icon={<Icon name="save" />} saves>{t.save}</Submit>
              <Submit intent="publish" icon={<Icon name="upload" />}>{t.publish}</Submit>
              <Unsaved locale={locale} />
            </div>
          </Editing>

          {/*
            **Both of these are asked about, and publishing above is not.**
            Taking a page down removes an address readers hold, and discarding
            throws away what somebody typed; publishing is undone by the button
            next to it.
          */}
          {(editor.published || editor.hasDraft) && (
            <Form method="post" className="flex flex-wrap gap-2">
              <input type="hidden" name="locale" value={editor.locale} />
              <input type="hidden" name="revision" value={editor.revision ?? ""} />
              {editor.published && (
                <Confirm
                  label={t.unpublish}
                  title={t.unpublishTitle(t.languages[editor.locale])}
                  warning={t.unpublishWarning}
                  confirm={t.unpublishConfirm}
                  cancel={t.cancel}
                  intent="unpublish"
                  icon="lock"
                />
              )}
              {editor.hasDraft && (
                <Confirm
                  label={t.discard}
                  title={t.discardTitle(t.languages[editor.locale])}
                  warning={t.discardWarning}
                  confirm={t.discardConfirm}
                  cancel={t.cancel}
                  intent="discard-draft"
                />
              )}
            </Form>
          )}
        </Section>
      ))}
    </>
  )
}
