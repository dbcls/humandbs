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
 * distances between them are `Stack`'s three.
 */

import type { LinksPairInput, SlotState, TextInput, TextPairInput } from "~/admin/form"
import { useId, useState } from "react"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { Button, ButtonLink, Chevron, Dialog, IconButton, Note, PANE_LABEL, ReorderButtons, Stack, TOOLTIP } from "./base"
import { Accepts, CONTROL } from "./form"
import { Icon, type IconName } from "./icons"
import { Section as PageSection, Table, Td } from "./page"
import { Flag } from "./flags"

/**
 * Which language a box or a line holds, said as the code beside it.
 *
 * **At the size of the words it stands beside** (14px). Drawn smaller it reads
 * as an annotation to skim past, where it is the one thing that tells the two
 * boxes of a field apart. **Written once**, so the editor's own rows and the
 * read-only listings say it the same way.
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
  /** Somebody saved this field elsewhere after the screen was opened (a refused save's list). */
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
export function Section({ id, title, accepts, flags, remove, children }: {
  id: string
  title: string
  /**
   * What the section's one field reads what is typed as (`form.tsx` の
   * `Accepts`). A field with no name of its own has no row to say it on, so the
   * heading that names the field says it, right beside the name — where a
   * named field says it too (`FieldHead`).
   */
  accepts?: string
  /**
   * What the review says about that one field (`FieldFlags`), standing on the
   * heading's line after the dialect badge — for the same reason the badge
   * does: the field has no name row of its own, and a row holding only the
   * flags names nothing.
   */
  flags?: React.ReactNode
  /**
   * Removes the section's one field, at the far end of the heading's line —
   * the place a named field's own delete stands on its name row (`FieldHead`).
   */
  remove?: { label: string, onClick: () => void }
  children: React.ReactNode
}) {
  const aside = accepts === undefined && flags === undefined && remove === undefined
    ? undefined
    : (
        <>
          {accepts !== undefined && <Accepts>{accepts}</Accepts>}
          {flags}
          {remove !== undefined && (
            <span className="ml-auto flex items-center">
              <IconButton name="trash" label={remove.label} onClick={remove.onClick} />
            </span>
          )}
        </>
      )
  return (
    <div id={id} className="scroll-mt-32">
      <PageSection title={title} aside={aside}>
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
 * it is the word read twice. **Such a
 * field draws no line at all**: its dialect badge and its flags stand on the
 * heading's line instead (`Section` の `accepts` と `flags`) — a row holding
 * only flags names nothing, and pushes the box a line down from its name.
 * **The dialect badge stands right after the name** — it says what the named
 * thing reads, so it belongs to the name, not to the far end of the row where
 * the row's own delete stands.
 */
export function FieldHead({ label, marks, locale, untranslated = false, accepts, way, remove }: {
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
  /** A way to the screen where what the field chooses from is kept, before the delete. */
  way?: React.ReactNode
}) {
  if (label === undefined) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={PANE_LABEL}>{label}</span>
      {accepts !== undefined && <Accepts>{accepts}</Accepts>}
      <FieldFlags marks={marks} locale={locale} untranslated={untranslated} />
      {(way !== undefined || remove !== undefined) && (
        <span className="ml-auto flex items-center gap-2">
          {way}
          {remove !== undefined && <IconButton name="trash" label={remove.label} onClick={remove.onClick} />}
        </span>
      )}
    </div>
  )
}

/**
 * What the review says about one field: that one language is missing, and
 * whatever the field's marks carry. Drawn on the field's name row, or — for a
 * field with no name — on its section's heading (`Section` の `flags`).
 */
export function FieldFlags({ marks, locale, untranslated = false }: {
  marks: Marks
  locale: Locale
  untranslated?: boolean
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <>
      {untranslated && <Flag kind="short">{t.untranslated}</Flag>}
      {marks.changed && <Flag kind="conflicted">{t.changedElsewhere}</Flag>}
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
    </>
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
 * **Pressed, it takes the brand fill** (`IconButton` の `fill`) that elsewhere
 * means "this is what the screen is asking for" — the one exception the rule
 * names for itself, because here the fill is reporting what the field already
 * holds rather than asking for anything.
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
    <span className="group/tip relative inline-flex">
      <IconButton
        name={icon}
        label={label}
        pressed={pressed}
        fill
        titled={false}
        aria-describedby={doesId}
        onClick={onClick}
      />
      <span id={doesId} role="tooltip" className={`${TOOLTIP} right-0 group-has-focus-visible/tip:block group-hover/tip:block`}>
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
 * too would bury the one control that saves.
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
 * **Marked with a state, the box folds** — in its place stands one line
 * naming the state. The box leaves the DOM, but
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
                  // **As tall as what is written in it**, from two lines up: a one-line
                  // value in a four-line box made an experiment's form mostly
                  // empty boxes. A browser that cannot size to the content keeps
                  // the four rows.
                  <textarea
                    className={`${classes} field-sizing-content min-h-[calc(2lh+0.75rem+2px)]`}
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
 * **Not `form.tsx`'s `LanguagePair`**, which stacks a plain form's two fields
 * with no state beside them. A draft is held in React state so that a refused
 * save can be answered field by field, and half of these run to several lines.
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
          wider. */}
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

/**
 * A field with one value and no languages: an identifier, an address, a DOI.
 *
 * **An identifier is held to the width it needs; a title or an address takes
 * the row** (`wide`). A short box says "a short value goes here", which is
 * right for an ID and wrong for a paper's title or a URL, whose end the writer
 * could then not see.
 */
export function SingleField({ label, value, marks, locale, wide = false, hint, onChange }: {
  /** Absent for the one field of a section, which the section's heading names. */
  label?: string
  value: TextInput
  marks: Marks
  locale: Locale
  /** Whether the box takes the whole row: a title, an address. */
  wide?: boolean
  /** What to put in the box and how, said under it. */
  hint?: string
  onChange: (next: TextInput) => void
}) {
  return (
    <Stack gap="tight" at={marks.at}>
      <FieldHead label={label} marks={marks} locale={locale} />
      <div className={wide ? "" : "md:max-w-md"}>
        <SlotEditor
          language={locale}
          named={false}
          value={value}
          locale={locale}
          onChange={onChange}
        />
      </div>
      {hint !== undefined && <span className="text-ink-muted text-xs">{hint}</span>}
    </Stack>
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
 * **The columns are the ones the public page gives the same list**, so the
 * table reads against the page beside it and two elements with alike names
 * are told apart by the rest.
 * A row that boxed one name in a card's edge said no more than a table row
 * and could not be compared. **Values wrap** the way the page's do — cut
 * short, what tells two rows apart is what goes. The first column names the
 * element, so a row with nothing written in it says so there and nowhere else.
 * With no element there is no table: a head over nothing is a table that
 * failed to load.
 *
 * **Adding one opens it.** A new element says nothing on its row, so a list
 * that only appended would leave the reader a blank line to find and open.
 * **Closed with nothing written in it, it goes again** — pressing add and
 * thinking better of it is not asking for an empty row. An element that was
 * already there keeps its row however empty it is.
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
  columns,
  onChange,
  makeEmpty,
  wide = false,
  children,
}: {
  /** What one element's path opens with. */
  path: string
  locale: Locale
  items: T[]
  /**
   * What the list is called. **It names the panel** — 「<list>の追加」 for the
   * element the add button just made, 「<list>の編集」 for one already there —
   * and nothing written in the element does: a name read off the values
   * changes as they are typed, and one element's title three lines long is no
   * name for a panel.
   */
  title: string
  /** The table's columns, the first of which names an element. */
  columns: ItemColumn<T>[]
  onChange: (next: T[]) => void
  makeEmpty: () => T
  /** Whether the panel holds a table and takes the wide measure (`base.tsx` の `Dialog`). */
  wide?: boolean
  children: (item: T, path: string, set: (next: T) => void) => React.ReactNode
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.editor
  const [open, setOpen] = useState<string | null>(null)
  // The element the add button just made, as it was made — gone again if the
  // panel closes with nothing written in it.
  const [made, setMade] = useState<T | null>(null)
  const held = items.find((row) => row.id === open)

  function close(): void {
    const next = keptOnClose(items, made)
    if (next !== items) onChange(next)
    setMade(null)
    setOpen(null)
  }

  return (
    <>
      {items.length > 0 && (
        <Table actions headers={columns.map((column) => column.header)}>
          {items.map((item, at) => (
            // The row is the element's place on the form: a cell of the same
            // list on the page lands here (`form.tsx` の `landAt`), and the
            // row takes the ground a landed box takes.
            <tr key={item.id} data-at={`${path}.${item.id}`} className="transition-colors data-landed:bg-warning-surface">
              {columns.map((column, index) => {
                const drawn = column.cell(item)
                const empty = drawn === "" || drawn === null || drawn === undefined
                if (index !== 0) return <Td key={column.header}>{drawn}</Td>
                const short = shortfallsOf(item)
                return (
                  <Td key={column.header}>
                    <Stack gap="tight">
                      <div>{empty ? <span className="text-ink-muted">{t.unnamedElement}</span> : drawn}</div>
                      {(short.untranslated || short.unsettled) && (
                        <span className="flex flex-wrap gap-1">
                          {short.unsettled && <Flag kind="short">{messages.unsettled}</Flag>}
                          {short.untranslated && <Flag kind="short">{t.untranslated}</Flag>}
                        </span>
                      )}
                    </Stack>
                  </Td>
                )
              })}
              <Td nowrap holds="control">
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
          const empty = makeEmpty()
          onChange([...items, empty])
          setMade(empty)
          setOpen(empty.id)
        }}
      />
      <Dialog
        title={elementPanelTitle(title, held?.id ?? null, made?.id ?? null, locale)}
        held={{ open: held !== undefined, close }}
        dismiss={t.done}
        wide={wide}
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
 * The name of an element's panel: 「<list>の追加」 while it is the element the
 * add button just made, 「<list>の編集」 otherwise. Only the list's own name
 * goes in — never what is written in the element (`ItemList`).
 */
export function elementPanelTitle(list: string, open: string | null, made: string | null, locale: Locale): string {
  const t = messagesFor(locale).admin.editor
  return open !== null && open === made ? t.addElementTitle(list) : t.editElementTitle(list)
}

/**
 * What an element holds that is still short, so its row can say so before its
 * panel is opened: a value marked unsettled anywhere in it, and a text pair
 * with one language written and the other empty (`isUntranslated`). **Read
 * from the element itself** rather than listed per kind of list — the four
 * lists hold different fields, and a field added to one of them is looked at
 * without anyone remembering to add it here. Links are not asked about
 * translation: the two languages of a URL are different resources.
 */
export function shortfallsOf(element: unknown): { untranslated: boolean, unsettled: boolean } {
  const found = { untranslated: false, unsettled: false }
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const one of value) walk(one)
      return
    }
    if (typeof value !== "object" || value === null) return
    const record = value as Record<string, unknown>
    if (record.state === "unknown") found.unsettled = true
    if (isTextPair(record) && isUntranslated(record)) found.untranslated = true
    for (const inner of Object.values(record)) walk(inner)
  }
  walk(element)
  return found
}

function isTextPair(value: Record<string, unknown>): value is TextPairInput & Record<string, unknown> {
  const side = (one: unknown) => typeof one === "object" && one !== null
    && typeof (one as Record<string, unknown>).state === "string"
    && typeof (one as Record<string, unknown>).text === "string"
  return side(value.ja) && side(value.en)
}

/**
 * The list once the panel closes: the element the add button made is dropped
 * when it is still exactly as it was made, and the list is handed back as it
 * is otherwise — the same array, so a caller can tell nothing changed.
 */
export function keptOnClose<T extends { id: string }>(items: T[], made: T | null): T[] {
  if (made === null) return items
  const now = items.find((row) => row.id === made.id)
  if (now === undefined || JSON.stringify(now) !== JSON.stringify(made)) return items
  return items.filter((row) => row.id !== made.id)
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
  const admin = messagesFor(locale).admin
  const t = admin.editor
  return (
    <span className="flex items-center gap-1">
      <IconButton name="edit" label={t.edit} onClick={onEdit} />
      <ReorderButtons
        at={index}
        of={count}
        labels={{ up: admin.moveUp, down: admin.moveDown }}
        onMove={onMove}
      />
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
          <ul className="flex flex-wrap gap-2">
            {changed.map((path) => (
              <li key={path}>
                <ButtonLink external size="row" to={`#${path.split(".")[0] ?? path}`} icon={<Chevron dir="right" />}>
                  {path}
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </Stack>
    </Note>
  )
}
