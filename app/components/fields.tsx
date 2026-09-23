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
import { useId, useState } from "react"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { Badge, Button, Dialog, IconButton, Note, Stack, TOOLTIP, ButtonLink, Chevron } from "./base"
import { Accepts, CONTROL } from "./form"
import { Icon, type IconName } from "./icons"
import { Section as PageSection, Table, Td } from "./page"

/**
 * Which language a box or a line holds, said as the code beside it.
 *
 * **At the size of the words it stands beside** (14px). Drawn smaller it reads
 * as an annotation to skim past, where it is the one thing that tells the two
 * boxes of a field apart (`docs/ui.md` の「幅」の言語の項). **Written once**, so
 * the editor's own rows and the read-only listings say it the same way.
 */
export function LanguageMark({ language, tall = false }: {
  language: Locale
  /** Level with the first line of a 36px box, for a mark in a box's gutter. */
  tall?: boolean
}) {
  return (
    <span className={`${tall ? "flex h-9 items-center " : ""}text-ink-muted text-sm`} lang={language}>
      {language}
    </span>
  )
}

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
 * **The fields inside stand the middle distance apart, not a block.** A field
 * is three rows deep — a name and both languages, 8px apart — so 16px between
 * two of them is twice what is inside one and still reads as the edge; a block
 * would set the fields of one section as far apart as the sections are.
 */
export function Section({ id, title, accepts, children }: {
  id: string
  title: string
  /**
   * What the section's one field reads what is typed as (`form.tsx` の
   * `Accepts`). A field with no name of its own has no row to say it on, so the
   * heading that names the field says it, right beside the name — where a
   * named field says it too (`FieldHead`).
   */
  accepts?: string
  children: React.ReactNode
}) {
  return (
    <div id={id} className="scroll-mt-32">
      <PageSection title={title} aside={accepts !== undefined ? <Accepts>{accepts}</Accepts> : undefined}>
        <Stack gap="normal">{children}</Stack>
      </PageSection>
    </div>
  )
}

/**
 * The line over a field: its name, and what the review has to say about it.
 *
 * **A field that is the only one in its section has no name of its own** — the
 * section's heading is its name, and a second line saying the same word under
 * it is the word read twice (`docs/editing.md` の「編集フォーム」). Such a field
 * still gets this line when there is a mark to hang on it, and nothing at all
 * when there is not. **The dialect badge stands right after the name** — it
 * says what the named thing reads, so it belongs to the name, not to the far
 * end of the row where the row's own delete stands. **A field with no name
 * does not draw it**: a badge alone at the end of an otherwise empty row names
 * nothing, so the heading naming the field carries it instead (`Section` の
 * `accepts`).
 */
export function FieldHead({ label, marks, locale, untranslated = false, accepts, remove }: {
  label?: string
  marks: Marks
  locale: Locale
  untranslated?: boolean
  /** What the box reads what is typed as, said right after the name (`form.tsx` の `Accepts`). Not drawn without a name. */
  accepts?: string
  /**
   * Removes the whole field, at the row's far end — the same place every
   * other row's own delete stands (`ItemCard`). Only a value slot under a
   * catalog key carries one; a field with no key behind it has nothing to
   * remove itself from.
   */
  remove?: { label: string, onClick: () => void }
}) {
  const t = messagesFor(locale).admin.editor
  const says = label !== undefined || untranslated || marks.changed || marks.onTake !== null
    || marks.extra !== undefined || remove !== undefined
  if (!says) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {label !== undefined && <span className="font-semibold text-ink-muted text-xs">{label}</span>}
      {label !== undefined && accepts !== undefined && <Accepts>{accepts}</Accepts>}
      {untranslated && <Badge>{t.untranslated}</Badge>}
      {marks.changed && <Badge tone="accent">{t.changed}</Badge>}
      {marks.onTake !== null && (
        <Button
          type="button"
          variant="secondary"
          size="xs"
          icon={<Icon name="download" aria-hidden="true" />}
          onClick={marks.onTake}
        >
          {t.take}
        </Button>
      )}
      {marks.extra}
      {remove !== undefined && (
        <span className="ml-auto flex items-center">
          <IconButton name="trash" label={remove.label} onClick={remove.onClick} />
        </span>
      )}
    </div>
  )
}

/**
 * What a slot becomes when one of its two marks is pressed: released back to
 * a value if the mark already holds it, taken on otherwise.
 *
 * **Pure**, so the exclusion between the two marks — pressing one always
 * releases the other, and pressing a held one lets go of it — is a fact about
 * this function rather than about how a mark happens to be wired to it.
 */
export function toggledState(state: SlotState, mark: "unknown" | "not-applicable"): SlotState {
  return state === mark ? "value" : mark
}

/**
 * One of the two marks a slot can wear instead of a value: unsettled, or that
 * the question does not apply.
 *
 * **A plain `button`, not `IconButton`.** Pressed, this takes the brand fill
 * that elsewhere means "this is what the screen is asking for"
 * (`docs/ui.md` の「押せるもの」) — the one exception the rule names for
 * itself, because here the fill is reporting what the field already holds
 * rather than asking for anything.
 *
 * **What pressing it does is drawn over it** while it is pointed at or holds
 * focus (`base.tsx` の `TOOLTIP`) — "未確定にする", or "未確定の解除" once it
 * is held. The mark's name stays the state's word, and `aria-pressed` says
 * which way it is, so the sentence is a description rather than a second
 * name. **Not a `title`**: that shows late, and only to a pointer. It hangs
 * from the right edge, being the last thing on its row before the pane's edge.
 */
function StateMark({ icon, label, does, pressed, onClick }: {
  icon: IconName
  label: string
  /** What pressing it does now: takes the mark on, or lets go of it. */
  does: string
  pressed: boolean
  onClick: () => void
}) {
  const doesId = useId()
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-pressed={pressed}
        aria-label={label}
        aria-describedby={doesId}
        onClick={onClick}
        className={`inline-flex size-tap shrink-0 cursor-pointer items-center justify-center rounded transition-colors ${
          pressed ? "bg-brand text-white" : "text-ink-muted hover:bg-surface-hover hover:text-ink"
        }`}
      >
        <Icon name={icon} aria-hidden="true" />
      </button>
      <span id={doesId} role="tooltip" className={`${TOOLTIP} right-0 group-has-focus-visible:block group-hover:block`}>
        {does}
      </span>
    </span>
  )
}

/**
 * The two marks a slot can wear instead of a value: unsettled, or that the
 * question does not apply.
 *
 * **Both always shown, and mutually exclusive.** A writer cannot be left to
 * find them behind a folded menu, and pressing one releases the other — a
 * slot wears at most one of the two at a time. **The ordinary answer, a
 * value, wears neither** — there is a pair of these per language of every
 * field, so a screen holds dozens, and filling one for the ordinary answer
 * too would bury the one control that saves (`docs/ui.md` の「押せるもの」).
 */
export function StateSwitch({ state, onChange, locale }: {
  state: SlotState
  onChange: (next: SlotState) => void
  locale: Locale
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <span role="group" aria-label={t.statesLabel} className="inline-flex items-center gap-1">
      <StateMark
        icon="help-circle"
        label={t.stateChoice.unknown}
        does={state === "unknown" ? t.stateRelease.unknown : t.stateTake.unknown}
        pressed={state === "unknown"}
        onClick={() => { onChange(toggledState(state, "unknown")) }}
      />
      <StateMark
        icon="circle-slash"
        label={t.stateChoice["not-applicable"]}
        does={state === "not-applicable" ? t.stateRelease["not-applicable"] : t.stateTake["not-applicable"]}
        pressed={state === "not-applicable"}
        onClick={() => { onChange(toggledState(state, "not-applicable")) }}
      />
    </span>
  )
}

/** The shape `SlotEditor` folds a box down to once a mark is pressed. */
const FOLDED_SLOT = "flex h-9 items-center rounded border border-line bg-surface px-2 text-ink-muted text-sm"

/**
 * One language of one field. The text stays in state whatever the state says,
 * so switching to "unsettled" and back gives the half-written value back.
 *
 * **Marked with a state, the box folds** (`docs/admin-ui.md` の「欄の状態」) —
 * in its place stands one line naming the state. The box leaves the DOM, but
 * `value.text` does not: it is state held by the caller, untouched until the
 * mark is pressed again or the field is saved.
 */
export function SlotEditor({ language, named = true, value, multiline, onChange, locale }: {
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
}) {
  const t = messagesFor(locale).admin.editor
  const settled = value.state === "value"
  const classes = `${CONTROL} w-full text-sm`

  /*
    **One language is one line: the box, with its state mark at the side.** The
    language stands in a gutter to the left and the mark to the right, level
    with the box's first line. Stacked over the box, the two took a line of
    their own for every language of every field, and a form of forty boxes was
    half labels.
  */
  return (
    <div className={`grid items-start gap-x-2 gap-y-1 ${named ? "grid-cols-[1.5rem_1fr_auto]" : "grid-cols-[1fr_auto]"}`}>
      {named && <LanguageMark language={language} tall />}
      {settled
        ? (
            multiline === true
              ? (
                  <textarea
                    className={classes}
                    rows={4}
                    lang={language}
                    value={value.text}
                    onChange={(event) => { onChange({ ...value, text: event.target.value }) }}
                  />
                )
              : (
                  <input
                    type="text"
                    className={classes}
                    lang={language}
                    value={value.text}
                    onChange={(event) => { onChange({ ...value, text: event.target.value }) }}
                  />
                )
          )
        : <div className={FOLDED_SLOT}>{t.stateChoice[value.state]}</div>}
      <span className="flex h-9 items-center">
        <StateSwitch
          state={value.state}
          onChange={(state) => { onChange({ ...value, state }) }}
          locale={locale}
        />
      </span>
    </div>
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
export function PairField({ label, value, multiline, marks, locale, onChange, remove }: {
  /** Absent for the one field of a section, which the section's heading names. */
  label?: string
  value: TextPairInput
  multiline?: boolean
  marks: Marks
  locale: Locale
  onChange: (next: TextPairInput) => void
  remove?: { label: string, onClick: () => void }
}) {
  // **What the box takes is said on the name row, not beside the box** — a
  // curator who knows the field is prose does not need it said once per
  // language, and the row is where a reader already looks for what a field is.
  const accepts = multiline === true ? messagesFor(locale).admin.accepts.prose : undefined

  return (
    <Stack gap="tight" at={marks.at}>
      <FieldHead
        label={label}
        marks={marks}
        locale={locale}
        untranslated={isUntranslated(value)}
        accepts={accepts}
        remove={remove}
      />
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
            onChange={(next) => { onChange({ ...value, [language]: next }) }}
          />
        ))}
      </div>
    </Stack>
  )
}

/** A field with one value and no languages: an identifier, an address, a DOI. */
export function SingleField({ label, value, marks, locale, onChange }: {
  /** Absent for the one field of a section, which the section's heading names. */
  label?: string
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
          onChange={onChange}
        />
      </div>
    </Stack>
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
            <IconButton name="trash" label={t.remove} onClick={onRemove} />
          </div>
        </div>
        {children}
      </Stack>
    </div>
  )
}

/** One column of the table a list of elements stands as: its name, and what of an element it shows. */
export interface ItemColumn<T> {
  header: string
  cell: (item: T) => React.ReactNode
}

/**
 * A list of one kind of thing, each element written in a panel of its own.
 *
 * **The table says what the elements are; the panel holds what is in one.**
 * Four of these lists stand in one screen and an element carries up to eight
 * fields, so drawn open they are a hundred boxes deep and what the list itself
 * says — how many, in what order, which is which — is buried in them. Opened
 * one at a time, the shape of the list stays readable and the element being
 * written in has the width of a panel rather than the width left over beside
 * its neighbours.
 *
 * **The columns are the ones the public page gives the same list**
 * (`docs/ui.md` の「繰り返しの要素」), so the table reads against the page
 * beside it and two elements with alike names are told apart by the rest.
 * A row that boxed one name in a card's edge said no more than a table row
 * and could not be compared. **Values wrap** the way the page's do — cut
 * short, what tells two rows apart is what goes. The first column names the
 * element, so a row with nothing written in it says so there and nowhere else.
 * With no element there is no table: a head over nothing is a table that
 * failed to load.
 *
 * **Adding one opens it.** A new element says nothing on its row, so a list
 * that only appended would leave the reader a blank line to find and open.
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
  columns,
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
  /** What one element is, in a line, for the panel's name. */
  summary: (item: T) => string
  /** The table's columns, the first of which names an element. */
  columns: ItemColumn<T>[]
  onChange: (next: T[]) => void
  makeEmpty: () => T
  children: (item: T, path: string, set: (next: T) => void) => React.ReactNode
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.editor
  const [open, setOpen] = useState<string | null>(null)
  const held = items.find((row) => row.id === open)
  const named = held === undefined ? "" : summary(held).trim()

  return (
    <>
      {items.length > 0 && (
        <Table headers={[...columns.map((column) => column.header), messages.admin.actions]}>
          {items.map((item, at) => (
            <tr key={item.id}>
              {columns.map((column, index) => {
                const drawn = column.cell(item)
                const empty = drawn === "" || drawn === null || drawn === undefined
                return (
                  <Td key={column.header}>
                    {index === 0 && empty ? <span className="text-ink-muted">{t.unnamedElement}</span> : drawn}
                  </Td>
                )
              })}
              <Td nowrap>
                <ItemOperations
                  index={at}
                  count={items.length}
                  locale={locale}
                  onEdit={() => { setOpen(item.id) }}
                  onMove={(by) => { onChange(moved(items, at, by)) }}
                  onRemove={() => { onChange(items.filter((row) => row.id !== item.id)) }}
                />
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <AddElement
        label={t.add}
        onClick={() => {
          const made = makeEmpty()
          onChange([...items, made])
          setOpen(made.id)
        }}
      />
      <Dialog
        title={named === "" ? title : named}
        held={{ open: held !== undefined, close: () => { setOpen(null) } }}
        dismiss={t.done}
      >
        {held === undefined
          ? null
          : (
              <Stack gap="normal">
                {children(
                  held,
                  `${path}.${held.id}`,
                  (next) => { onChange(replacing(items, held.id, next)) },
                )}
              </Stack>
            )}
      </Dialog>
    </>
  )
}

/**
 * The four things that can be done to one element, at the end of its row.
 *
 * **An element with nothing written in it still has a row.** It is a row of
 * the list like any other — one that can be opened, moved and taken away — and
 * a list that hid it would lose the element somebody just added.
 */
function ItemOperations({ index, count, locale, onEdit, onMove, onRemove }: {
  index: number
  count: number
  locale: Locale
  onEdit: () => void
  onMove: (by: number) => void
  onRemove: () => void
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <span className="flex items-center gap-1">
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
      <IconButton name="trash" label={t.remove} onClick={onRemove} />
    </span>
  )
}

/**
 * The way to add one more of whatever the section holds.
 *
 * **A word's size, not a control's** (`base.tsx` の `BUTTON_SIZE`): it stands
 * under a table or in place of one, acting on the list rather than on any row,
 * and at 36px it read as the section's main control — which is the table.
 */
export function AddElement({ label, onClick }: { label: string, onClick: () => void }) {
  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        size="xs"
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
 * Where this draft differs from the version readers see, and the way to close
 * the gap either way.
 *
 * **One band for one fact.** Which places differ is both the review's mark
 * on the form and the take-in's list — drawn as two bands, "vN differs" read
 * as two facts. **Each place is the way there** (`Chevron`), except the
 * dataset list, which is decided on its own screen and leads there. **Taking
 * all is offered under the list**: it replaces what is held here with the
 * version's, and it is not required — publishing without it is allowed, and
 * the gate lists what that leaves (`docs/editing.md` の「他の版や draft と比べる」).
 */
export function PublishedBand({ locale, number, places, takeCount, onTakeAll }: {
  locale: Locale
  /** The version compared against, for the band to name it. */
  number: number
  /** The places that differ, each as the way there: in place (`go`), or on another screen (`to`). */
  places: { path: string, go?: () => void, to?: string }[]
  /** How many of them the take-in covers — the dataset list is not among them. */
  takeCount: number
  onTakeAll: () => void
}) {
  const t = messagesFor(locale).admin.upstream
  return (
    <Note kind="info">
      <Stack gap="tight">
        <p className="font-semibold">{t.heading(number, places.length)}</p>
        <ul className="flex flex-wrap gap-2">
          {places.map((place) => (
            <li key={place.path}>
              {place.to !== undefined
                ? (
                    <ButtonLink to={place.to} size="xs" icon={<Icon name="database" aria-hidden="true" />}>
                      {place.path}
                    </ButtonLink>
                  )
                : (
                    <Button type="button" variant="secondary" size="xs" icon={<Chevron dir="right" />} onClick={place.go}>
                      {place.path}
                    </Button>
                  )}
            </li>
          ))}
        </ul>
        <p>{t.body}</p>
        {takeCount > 0 && (
          <div>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              icon={<Icon name="download" aria-hidden="true" />}
              onClick={onTakeAll}
            >
              {t.takeAll(takeCount)}
            </Button>
          </div>
        )}
      </Stack>
    </Note>
  )
}
