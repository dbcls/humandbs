/**
 * The parts an editing screen is built from.
 *
 * A research and a dataset are written on different screens because they are
 * different identities saved against different revisions, but a field is a
 * field: two languages side by side, each with a state of its own, and **what
 * is typed is never taken away** — marking a value unsettled leaves the
 * half-written text in the box, and refused markup comes back attached to the
 * field it was written in.
 *
 * The marks beside a field are the whole of how a rejected save is answered.
 * Nothing is merged and nothing is reloaded; the field says somebody else moved
 * it and offers to take their value, one field at a time.
 *
 * **Nothing here draws a box, an edge or a control of its own.** The values are
 * held in React state, so the inputs are controlled where `form.tsx` builds
 * uncontrolled ones — but what they look like is the same `CONTROL`, the same
 * `Button` and the same `Note` the rest of the site is drawn from, and the
 * distances between them are `Stack`'s three (`docs/ui.md`).
 */

import type { LinksPairInput, SlotState, TextInput, TextPairInput } from "~/admin/form"
import type { FieldProblem } from "~/admin/form.server"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { Badge, Button, IconButton, Note, Stack } from "./base"
import { CONTROL } from "./form"
import { Icon } from "./icons"
import { Section as PageSection } from "./page"

const STATES: readonly SlotState[] = ["value", "unknown", "not-applicable"]

/**
 * Everything a field needs to know about the two ways a save can come back, and
 * whatever the review layer hangs beside it — where the published version says
 * something else, and what has been said about the field. Those arrive as a
 * node so that the field parts stay ignorant of both.
 */
export interface Marks {
  changed: boolean
  onTake: (() => void) | null
  problems: FieldProblem[]
  extra?: React.ReactNode
}

export function newId(): string {
  return crypto.randomUUID()
}

export function emptySlot(): TextInput {
  return { state: "value", text: "" }
}

export function emptyPair(): TextPairInput {
  return { ja: emptySlot(), en: emptySlot() }
}

export function emptyLinksPair(): LinksPairInput {
  return { ja: { state: "value", links: [] }, en: { state: "value", links: [] } }
}

/** A pair is untranslated when both sides hold a value and one of them is empty. */
export function isUntranslated(pair: TextPairInput): boolean {
  return pair.ja.state === "value"
    && pair.en.state === "value"
    && (pair.ja.text === "") !== (pair.en.text === "")
}

export function moved<T>(items: readonly T[], from: number, by: number): T[] {
  const to = from + by
  if (to < 0 || to >= items.length) return [...items]
  const next = [...items]
  const [taken] = next.splice(from, 1)
  if (taken !== undefined) next.splice(to, 0, taken)
  return next
}

export function replacing<T extends { id: string }>(items: readonly T[], id: string, next: T): T[] {
  return items.map((item) => item.id === id ? next : item)
}

/**
 * A part of an editing screen, named and addressable.
 *
 * **The name is drawn by the part that names a section everywhere else**, so
 * that a screen editing a research reads as the same site as the page showing
 * one. The anchor is what a mark on a refused field points at, and it clears
 * the bar standing at the top of the window.
 *
 * The fields inside are a list of things in one box, which is `Stack`'s middle
 * distance: a section that spaced its own fields would be one more screen with
 * a rhythm of its own.
 */
export function Section({ id, title, children }: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div id={id} className="scroll-mt-32">
      <PageSection title={title}>
        <Stack>{children}</Stack>
      </PageSection>
    </div>
  )
}

export function FieldHead({ label, marks, locale, untranslated = false }: {
  label: string
  marks: Marks
  locale: Locale
  untranslated?: boolean
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold text-ink-muted text-xs">{label}</span>
      {untranslated && <Badge>{t.untranslated}</Badge>}
      {marks.changed && <Badge tone="accent">{t.changed}</Badge>}
      {marks.onTake !== null && (
        <Button type="button" variant="ghost" size="xs" onClick={marks.onTake}>
          {t.take}
        </Button>
      )}
      {marks.extra}
    </div>
  )
}

/**
 * Which of the three things a slot says: a value, that nobody knows yet, or
 * that the question does not apply.
 *
 * **The names do not change with the state** — a control that renamed itself
 * would announce as "mark unsettled, pressed" and say two opposite things at
 * once (`docs/ui.md`). What changes is the fill.
 */
export function StateSwitch({ state, onChange, locale }: {
  state: SlotState
  onChange: (next: SlotState) => void
  locale: Locale
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <div className="flex gap-1">
      {STATES.map((candidate) => (
        <Button
          key={candidate}
          type="button"
          size="xs"
          variant={state === candidate ? "primary" : "ghost"}
          aria-pressed={state === candidate}
          onClick={() => { onChange(candidate) }}
        >
          {t.states[candidate]}
        </Button>
      ))}
    </div>
  )
}

/**
 * One language of one field. The text stays in the box whatever the state says,
 * so switching to "unsettled" and back gives the half-written value back.
 */
export function SlotEditor({ language, value, multiline, onChange, locale, problems }: {
  language: Locale
  value: TextInput
  multiline?: boolean
  onChange: (next: TextInput) => void
  locale: Locale
  problems: FieldProblem[]
}) {
  const t = messagesFor(locale).admin.editor
  const disabled = value.state !== "value"
  const classes = `${CONTROL} w-full text-sm disabled:opacity-50 ${
    problems.length > 0 ? "border-danger" : ""
  }`

  return (
    <Stack gap="tight">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-muted text-xs" lang={language}>{language}</span>
        <StateSwitch
          state={value.state}
          onChange={(state) => { onChange({ ...value, state }) }}
          locale={locale}
        />
      </div>
      {multiline === true
        ? (
            <textarea
              className={classes}
              rows={4}
              lang={language}
              disabled={disabled}
              value={value.text}
              onChange={(event) => { onChange({ ...value, text: event.target.value }) }}
            />
          )
        : (
            <input
              type="text"
              className={classes}
              lang={language}
              disabled={disabled}
              value={value.text}
              onChange={(event) => { onChange({ ...value, text: event.target.value }) }}
            />
          )}
      {/* Said before it is broken rather than after: what prose can hold is a
          short list, and a curator who knows it does not write a table. */}
      {multiline === true && problems.length === 0 && (
        <p className="text-ink-muted text-xs">{t.proseHint}</p>
      )}
      {problems.length > 0 && (
        <ul className="text-danger text-xs">
          {problems.map((problem, at) => (
            <li key={at}>{`${t.syntax[problem.syntax]} (${t.problemLine(problem.line)})`}</li>
          ))}
        </ul>
      )}
    </Stack>
  )
}

/**
 * Both languages of one field.
 *
 * **Not `form.tsx`'s `BilingualField`**, which is a plain form's pair: one line
 * each, uncontrolled, and with no state beside it. A draft is held in React
 * state so that a refused save can be answered field by field, and half of
 * these run to several lines.
 */
export function PairField({ label, value, multiline, marks, locale, onChange }: {
  label: string
  value: TextPairInput
  multiline?: boolean
  marks: Marks
  locale: Locale
  onChange: (next: TextPairInput) => void
}) {
  const problemsOf = (language: Locale) =>
    marks.problems.filter((problem) => problem.path.endsWith(`.${language}`))

  return (
    <Stack gap="tight">
      <FieldHead label={label} marks={marks} locale={locale} untranslated={isUntranslated(value)} />
      <div className="grid gap-4 md:grid-cols-2">
        {(["ja", "en"] as const).map((language) => (
          <SlotEditor
            key={language}
            language={language}
            value={value[language]}
            multiline={multiline}
            locale={locale}
            problems={problemsOf(language)}
            onChange={(next) => { onChange({ ...value, [language]: next }) }}
          />
        ))}
      </div>
    </Stack>
  )
}

/** A field with one value and no languages: an identifier, an address, a DOI. */
export function SingleField({ label, value, marks, locale, onChange }: {
  label: string
  value: TextInput
  marks: Marks
  locale: Locale
  onChange: (next: TextInput) => void
}) {
  return (
    <Stack gap="tight">
      <FieldHead label={label} marks={marks} locale={locale} />
      <div className="md:max-w-md">
        <SlotEditor
          language={locale}
          value={value}
          locale={locale}
          problems={[]}
          onChange={onChange}
        />
      </div>
    </Stack>
  )
}

/** A control beside a row of a list, where the row rather than the control is the subject. */
export function RowButton({ label, onClick, disabled = false }: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Button type="button" variant="ghost" size="xs" onClick={onClick} disabled={disabled}>
      {label}
    </Button>
  )
}

/**
 * One element of a repeated list: a provider, a project, a grant, a paper.
 *
 * **Moving and removing are glyphs**, because they are the same three controls
 * on every card and a list of ten would otherwise carry thirty words that say
 * nothing about the element they belong to. Each names itself for anybody not
 * looking at it (`IconButton`).
 */
export function ElementCard({ index, count, locale, onMove, onRemove, children }: {
  index: number
  count: number
  locale: Locale
  onMove: (by: number) => void
  onRemove: () => void
  children: React.ReactNode
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <div className="rounded border border-line px-4 py-3">
      <Stack>
        <div className="flex items-center justify-between">
          <span className="text-ink-muted text-xs">{index + 1}</span>
          <div className="flex items-center gap-1">
            {/* A glyph carries no colour of its own to dim, so what says a move
                is unavailable is put on the box around it. */}
            <span className={index === 0 ? "opacity-50" : ""}>
              <IconButton
                name="chevron-up"
                label={t.moveUp}
                disabled={index === 0}
                onClick={() => { onMove(-1) }}
              />
            </span>
            <span className={index === count - 1 ? "opacity-50" : ""}>
              <IconButton
                name="chevron-down"
                label={t.moveDown}
                disabled={index === count - 1}
                onClick={() => { onMove(1) }}
              />
            </span>
            <IconButton name="close" label={t.remove} onClick={onRemove} />
          </div>
        </div>
        {children}
      </Stack>
    </div>
  )
}

/** The way to add one more of whatever the section holds. */
export function AddElement({ label, onClick }: { label: string, onClick: () => void }) {
  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        icon={<Icon name="plus" />}
        onClick={onClick}
      >
        {label}
      </Button>
    </div>
  )
}

/**
 * A save somebody else got to first.
 *
 * Nothing was lost and nothing has to be dealt with in any order, but the form
 * now holds a version of the draft that no longer exists — so it is a warning
 * rather than a failure, and it lists the places rather than only counting
 * them.
 */
export function ConflictBand({ locale, changed }: { locale: Locale, changed: string[] }) {
  const t = messagesFor(locale).admin.editor
  return (
    <Note kind="warning" live>
      <Stack gap="tight">
        <p className="font-semibold">{t.conflictHeading}</p>
        <p>{changed.length === 0 ? t.conflictNone : t.conflictBody(changed.length)}</p>
        {changed.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {changed.map((path) => (
              <li key={path}>
                <a href={`#${path.split(".")[0] ?? path}`} className="text-brand">{path}</a>
              </li>
            ))}
          </ul>
        )}
      </Stack>
    </Note>
  )
}

/**
 * The published description has moved since this draft copied it.
 *
 * Not the same thing as a refused save, and said differently: nobody's save was
 * rejected and nothing has to be dealt with before carrying on. What it warns
 * about is publishing over somebody else's correction — so the fields only they
 * touched can be taken in one go, and the ones both sides touched are marked
 * where they are, to be chosen one at a time.
 */
export function UpstreamBand({ locale, only, both, onTakeAll }: {
  locale: Locale
  only: string[]
  both: string[]
  onTakeAll: () => void
}) {
  const t = messagesFor(locale).admin.upstream
  return (
    <Note kind="info">
      <Stack gap="tight">
        <p className="font-semibold">{t.heading}</p>
        <p>{t.body(only.length + both.length)}</p>
        {only.length > 0 && (
          <div>
            <Button type="button" variant="secondary" size="xs" onClick={onTakeAll}>
              {t.takeAll(only.length)}
            </Button>
          </div>
        )}
        {both.length > 0 && <p className="text-ink-muted text-xs">{t.both(both.length)}</p>}
      </Stack>
    </Note>
  )
}

/** Markup the store cannot hold, said where the save was refused for it. */
export function ProblemBand({ locale, problems }: { locale: Locale, problems: FieldProblem[] }) {
  const t = messagesFor(locale).admin.editor
  return (
    <Note kind="danger" live>
      <Stack gap="tight">
        <p className="font-semibold text-danger">{t.problemsHeading}</p>
        <ul className="flex flex-col gap-1 text-xs">
          {problems.map((problem, at) => (
            <li key={at}>
              {problem.path}
              {" — "}
              {t.syntax[problem.syntax]}
              {" ("}
              {t.problemLine(problem.line)}
              )
            </li>
          ))}
        </ul>
      </Stack>
    </Note>
  )
}
