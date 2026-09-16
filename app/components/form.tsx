/**
 * The controls the management forms are built from.
 *
 * They are plain forms. A row offers save, move and delete side by side, and
 * **which one was pressed is the button's own value** — a form holds one value
 * per name, so a direction cannot be a field of its own without the other
 * button's direction going along with it.
 *
 * Nothing here needs JavaScript. The screens that edit a research do (a state
 * toggle and a merge are moves inside a page), but a catalog row and a document
 * body are a form and a submit.
 *
 * **No control here is marked `required`.** The rules live on the server, where
 * a save is checked against the whole content rather than one box at a time, and
 * a form under `SectionTabs` cannot use the browser's own validation at all: a
 * required field inside a hidden panel cannot be focused, so pressing save does
 * nothing and explains nothing.
 *
 * What a control *looks* like is `base.tsx`, which the public pages draw from
 * as well.
 */

import { createContext, useContext, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { Form } from "react-router"

import {
  Badge,
  Button,
  type ButtonSize,
  type ButtonVariant,
  IconButton,
  Note,
  Toast,
  TOAST_MS,
} from "~/components/base"
import { Icon } from "~/components/icons"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

/**
 * What anything typed into looks like.
 *
 * **The edge is a requirement rather than a preference**: the border of
 * something you can type into has to reach 3:1 against the page, which is why
 * it is `line-strong` and not `line` ([ui.md](../../docs/ui.md)). A screen that
 * writes its own input class gets that wrong by one word and nothing catches it
 * — so the screens that cannot use `Field` (a refinement panel names its boxes
 * with `aria-label` rather than a visible label) take this string instead.
 *
 * **This is the edge of what you type into, not of what you operate.** A
 * control you press or choose from takes `base.tsx` の `LISTING_CONTROL`, and
 * the search box takes neither — it is drawn without an edge at all
 * (`search.tsx`), being a filled pill with a coloured button in it.
 */
const CONTROL_EDGE = "border border-line-strong bg-surface-input text-ink"

/**
 * **The focus ring is drawn over the edge rather than outside it.** Everywhere
 * else the ring stands off the element by 2px, which reads as a ring; on
 * something that already has a border it draws a second line 2px away from the
 * first. The row of an input is 36.4px tall (`text-sm` carries a line of 22.4),
 * so the two lines land on different fractions of a physical pixel and the pair
 * reads as misaligned rather than as one control. Over the edge it is one line.
 *
 * **The depth is the one a button stands at.** A field and the button that
 * submits it share a row, and a row is one height (`docs/ui.md` の「押せるものの
 * 大きさ」): at 4px of padding the field sat 32.4px against the button's 36.4px
 * and the pair read as a step rather than as a row.
 */
export const CONTROL = `${CONTROL_EDGE} rounded px-2 py-1.5 focus-visible:-outline-offset-1`

/**
 * What a box reads as syntax, said beside its name.
 *
 * **A box without one takes what is typed as the value.** A memo, a title, a
 * line carried over from an application — nothing in them is read, and naming
 * the plain ones would put a word on nearly every box and leave the few that
 * parse no easier to find.
 *
 * **The word is the dialect, not the family.** Two are in use and they are not
 * the same: an article body takes the whole of markdown, and a research's prose
 * takes links and line breaks and refuses the rest at the save
 * (`content/parse.server.ts`). One word over both would be wrong on one of them.
 *
 * **Nothing opens from it.** What each dialect allows is short enough to be the
 * word itself, so a control here would only be a second way to read it.
 */
export function Accepts({ children }: { children: string }) {
  return <Badge tone="muted">{children}</Badge>
}

/**
 * The frame every input sits in: what it is called, what it has to look like,
 * and what was wrong with it.
 *
 * The label is tied to the control by id rather than by wrapping it, because a
 * checkbox wants its label after it and everything else wants it before.
 */
function Labelled({
  id,
  label,
  icon,
  accepts,
  after,
  hint,
  error,
  children,
  inline = false,
  hideLabel = false,
}: {
  id: string
  label: string
  /**
   * A glyph in front of the word, where the word is one of a set the reader is
   * already being shown the glyph for somewhere else.
   *
   * **It rides inside the label** rather than beside it, so that pressing the
   * glyph is pressing the control and a long name wraps under itself rather
   * than around a picture.
   */
  icon?: ReactNode
  /**
   * The dialect the box reads what is typed as.
   *
   * **It rides inside the label**, for the same reason the glyph does: it is
   * part of what the box is called, and a reader who hears the name hears
   * which syntax goes in it.
   */
  accepts?: string
  /**
   * What stands at the far end of the row, opposite the label.
   *
   * **Only an inline control has one.** It is the far end of the label's own
   * line, and a stacked control's label is a heading over a box rather than one
   * side of a row.
   */
  after?: ReactNode
  hint?: string
  error?: string
  children: ReactNode
  inline?: boolean
  hideLabel?: boolean
}) {
  /**
   * **A hidden name is still a name.** In a row where the control stands beside
   * the button that acts on it, a label above the box makes the row two lines
   * tall and nothing lines up with anything; the word is still read out, and
   * still what clicking it focuses.
   */
  if (hideLabel) {
    return (
      <div className="text-sm">
        <label htmlFor={id} className="sr-only">{label}</label>
        {children}
        {error !== undefined && (
          <span id={`${id}-error`} className="sr-only">{error}</span>
        )}
      </div>
    )
  }
  return (
    <div className={inline ? "flex items-start gap-2 text-sm" : "flex flex-col gap-2 text-sm"}>
      {inline
        ? (
            <>
              {children}
              {/* The label takes the room between the control and whatever is
                  at the far end, so that end lands on the edge of the row
                  rather than beside a word of whatever length. */}
              <label htmlFor={id} className={`text-ink ${after === undefined ? "" : "flex-1"}`}>
                {icon}
                {label}
              </label>
              {after}
            </>
          )
        : (
            <>
              <label
                htmlFor={id}
                className="flex items-center gap-2 font-semibold text-ink-muted text-xs"
              >
                {label}
                {accepts !== undefined && <Accepts>{accepts}</Accepts>}
              </label>
              {children}
            </>
          )}
      {hint !== undefined && <span className="text-ink-muted text-xs">{hint}</span>}
      {error !== undefined && (
        <span id={`${id}-error`} className="flex items-center gap-1 text-danger text-xs">
          <Icon name="alert" />
          {error}
        </span>
      )}
    </div>
  )
}

/** What every control passes through: naming, help, and the state it is in. */
interface FieldLook {
  label: string
  name: string
  hint?: string
  error?: string
  disabled?: boolean
}

function invalid(id: string, error?: string) {
  return error === undefined
    ? {}
    : { "aria-invalid": true, "aria-describedby": `${id}-error` }
}

function edge(error?: string) {
  return error === undefined ? "" : "border-danger"
}

export function Field({
  label,
  name,
  value,
  hint,
  error,
  disabled,
  width = "w-48",
  type = "text",
  placeholder,
  pattern,
  hideLabel = false,
}: FieldLook & {
  value?: string
  width?: string
  /** `text` unless the value has a shape the browser can help with. */
  type?: "text" | "email" | "url" | "number" | "date" | "search"
  /**
   * **The shape of the value, shown inside the empty box.** It is an example
   * rather than help, so it belongs where what is typed will appear and not in
   * a line under the box, where it reads as a rule about the value.
   */
  placeholder?: string
  /**
   * The shape the value has to have. **The server checks it too** — this only
   * saves the round trip and says so before the box is left.
   */
  pattern?: string
  /** For a row where a visible label would leave nothing lined up with it. */
  hideLabel?: boolean
}) {
  const id = useId()
  return (
    <Labelled id={id} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <input
        id={id}
        type={type}
        name={name}
        defaultValue={value}
        disabled={disabled}
        placeholder={placeholder}
        pattern={pattern}
        title={pattern === undefined ? undefined : label}
        className={`${CONTROL} ${width} ${edge(error)} disabled:opacity-50`}
        {...invalid(id, error)}
      />
    </Labelled>
  )
}

/**
 * The two faces a box of several lines can take.
 *
 * **`source` is for a body whose punctuation is structure.** A pipe stands in a
 * column of a table, a backslash holds a character back from being read, and
 * two spaces at the end of a line are a line break — none of which can be
 * proof-read in a proportional face, where the columns do not line up and the
 * trailing spaces are invisible. It is the smaller of the two on purpose: a
 * long article is scrolled through, and a monospaced 14px line wraps a third
 * sooner than the prose it stands for.
 *
 * **`plain` is for a value that is read as it is typed.** Nothing in it is
 * syntax, so the face has no work to do, and the box usually stands beside
 * prose it is being compared with — a different size and a different face there
 * makes two readings of one sentence look like two sentences.
 */
const TEXTAREA_LOOK = {
  source: "font-mono text-xs",
  plain: "text-sm",
} as const

/** A body, written as it will be stored. */
export function TextArea({
  label,
  name,
  value,
  accepts,
  hint,
  error,
  disabled,
  look = "source",
  rows = 16,
}: FieldLook & {
  value?: string
  accepts?: string
  look?: keyof typeof TEXTAREA_LOOK
  rows?: number
}) {
  const id = useId()
  return (
    <Labelled id={id} label={label} accepts={accepts} hint={hint} error={error}>
      <textarea
        id={id}
        name={name}
        defaultValue={value}
        rows={rows}
        disabled={disabled}
        spellCheck={false}
        className={`${CONTROL} w-full ${TEXTAREA_LOOK[look]} ${edge(error)} disabled:opacity-50`}
        {...invalid(id, error)}
      />
    </Labelled>
  )
}

/** One of a fixed, short list. Anything longer is a search box over a catalog. */
export function Select({ label, name, value, options, hint, error, disabled }: FieldLook & {
  value?: string
  options: { value: string, label: string }[]
}) {
  const id = useId()
  return (
    <Labelled id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        name={name}
        defaultValue={value}
        disabled={disabled}
        className={`${CONTROL} ${edge(error)} disabled:opacity-50`}
        {...invalid(id, error)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </Labelled>
  )
}

export function Checkbox({ label, icon, name, value, checked, count, hint, error, disabled }: FieldLook & {
  value?: string
  checked?: boolean
  /** A glyph in front of the word — see `Labelled`. */
  icon?: ReactNode
  /**
   * How many rows this choice would leave, where the box is one value of a
   * listing's refinement.
   *
   * **The number alone**, drawn the way the public panel draws it
   * (`components/facets.tsx`): a word after it would be read as part of the
   * value's name, and what the eye compares is the column of figures, so the
   * digits are set in the one face where they are all the same width.
   */
  count?: number
}) {
  const id = useId()
  return (
    <Labelled
      id={id}
      label={label}
      icon={icon}
      after={count === undefined
        ? undefined
        : <span className="shrink-0 font-mono text-ink-muted text-xs">{count}</span>}
      hint={hint}
      error={error}
      inline
    >
      {/* **The box takes a line's height and centres in it** (`MARK`, the same
          box the table's ticks stand in). The row is aligned to its top so that
          a label running to two lines keeps the box on the first of them, and a
          16px box left in that corner sits above the word beside it — 3.2px,
          which is the half of the line it does not fill. */}
      <span className={MARK}>
        <input
          id={id}
          type="checkbox"
          name={name}
          value={value}
          defaultChecked={checked}
          disabled={disabled}
          className="size-4 accent-brand disabled:opacity-50"
          {...invalid(id, error)}
        />
      </span>
    </Labelled>
  )
}

/**
 * One of a few, all of them visible.
 *
 * A `<fieldset>` rather than a set of labelled boxes, so that the question the
 * options answer is announced once instead of repeated on each of them.
 */
export function RadioGroup({ label, name, value, options, hint, disabled }: {
  label: string
  name: string
  value?: string
  options: { value: string, label: string }[]
  hint?: string
  disabled?: boolean
}) {
  return (
    <fieldset className="flex flex-col gap-2 text-sm" disabled={disabled}>
      <legend className="font-semibold text-ink-muted text-xs">{label}</legend>
      <div className="flex flex-wrap gap-4">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-1.5">
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={option.value === value}
              className="size-4 accent-brand"
            />
            {option.label}
          </label>
        ))}
      </div>
      {hint !== undefined && <span className="text-ink-muted text-xs">{hint}</span>}
    </fieldset>
  )
}

/**
 * Choosing a file to send.
 *
 * The bytes never pass through the application — the browser puts them into the
 * store with a signed URL — so this is a chooser and nothing else
 * (`docs/data-model.md` の「ファイル」).
 *
 * **The browser's own control is put away and a button drives it.** Left as it
 * comes, a file input draws a button the page cannot reach — its face has to be
 * spelled a second time through `file:` pseudo-elements, and beside it the
 * browser writes its own words in its own language ("選択されていません"), which
 * says nothing about which file this field wants. Hidden, the input keeps doing
 * the work and the page says what was chosen (`docs/ui.md` の「押せるもの」).
 *
 * **It asks for nothing through the browser's validation.** A hidden control
 * cannot be focused, so a `required` on it refuses the form with nowhere to put
 * the reader — the same trap a required field inside a folded panel is
 * (`docs/ui.md` の「壊れるもの」). A field that has to be filled is said by the
 * screen: the send stays disabled until it is.
 */
export function FileField({
  label,
  name,
  hint,
  error,
  disabled,
  locale,
  multiple = false,
  accept,
  onChoose,
}: FieldLook & {
  locale: Locale
  multiple?: boolean
  /** What the browser offers, where the field takes one kind of file. */
  accept?: string
  /** For a screen that holds what was chosen rather than posting the form. */
  onChoose?: (files: File[]) => void
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const t = messagesFor(locale).admin.files
  return (
    <Labelled id={id} label={label} hint={hint} error={error}>
      <span className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          id={id}
          type="file"
          name={name}
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          hidden
          onChange={(event) => {
            const files = [...event.target.files ?? []]
            setChosen(files.map((file) => file.name))
            onChoose?.(files)
          }}
          {...invalid(id, error)}
        />
        <Button
          type="button"
          icon={<Icon name="file" />}
          disabled={disabled}
          onClick={() => { input.current?.click() }}
        >
          {t.chooseFiles}
        </Button>
        {/* **What was chosen, in the page's own words.** A chooser that says
            nothing leaves the reader pressing it again to find out. */}
        <span className={chosen.length === 0 ? "text-ink-muted text-sm" : "text-sm"}>
          {chosen.length === 0 ? t.noFileChosen : chosen.join(" / ")}
        </span>
      </span>
    </Labelled>
  )
}

/**
 * A translated pair, side by side.
 *
 * The two languages are one field with two values, not two fields, and putting
 * them beside each other is what makes a missing translation visible without
 * anything having to say so.
 */
export function BilingualField({ label, name, ja, en, hint, error, disabled }: FieldLook & {
  ja?: string
  en?: string
}) {
  return (
    <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      <Field
        label={`${label} (ja)`}
        name={`${name}.ja`}
        value={ja}
        hint={hint}
        error={error}
        disabled={disabled}
        width="w-full"
      />
      <Field
        label={`${label} (en)`}
        name={`${name}.en`}
        value={en}
        disabled={disabled}
        width="w-full"
      />
    </div>
  )
}

/**
 * A checkbox standing on its own in a table cell.
 *
 * **It takes one line's height and sits in the middle of it**, so that it lands
 * where a word in the next column lands. A box is 13px against a line of 22.4px
 * and, left inline, sits on the baseline of prose that is not there: 1.5px above
 * the words beside it down the rows and 1.7px above them in the band, measured.
 * Either reads as the table being out of true rather than as anything a reader
 * can point at.
 *
 * **A line's height rather than a number**, because what it has to match is the
 * height the cell beside it is already using.
 */
const MARK = "flex h-[1lh] items-center"

/**
 * The checkbox at the head of a column of checkboxes.
 *
 * It works on the form's own elements rather than on state, because the boxes
 * it turns on and off are uncontrolled: the form posts what is ticked and
 * nothing on the page reads the ticks before it is submitted. Holding them in
 * state would re-render the whole table on every tick to no end.
 */
export function SelectAll({ name, label }: { name: string, label: string }) {
  return (
    <span className={MARK}>
      <input
        type="checkbox"
        aria-label={label}
        onChange={(event) => {
          const form = event.currentTarget.form
          if (form === null) return
          const checked = event.currentTarget.checked
          const boxes = form.querySelectorAll<HTMLInputElement>(
            `input[type="checkbox"][name="${name}"]`,
          )
          for (const box of boxes) box.checked = checked
        }}
      />
    </span>
  )
}

/**
 * One line's own box, in a column headed by a `SelectAll`.
 *
 * **The value is the name it announces itself by.** A column of boxes all
 * saying "select" tells a reader who cannot see the row which column they are
 * in and nothing about which line they are on.
 */
export function SelectOne({ name, value }: { name: string, value: string }) {
  return (
    <span className={MARK}>
      <input type="checkbox" name={name} value={value} aria-label={value} />
    </span>
  )
}

/** Whether anything in the form has been typed into since it was loaded. */
const Changed = createContext<boolean | undefined>(undefined)

/**
 * Whether a form holds anything that has not been sent.
 *
 * **The browser already knows.** Every control keeps what it was loaded with
 * (`defaultValue`, `defaultChecked`), so the answer is a walk over the form
 * rather than a copy of the row held in state and compared field by field —
 * which is a second place for the screen's own values to live.
 *
 * Hidden fields are left out: they carry the id and the revision, which the
 * reader cannot type into.
 */
function changedIn(form: HTMLFormElement): boolean {
  for (const element of form.elements) {
    if (element instanceof HTMLTextAreaElement) {
      if (element.defaultValue !== element.value) return true
    } else if (element instanceof HTMLSelectElement) {
      if ([...element.options].some((one) => one.defaultSelected !== one.selected)) return true
    } else if (element instanceof HTMLInputElement) {
      if (element.type === "checkbox" || element.type === "radio") {
        if (element.defaultChecked !== element.checked) return true
      } else if (element.type !== "hidden" && element.defaultValue !== element.value) {
        return true
      }
    }
  }
  return false
}

/**
 * A form that knows whether it is holding anything unsent.
 *
 * **What it knows is passed down rather than up.** The control that has to
 * change is the save, which stands at the foot of whatever the form holds; a
 * screen that had to thread the answer from its boxes to that button would
 * write the same three lines on every screen that saves anything.
 */
export function Editing({ children, onInput, ...rest }: ComponentProps<typeof Form>) {
  const [changed, setChanged] = useState(false)
  return (
    <Form
      {...rest}
      onInput={(event) => {
        setChanged(changedIn(event.currentTarget))
        onInput?.(event)
      }}
    >
      <Changed.Provider value={changed}>{children}</Changed.Provider>
    </Form>
  )
}

/**
 * That there is unsent work, said beside the control that sends it.
 *
 * **The face of the save says the same thing to anybody looking at it**, and
 * this is what says it to anybody who is not. It is a live region, so it is
 * read at the moment the first character is typed rather than when the reader
 * next happens to move the focus there.
 */
export function Unsaved({ locale }: { locale: Locale }) {
  const changed = useContext(Changed)
  return (
    <span role="status" className="text-xs">
      {changed === true && (
        <span className="text-accent">{messagesFor(locale).admin.editor.unsaved}</span>
      )}
    </span>
  )
}

export function Submit({
  children,
  intent,
  variant = "secondary",
  size,
  disabled,
  icon,
  className,
  saves = false,
}: {
  children: ReactNode
  intent?: string
  variant?: ButtonVariant
  /** Passed on to `Button`, for a save that stands in a row of `xs` controls. */
  size?: ButtonSize
  disabled?: boolean
  /** Passed on to `Button`, for a row where the links beside it carry one. */
  icon?: ReactNode
  /**
   * Passed on to `Button`, for the one thing a button cannot work out for
   * itself: how wide it is. **A control whose word changes with the state** —
   * show and hide, publish and take down — is two widths in one place, and
   * everything to the right of it moves when it is pressed.
   */
  className?: string
  /**
   * Whether this is the button that sends what has been typed.
   *
   * **A save answers the state of the form rather than standing still.** With
   * nothing typed there is nothing to send, so it cannot be pressed; with
   * something typed it is the one thing on the screen that has to be pressed
   * before the reader leaves, so it wears the accent. Outside `Editing` it is
   * an ordinary submit — a form that never loads a value has nothing to compare
   * against.
   */
  saves?: boolean
}) {
  const changed = useContext(Changed)
  const waiting = saves && changed === true
  return (
    <Button
      type="submit"
      variant={waiting ? "accent" : variant}
      size={size}
      disabled={disabled === true || (saves && changed === false)}
      icon={icon}
      className={className}
      name={intent === undefined ? undefined : "intent"}
      value={intent}
    >
      {children}
    </Button>
  )
}

/**
 * What a form did, said once at the top of the screen.
 *
 * It is a `Note` that announces itself when it appears: a save that answers on
 * the same page is otherwise silent to anybody not watching that corner. The
 * box it is drawn in is the one every other remark uses, rather than its own
 * arrangement of the same glyph, border and text.
 *
 * **It carries no margin and no width.** It is drawn inside `Answered`, which
 * decides where it stands and how wide it gets.
 */
export function Result({ ok, children }: { ok: boolean, children: ReactNode }) {
  const dismiss = useContext(Dismiss)
  return <Note kind={ok ? "done" : "danger"} live action={dismiss}>{children}</Note>
}

/** The way to put the answer away, handed to the `Result` inside it. */
const Dismiss = createContext<ReactNode>(undefined)

/**
 * The answer to the last thing that was sent, over the screen rather than in it.
 *
 * **It does not stand in the page it is about.** An answer written into the
 * screen takes a strip of the card above the thing that was just edited, so a
 * save pushes the form down by the height of its own confirmation and the
 * reader loses the line they were on. Over the page nothing moves, and the
 * answer is in the same place on every screen that gives one — which is the
 * corner the public side already answers in when a dataset is marked.
 *
 * **It waits while it is being read.** The timer is held off while a pointer is
 * over the box or the focus is inside it.
 *
 * **What is passed in is the response, not a flag.** A screen whose answer is
 * only worth showing half the time (a publish that answers with nothing when it
 * worked) hands over what it wants shown, and nothing arrives here that the
 * screen had not decided to say.
 */
export function Answered({ answer, locale, children }: {
  /** The last response. A new one raises the box; `null` and `undefined` do not. */
  answer: unknown
  locale: Locale
  children: ReactNode
}) {
  const messages = messagesFor(locale)
  // **Which answer this is, not whether one is up.** Two saves in a row answer
  // with the same words, and a box that was already standing would not come in
  // again — so they are counted, and the box is keyed by the count. Nought is
  // nothing to say.
  // **An answer that is already in hand is up in the first drawing of the
  // screen**, rather than raised afterwards: a form posted without JavaScript
  // comes back as a whole page, and a box that waits for an effect is one such
  // a reader never sees.
  const [nth, setNth] = useState(answer === undefined || answer === null ? 0 : 1)
  const [answered, setAnswered] = useState(answer)
  const [reading, setReading] = useState(false)

  // A new answer is noticed while rendering rather than after it: an effect
  // would draw the screen once with the answer already in hand and the box not
  // yet up.
  if (answered !== answer) {
    setAnswered(answer)
    setNth(answer === undefined || answer === null ? 0 : nth + 1)
  }

  useEffect(() => {
    if (nth === 0 || reading) return
    const timer = window.setTimeout(() => {
      setNth(0)
    }, TOAST_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [nth, reading])

  return (
    <Toast label={messages.admin.notice} announce="" at="head">
      {nth === 0
        ? undefined
        : (
            <div
              key={nth}
              onPointerEnter={() => { setReading(true) }}
              onPointerLeave={() => { setReading(false) }}
              onFocusCapture={() => { setReading(true) }}
              onBlurCapture={() => { setReading(false) }}
            >
              <Dismiss.Provider
                value={(
                  <IconButton
                    name="close"
                    label={messages.admin.dismissNotice}
                    onClick={() => { setNth(0) }}
                  />
                )}
              >
                {children}
              </Dismiss.Provider>
            </div>
          )}
    </Toast>
  )
}
