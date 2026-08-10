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
 */

import type { LinksPairInput, SlotState, TextInput, TextPairInput } from "~/admin/form"
import type { FieldProblem } from "~/admin/form.server"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

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

export function Section({ id, title, children }: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="mt-8 scroll-mt-32">
      <h2 className="mb-3 border-line border-b pb-1 font-semibold text-brand">{title}</h2>
      {children}
    </section>
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
      {untranslated && (
        <span className="rounded-sm border border-line px-1.5 py-0.5 text-ink-muted text-xs">
          {t.untranslated}
        </span>
      )}
      {marks.changed && (
        <span className="rounded-sm border border-accent px-1.5 py-0.5 text-accent text-xs">
          {t.changed}
        </span>
      )}
      {marks.onTake !== null && (
        <button
          type="button"
          onClick={marks.onTake}
          className="cursor-pointer text-accent text-xs underline"
        >
          {t.take}
        </button>
      )}
      {marks.extra}
    </div>
  )
}

export function StateSwitch({ state, onChange, locale }: {
  state: SlotState
  onChange: (next: SlotState) => void
  locale: Locale
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <div className="flex gap-1">
      {STATES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          aria-pressed={state === candidate}
          onClick={() => { onChange(candidate) }}
          className={`cursor-pointer rounded-sm border px-1.5 py-0.5 text-xs ${
            state === candidate ? "border-brand bg-brand text-white" : "border-line text-ink-muted"
          }`}
        >
          {t.states[candidate]}
        </button>
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
  const classes = `w-full rounded-sm border px-2 py-1 text-sm ${
    problems.length > 0 ? "border-danger" : "border-line"
  } ${disabled ? "bg-surface text-ink-muted" : ""}`

  return (
    <div className="flex flex-col gap-1">
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
      {problems.length > 0 && (
        <ul className="text-danger text-xs">
          {problems.map((problem, at) => (
            <li key={at}>{`${t.syntax[problem.syntax]} (${t.problemLine(problem.line)})`}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

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
    <div className="mt-4 first:mt-0">
      <FieldHead label={label} marks={marks} locale={locale} untranslated={isUntranslated(value)} />
      <div className="mt-1 grid gap-3 md:grid-cols-2">
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
    </div>
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
    <div className="mt-4">
      <FieldHead label={label} marks={marks} locale={locale} />
      <div className="mt-1 md:max-w-md">
        <SlotEditor
          language={locale}
          value={value}
          locale={locale}
          problems={[]}
          onChange={onChange}
        />
      </div>
    </div>
  )
}

export function RowButton({ label, onClick, disabled = false }: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded-sm border border-line px-2 py-0.5 text-ink-muted text-xs disabled:opacity-50"
    >
      {label}
    </button>
  )
}

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
    <div className="mt-4 rounded-sm border border-line px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-ink-muted text-xs">{index + 1}</span>
        <div className="flex gap-1">
          <RowButton label={t.moveUp} disabled={index === 0} onClick={() => { onMove(-1) }} />
          <RowButton
            label={t.moveDown}
            disabled={index === count - 1}
            onClick={() => { onMove(1) }}
          />
          <RowButton label={t.remove} onClick={onRemove} />
        </div>
      </div>
      {children}
    </div>
  )
}

export function AddElement({ label, onClick }: { label: string, onClick: () => void }) {
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onClick}
        className="cursor-pointer rounded-sm border border-brand px-3 py-1 text-brand text-sm"
      >
        {label}
      </button>
    </div>
  )
}

export function ConflictBand({ locale, changed }: { locale: Locale, changed: string[] }) {
  const t = messagesFor(locale).admin.editor
  return (
    <div className="mb-4 rounded-sm border border-accent bg-surface px-4 py-3 text-sm">
      <p className="font-semibold">{t.conflictHeading}</p>
      <p className="mt-1">
        {changed.length === 0 ? t.conflictNone : t.conflictBody(changed.length)}
      </p>
      {changed.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {changed.map((path) => (
            <li key={path} className="rounded-sm border border-line px-2 py-0.5 text-xs">
              <a href={`#${path.split(".")[0] ?? path}`}>{path}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
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
    <div className="mb-4 rounded-sm border border-accent bg-surface px-4 py-3 text-sm">
      <p className="font-semibold">{t.heading}</p>
      <p className="mt-1">{t.body(only.length + both.length)}</p>
      {only.length > 0 && (
        <button
          type="button"
          onClick={onTakeAll}
          className="mt-2 cursor-pointer rounded-sm border border-brand px-3 py-1 text-brand text-xs"
        >
          {t.takeAll(only.length)}
        </button>
      )}
      {both.length > 0 && <p className="mt-2 text-ink-muted text-xs">{t.both(both.length)}</p>}
    </div>
  )
}

export function ProblemBand({ locale, problems }: { locale: Locale, problems: FieldProblem[] }) {
  const t = messagesFor(locale).admin.editor
  return (
    <div className="mb-4 rounded-sm border border-danger bg-surface px-4 py-3 text-sm">
      <p className="font-semibold text-danger">{t.problemsHeading}</p>
      <ul className="mt-2 flex flex-col gap-1 text-xs">
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
    </div>
  )
}
