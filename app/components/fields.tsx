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
import { useState } from "react"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { Badge, Button, Dialog, IconButton, Menu, MENU_ITEM, Note, Stack } from "./base"
import { Accepts, CONTROL } from "./form"
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
  /**
   * The path the field is written at. **It goes onto the markup** so that the
   * pane beside the form can be told which place the caret is in without every
   * field having to report it: one listener on the form finds the nearest
   * element carrying it.
   */
  at: string
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
 * **The fields inside stand a block apart.** Each of them is three rows deep —
 * a name and both languages — so the middle distance would leave the same gap
 * inside a field as between two of them, and a reader looking for where one
 * ends would have nothing to find.
 */
export function Section({ id, title, children }: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div id={id} className="scroll-mt-32">
      <PageSection title={title}>
        <Stack gap="block">{children}</Stack>
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
        <Button
          type="button"
          variant="ghost"
          size="xs"
          icon={<Icon name="download" aria-hidden="true" />}
          onClick={marks.onTake}
        >
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
 * **The ordinary state is not drawn.** There is one of these per field per
 * language, so a screen holds dozens of them; a control saying "this one holds
 * a value" beside every box that holds one tells the writer what the box in
 * front of them already says, in the one colour the screen has for what it
 * wants read. What is worth a mark is the other two — a reader of the page has
 * no other way of knowing about them — so those are named where they apply,
 * with the way back to a value beside them.
 */
export function StateSwitch({ state, onChange, locale }: {
  state: SlotState
  onChange: (next: SlotState) => void
  locale: Locale
}) {
  const t = messagesFor(locale).admin.editor

  if (state !== "value") {
    return (
      <span className="flex items-center gap-2">
        <Badge>{t.stateSaid[state]}</Badge>
        <Button type="button" variant="ghost" size="xs" onClick={() => { onChange("value") }}>
          {t.backToValue}
        </Button>
      </span>
    )
  }

  return (
    <Menu label={t.statesLabel}>
      {STATES.filter((candidate) => candidate !== "value").map((candidate) => (
        <button
          key={candidate}
          type="button"
          className={MENU_ITEM}
          onClick={(event) => {
            // Choosing has to close the panel: what it does is a change to the
            // field rather than a move, and nothing else here would close it.
            const panel = event.currentTarget.closest("details")
            if (panel !== null) panel.open = false
            onChange(candidate)
          }}
        >
          {t.states[candidate]}
        </button>
      ))}
    </Menu>
  )
}

/**
 * One language of one field. The text stays in the box whatever the state says,
 * so switching to "unsettled" and back gives the half-written value back.
 */
export function SlotEditor({ language, named = true, value, multiline, onChange, locale, problems }: {
  language: Locale
  /**
   * Whether the box says which language it is. **A field with one value does
   * not** — the word would name the language of the screen rather than of what
   * is written, and a reader who sees `ja` over a DOI looks for the other one.
   */
  named?: boolean
  value: TextInput
  multiline?: boolean
  onChange: (next: TextInput) => void
  locale: Locale
  problems: FieldProblem[]
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.editor
  const disabled = value.state !== "value"
  const classes = `${CONTROL} w-full text-sm disabled:opacity-50 ${
    problems.length > 0 ? "border-danger" : ""
  }`

  return (
    <Stack gap="tight">
      <div className="flex items-center justify-between gap-2">
        {/* What the box takes is said before anything is broken rather than
            after: what prose can hold is a short list, and a curator who knows
            it does not write a table. */}
        <span className="flex items-center gap-2">
          {named && <span className="text-ink-muted text-xs" lang={language}>{language}</span>}
          {multiline === true && <Accepts>{messages.admin.accepts.prose}</Accepts>}
        </span>
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
    <Stack gap="tight" at={marks.at}>
      <FieldHead label={label} marks={marks} locale={locale} untranslated={isUntranslated(value)} />
      {/* **The two languages stand one above the other.** Side by side, each of
          them gets half the width a sentence is read in, and the pair of them
          reads as two columns of a table rather than as one value written
          twice. **They keep the distance a label has to its value** — what
          separates one field from the next is the section's own, which is
          wider (`docs/ui.md` の「縦の間隔」). */}
      <div className="flex flex-col gap-2">
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
    <Stack gap="tight" at={marks.at}>
      <FieldHead label={label} marks={marks} locale={locale} />
      <div className="md:max-w-md">
        <SlotEditor
          language={locale}
          named={false}
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

/**
 * A list of one kind of thing, each element written in a panel of its own.
 *
 * **The card says what an element is; the panel holds what is in it.** Four of
 * these lists stand in one screen and an element carries up to eight fields, so
 * drawn open they are a hundred boxes deep and what the list itself says — how
 * many, in what order — is buried in them. Opened one at a time, the shape of
 * the list stays readable and the element being written in has the width of a
 * panel rather than the width left over beside its neighbours.
 *
 * **Adding one opens it.** A new element says nothing on a card, so a list that
 * only appended would leave the reader a blank line to find and open.
 *
 * **The panel writes as it is typed.** There is nothing to accept or cancel in
 * here — the draft is saved by the one save the screen has, and a panel with a
 * button of its own would look like a second place work is kept.
 */
export function ItemList<T extends { id: string }>({
  path,
  locale,
  items,
  title,
  summary,
  onChange,
  makeEmpty,
  children,
}: {
  /** What one element's path opens with. */
  path: string
  locale: Locale
  items: T[]
  /** What the list holds, which names a panel whose element has nothing in it yet. */
  title: string
  /** What one element is, in a line. */
  summary: (item: T) => string
  onChange: (next: T[]) => void
  makeEmpty: () => T
  children: (item: T, path: string, set: (next: T) => void) => React.ReactNode
}) {
  const t = messagesFor(locale).admin.editor
  const [open, setOpen] = useState<string | null>(null)
  const held = items.find((row) => row.id === open)
  const named = held === undefined ? "" : summary(held).trim()

  return (
    <>
      {items.map((item, at) => (
        <ItemCard
          key={item.id}
          index={at}
          count={items.length}
          locale={locale}
          name={summary(item).trim()}
          onEdit={() => { setOpen(item.id) }}
          onMove={(by) => { onChange(moved(items, at, by)) }}
          onRemove={() => { onChange(items.filter((row) => row.id !== item.id)) }}
        />
      ))}
      <AddElement
        label={t.add}
        onClick={() => {
          const made = makeEmpty()
          onChange([...items, made])
          setOpen(made.id)
        }}
      />
      <Dialog
        wide
        title={named === "" ? title : named}
        held={{ open: held !== undefined, close: () => { setOpen(null) } }}
      >
        {(close) => held === undefined
          ? null
          : (
              <Stack gap="block">
                {children(
                  held,
                  `${path}.${held.id}`,
                  (next) => { onChange(replacing(items, held.id, next)) },
                )}
                <div>
                  <Button type="button" variant="secondary" onClick={close}>{t.done}</Button>
                </div>
              </Stack>
            )}
      </Dialog>
    </>
  )
}

/**
 * One element as a line: what it is, and the four things that can be done to it.
 *
 * **An element with nothing written in it still has a line.** It is a row of
 * the list like any other — one that can be opened, moved and taken away — and
 * a list that hid it would lose the element somebody just added.
 */
function ItemCard({ index, count, locale, name, onEdit, onMove, onRemove }: {
  index: number
  count: number
  locale: Locale
  name: string
  onEdit: () => void
  onMove: (by: number) => void
  onRemove: () => void
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-line px-4 py-2">
      <span className={`min-w-0 flex-1 truncate text-sm ${name === "" ? "text-ink-muted" : ""}`}>
        {name === "" ? t.unnamedElement : name}
      </span>
      <div className="flex items-center gap-1">
        <IconButton name="edit" label={t.edit} onClick={onEdit} />
        {/* A glyph carries no colour of its own to dim, so what says a move is
            unavailable is put on the box around it. */}
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
 * Where this draft differs from the version it is shown against.
 *
 * Not the same thing as a refused save, and said differently: nobody's save was
 * rejected and nothing has to be dealt with before carrying on. **It does not
 * say who changed what** — a draft is a copy and keeps no ancestor, so every
 * difference is the author's to decide. They can be taken in one go, or one at
 * a time from the mark beside each field.
 */
export function UpstreamBand({ locale, differing, number, onTakeAll }: {
  locale: Locale
  differing: string[]
  /** The version being compared against, so the band can name it. */
  number: number
  onTakeAll: () => void
}) {
  const t = messagesFor(locale).admin.upstream
  return (
    <Note kind="info">
      <Stack gap="tight">
        <p className="font-semibold">{t.heading(number)}</p>
        <p>{t.body(differing.length)}</p>
        <div>
          <Button
            type="button"
            variant="secondary"
            size="xs"
            icon={<Icon name="download" aria-hidden="true" />}
            onClick={onTakeAll}
          >
            {t.takeAll(differing.length)}
          </Button>
        </div>
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
