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

import type { LocaleStates } from "~/admin/contents"
import type { ContentsResult, LocaleEditor } from "~/admin/contents.server"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { Badge } from "./base"
import { Field, Result, Submit, TextArea } from "./form"
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

export function StateBadges({ states, locale }: { states: LocaleStates, locale: Locale }) {
  const t = messagesFor(locale).admin.contents
  return (
    <span className="flex flex-wrap gap-1">
      {(["ja", "en"] as const).map((each) => (
        <Badge key={each}>
          {t.languages[each]}
          {": "}
          {states[each].published ? t.published : t.unpublished}
          {states[each].hasDraft && ` / ${t.draft}`}
        </Badge>
      ))}
    </span>
  )
}

export function LocaleEditors({ editors, locale }: { editors: LocaleEditor[], locale: Locale }) {
  const t = messagesFor(locale).admin.contents
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
            <Badge>{editor.published ? t.published : t.unpublished}</Badge>
            {editor.hasDraft && <Badge>{t.draft}</Badge>}
            {editor.publishedAt !== null && (
              <span className="text-ink-muted text-xs">
                {t.publishedOn}
                {" "}
                {editor.publishedAt}
              </span>
            )}
          </div>

          <Form method="post" className="flex flex-col gap-3">
            <input type="hidden" name="locale" value={editor.locale} />
            <input type="hidden" name="revision" value={editor.revision ?? ""} />
            <Field label={t.title} name="title" value={editor.draftTitle} width="w-full" />
            <TextArea label={t.body} name="body" value={editor.draftBody} />
            <div className="flex flex-wrap gap-2">
              <Submit intent="save-draft">{t.save}</Submit>
              <Submit intent="publish">{t.publish}</Submit>
            </div>
          </Form>

          {(editor.published || editor.hasDraft) && (
            <Form method="post" className="flex flex-wrap gap-2">
              <input type="hidden" name="locale" value={editor.locale} />
              <input type="hidden" name="revision" value={editor.revision ?? ""} />
              {editor.published && <Submit intent="unpublish">{t.unpublish}</Submit>}
              {editor.hasDraft && <Submit intent="discard-draft">{t.discard}</Submit>}
            </Form>
          )}
        </Section>
      ))}
    </>
  )
}
