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
import { Form, useNavigation } from "react-router"

import { scrollPaneTo } from "./scroll"

import {
  Button,
  type ButtonSize,
  type ButtonVariant,
  IconButton,
  MENU_ITEM,
  MENU_ITEM_HERE,
  MENU_PANEL,
  Note,
  PANE_LABEL,
  Stack,
  Toast,
  TOAST_MS,
  useDismissible,
} from "~/components/base"
import { Icon, Spinner } from "~/components/icons"

import type { MountedMarkdown } from "./codemirror.client"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { holdUnsaved } from "~/components/unsaved"
import { usePressed } from "~/navigating"
import { Flag } from "./flags"

/**
 * What anything typed into looks like.
 *
 * **The edge is a requirement rather than a preference**: the border of
 * something you can type into has to reach 3:1 against the page, which is why
 * it is `line-strong` and not `line`. A screen that
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
 * else the ring sits 2px off the element, which reads as a ring; on
 * something that already has a border it draws a second line 2px away from the
 * first. The row of an input is 36.4px tall (`text-sm` has a line of 22.4),
 * so the two lines land on different fractions of a physical pixel and the pair
 * reads as misaligned rather than as one control. Over the edge it is one line.
 *
 * **The depth is the one a button is shown at.** A field and the button that
 * submits it share a row, and a row is one height: at 4px of padding the field
 * sat 32.4px against the button's 36.4px and the pair read as a step rather
 * than as a row.
 */
export const CONTROL = `${CONTROL_EDGE} rounded px-2 py-1.5 focus-visible:-outline-offset-1 data-highlighted:bg-warning-surface`

/**
 * The same box at the height of a table row's buttons (`Button` の `row`), for a
 * box that sits in a row beside them — a box a head taller than the buttons
 * next to it reads as a step, the same as above.
 */
export const CONTROL_ROW = `${CONTROL_EDGE} rounded min-h-6 px-2 py-0.5 text-xs focus-visible:-outline-offset-1`

/**
 * A list's place on the form as a whole, with `data-list` beside its
 * `data-at` — for a value drawn elsewhere that shows the whole list at once,
 * whose elements have no place of their own there (the provider column of the
 * listing's row). Going to it highlights it the way a list's row is
 * (`focusElement`). **The negative margin cancels the padding**, so the
 * background reaches past the words without moving them.
 */
export const LIST_PLACE = "-m-2 flex flex-col gap-4 rounded p-2 transition-colors data-highlighted:bg-warning-surface"

/**
 * Focusing a field from somewhere else on the screen — the page pane, a banner
 * naming a conflict, the published version's differences.
 *
 * **Scrolling is not enough on its own.** An anchor moves the pane to the
 * section and leaves the keyboard where it was, so the eye and the caret end up
 * in different places; what is focused here is the first box in `target` that
 * will take the caret. **The first that will take it, rather than the first in
 * the markup** — the review layer hangs a comment form beside every field, and
 * its own boxes come first while being hidden, collapsed away or otherwise unable
 * to hold the caret. Asking each in turn is what tells the two apart.
 *
 * **The box that took the caret shows it with its background** (`data-highlighted`,
 * `CONTROL`) until the caret leaves. The ring alone did not: it is the same ring
 * every box gets when the caret arrives by Tab, so a jump from the other pane
 * focused without anything on the form indicating where. The ring keeps its one
 * colour, and the background is what differs.
 *
 * Only the pane scrolls, and only up and down (`scroll.ts`).
 */
export function focusElement(target: HTMLElement, block: "start" | "center"): void {
  scrollPaneTo(target, block)
  for (const box of target.querySelectorAll<HTMLElement>("input, textarea")) {
    box.focus({ preventScroll: true })
    if (document.activeElement !== box) continue
    box.dataset.highlighted = ""
    box.addEventListener("blur", () => {
      delete box.dataset.highlighted
    }, { once: true })
    return
  }
  // **A row of a list has no box to type in**: what is in it is written in a
  // panel (`fields.tsx` の `ItemList`). The row takes the background instead, and
  // the caret goes to its first control — the trigger of that panel — so the
  // eye and the keyboard land on the same row. **Nor has a whole list**
  // (`LIST_PLACE`), which is found the same way.
  if (target.tagName !== "TR" && target.dataset.list === undefined) return
  target.querySelector<HTMLElement>("button:not(:disabled)")?.focus({ preventScroll: true })
  target.dataset.highlighted = ""
  const leave = (event: FocusEvent): void => {
    if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return
    delete target.dataset.highlighted
    target.removeEventListener("focusout", leave)
  }
  target.addEventListener("focusout", leave)
}

/**
 * Which of the places the form marks (`data-at`) a field path of the page focuses.
 *
 * **The field when the form draws it open; else the element the field belongs
 * to; else nothing** — a caller then falls back to the section. A cell of a
 * list's table on the page names a field of one element
 * (`grants.<id>.title`), and that field is written in a panel that is not open,
 * so the nearest thing on the form is the element's row (`grants.<id>`).
 */
export function focusTargetPath(path: string, marked: (candidate: string) => boolean): string | null {
  const segments = path.split(".")
  for (let length = segments.length; length >= 1; length -= 1) {
    const candidate = segments.slice(0, length).join(".")
    if (marked(candidate)) return candidate
  }
  return null
}

/**
 * Going to a place from somewhere else on the screen: the field or row
 * `focusTargetPath` finds, brought to the middle, or else the section `section`
 * names, brought to the top.
 *
 * **Only inside the form** (`form`). The page drawn beside it identifies the same
 * places, so a search of the whole document finds the page's own copy when
 * the form is not the one showing — and moves a pane the reader is reading.
 * With no form on screen there is nowhere to go, and nothing moves.
 */
export function focusField(form: HTMLElement | null, path: string, section: string | undefined): void {
  if (form === null) return
  const find = (candidate: string): HTMLElement | null =>
    form.querySelector<HTMLElement>(`[data-at="${CSS.escape(candidate)}"]`)
  const found = focusTargetPath(path, (candidate) => find(candidate) !== null)
  const field = found === null ? null : find(found)
  const target = field ?? (section === undefined ? null : form.querySelector<HTMLElement>(`#${CSS.escape(section)}`))
  if (target === null) return
  // **A field collapsed away is opened first.** A closed `<details>` keeps its
  // boxes in the markup but lets none of them take the caret, so the focus
  // would pass them by and settle on whatever box came first outside the collapsible.
  for (let around = target.parentElement; around !== null && around !== form; around = around.parentElement) {
    if (around instanceof HTMLDetailsElement && !around.open) around.open = true
  }
  focusElement(target, field === null ? "start" : "center")
}

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
  return <Flag kind="notation">{children}</Flag>
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
  required,
  icon,
  accepts,
  after,
  hint,
  error,
  children,
  inline = false,
  hideLabel = false,
  fill = false,
}: {
  id: string
  label: string
  /**
   * The word for anyone not looking at the indicator, where the box has to be
   * filled (`FieldLook`).
   *
   * **The indicator rides on the name itself**, a red `*` hard against the last
   * character, the way every form a reader has filled in draws it. **It is
   * not a badge**: the badge beside a name shows which dialect the box reads,
   * and a second badge there would have to be read before either was known.
   */
  required?: string
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
   * What is shown at the far end of the row, opposite the label.
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
  /**
   * May be shrunk by the column it is shown in, down to the box's own floor.
   * Stacked only.
   *
   * **It does not grow past its content.** Room the column has left goes
   * under whatever is shown last in it — a form's row of buttons — rather than
   * opening between the box and what is written under it.
   */
  fill?: boolean
}) {
  /**
   * **A hidden name is still a name.** In a row where the control is shown beside
   * the button that acts on it, a label above the box makes the row two lines
   * tall and nothing lines up with anything; the word is still read out, and
   * still what clicking it focuses.
   */
  const name = (
    <>
      {label}
      {required !== undefined && (
        <>
          {/* A hair off the last letter: set flush, the asterisk reads as part of the word. */}
          <span aria-hidden="true" className="ml-1 text-danger">*</span>
          <span className="sr-only">{required}</span>
        </>
      )}
    </>
  )
  if (hideLabel) {
    return (
      <div className="text-sm">
        <label htmlFor={id} className="sr-only">{name}</label>
        {children}
        {error !== undefined && (
          <span id={`${id}-error`} className="sr-only">{error}</span>
        )}
      </div>
    )
  }
  return (
    <div className={inline ? "flex items-start gap-2 text-sm" : `flex flex-col gap-2 text-sm${fill ? " min-h-0" : ""}`}>
      {inline
        ? (
            <>
              {children}
              {/* The label takes the room between the control and whatever is
                  at the far end, so that end lands on the edge of the row
                  rather than beside a word of whatever length. */}
              <label htmlFor={id} className={`text-ink ${after === undefined ? "" : "flex-1"}`}>
                {icon}
                {name}
              </label>
              {after}
            </>
          )
        : (
            <>
              <label
                htmlFor={id}
                className={`flex items-center gap-2 ${PANE_LABEL}`}
              >
                <span>{name}</span>
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
  /**
   * That the box has to be filled, as the word read out for it.
   *
   * **What it has to be filled for is what the screen does with it**, which
   * is not always sending the form: an alert is saved with one language and
   * shown only with both, and its two boxes get the indicator for the showing.
   * The server is what refuses either way (`required` is not set on the
   * control); the indicator shows that before anything is pressed.
   */
  required?: string
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
  required,
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
  type?: "text" | "email" | "url" | "number" | "date" | "datetime-local" | "search"
  /**
   * **The shape of the value, shown inside the empty field.** It is an example
   * rather than help, so it belongs where what is typed will appear and not in
   * a line under the box, where it reads as a rule about the value.
   */
  placeholder?: string
  /**
   * The shape the value has to have. **The server checks it too** — this only
   * saves the round trip and shows the problem before the box is left.
   */
  pattern?: string
  /** For a row where a visible label would leave nothing lined up with it. */
  hideLabel?: boolean
}) {
  const id = useId()
  return (
    <Labelled id={id} label={label} required={required} hint={hint} error={error} hideLabel={hideLabel}>
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
 * The two styles a box of several lines can take.
 *
 * **`source` is for a body whose punctuation is structure.** A pipe is shown in a
 * column of a table, a backslash holds a character back from being read, and
 * two spaces at the end of a line are a line break — none of which can be
 * proof-read in a proportional typeface, where the columns do not line up and the
 * trailing spaces are invisible. **It is the size every other field is.** It
 * was once smaller so that a long article wrapped less, but the box no longer
 * grows with the article — it scrolls inside its container — and a smaller typeface only
 * made the lines harder to read.
 *
 * **`plain` is for a value that is read as it is typed.** Nothing in it is
 * syntax, so the typeface has no work to do, and the box is usually shown beside
 * prose it is being compared with — a different size and a different typeface there
 * makes two readings of one sentence look like two sentences.
 */
const TEXTAREA_LOOK = {
  source: "font-mono text-sm",
  plain: "text-sm",
} as const

/** A body, written as it will be stored. */
export function TextArea({
  label,
  name,
  value,
  required,
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
    <Labelled id={id} label={label} required={required} accepts={accepts} hint={hint} error={error}>
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

/**
 * One of a fixed, short list, drawn by the site.
 *
 * **Closed, it is a field**: the edge and depth of the box beside it
 * (`CONTROL`), the answer in force, and the `chevron-down` a menu shows when it
 * stands for a value. **Open, it is a menu** — the panel `Menu` opens, with the
 * choices as its lines — and it closes the three ways every panel off a control
 * does (`useDismissible`), and when focus leaves it.
 *
 * **Not a native `<select>`.** The one part of a select the page can reach is
 * the closed box; the list it opens is drawn outside the page and matches
 * nothing else on it. What that costs is paid
 * here: ↑ / ↓ / Home / End walk the choices, Enter and Space choose, Escape
 * closes and hands focus back to the box. **No type-ahead** — a list long
 * enough to search is a picker with a box of its own, not a select.
 *
 * **What is chosen travels in a hidden field**, so the form around it submits
 * as it would around a native one. Given `onChange` it is controlled instead,
 * for a screen that holds its values in state.
 */
export function Select({
  label,
  name,
  value,
  options,
  required,
  hint,
  error,
  disabled = false,
  width = "w-48",
  hideLabel = false,
  onChange,
}: {
  label: string
  /** What the choice is called in the form. Absent on a controlled one. */
  name?: string
  value?: string
  options: { value: string, label: string }[]
  /** That a choice has to be made — see `FieldLook`. */
  required?: string
  hint?: string
  error?: string
  disabled?: boolean
  width?: string
  /** For a row where a visible label would leave nothing lined up with it. */
  hideLabel?: boolean
  /** Told of a choice, for a control whose value the screen holds. */
  onChange?: (value: string) => void
}) {
  const id = useId()
  const box = useDismissible()
  const [held, setHeld] = useState(value ?? options[0]?.value ?? "")
  const chosen = onChange === undefined ? held : (value ?? "")
  const current = options.find((option) => option.value === chosen)

  // The line pressed closes the panel it is shown in and hands focus back to
  // the box, the way Escape does (`useDismissible`).
  const choose = (event: React.MouseEvent<HTMLButtonElement>, next: string) => {
    if (onChange === undefined) setHeld(next)
    else onChange(next)
    const panel = event.currentTarget.closest("details")
    if (panel === null) return
    panel.open = false
    panel.querySelector("summary")?.focus()
  }
  // The walk the browser's own list would have given.
  const walk = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const lines = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='option']")]
    const at = lines.findIndex((line) => line === document.activeElement)
    const to = event.key === "ArrowDown"
      ? Math.min(at + 1, lines.length - 1)
      : event.key === "ArrowUp"
        ? Math.max(at - 1, 0)
        : event.key === "Home" ? 0 : event.key === "End" ? lines.length - 1 : null
    if (to === null) return
    event.preventDefault()
    lines[to]?.focus()
  }

  return (
    <Labelled id={id} label={label} required={required} hint={hint} error={error} hideLabel={hideLabel}>
      {name !== undefined && <input type="hidden" name={name} value={chosen} />}
      <details
        ref={box}
        className={`relative ${width}`}
        // Opened, the choice in force takes focus, so the walk starts from it.
        onToggle={(event) => {
          if (event.currentTarget.open) {
            event.currentTarget.querySelector<HTMLElement>("[aria-selected='true']")?.focus()
          }
        }}
        // Leaving by Tab closes it, as leaving by Escape does: a panel left
        // open behind a focus that moved on is lying over something else.
        onBlur={(event) => {
          const { relatedTarget } = event
          if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return
          event.currentTarget.open = false
        }}
      >
        <summary
          id={id}
          aria-label={label}
          aria-haspopup="listbox"
          aria-controls={`${id}-list`}
          aria-disabled={disabled ? true : undefined}
          onClick={(event) => {
            if (disabled) event.preventDefault()
          }}
          className={`${CONTROL} ${edge(error)} flex w-full list-none items-center justify-between gap-2 marker:content-none ${
            disabled ? "opacity-50" : ""
          }`}
          {...invalid(id, error)}
        >
          <span className="truncate">{current?.label ?? ""}</span>
          <Icon name="chevron-down" aria-hidden="true" className="shrink-0 text-ink-muted" />
        </summary>
        <div
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          onKeyDown={walk}
          className={`absolute top-full left-0 z-20 flex w-full translate-y-2 ${MENU_PANEL}`}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === chosen}
              onClick={(event) => { choose(event, option.value) }}
              className={`text-left ${option.value === chosen ? MENU_ITEM_HERE : MENU_ITEM}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </details>
    </Labelled>
  )
}

/**
 * The box a markdown body is written in.
 *
 * **A code editor over a textarea.** The body of a guideline runs to hundreds
 * of lines and a save that refuses one of them names it by number, so the box
 * has to show line numbers, wrap at its own edge, draw the markdown's syntax characters
 * apart from the words, and put the caret on a line by its number — none of
 * which a textarea gives.
 *
 * **The form still has the body in the textarea.** The editor is mounted
 * over it once the page has script (`codemirror.client.ts`), and every change
 * is written back into the textarea and announced as a keystroke, so the form
 * posts what it always posted, `Editing` sees the change the way it sees any
 * other, the page beside the form is redrawn, and a page without script keeps
 * a box that works.
 *
 * **The box stops at thirty lines and scrolls inside itself.** A body runs to
 * hundreds of lines, and a box that grew with it pushed the row that saves
 * and the lines a save refused thousands of pixels below the top. A box that
 * took whatever room the pane had left instead grew with the window, and on a
 * tall one the row that saves sat at the foot of the pane with a gap between
 * it and the words — thirty lines is as much as is read at once, and the row
 * sits right under them. **A short body takes a shorter box**, down to 24rem,
 * and a short window shrinks the box to that floor before the pane scrolls
 * (`fill` down the column). The textarea that stands in for it without script
 * is thirty rows.
 */
/** As many lines as a body's box shows at once; the rest scroll inside it. */
const BODY_ROWS = 30

export function MarkdownEditor({ label, name, value, required, accepts, hint, error, refused, onReady }: {
  label: string
  name: string
  value: string
  /** That the body has to be written — see `FieldLook`. */
  required?: string
  accepts?: string
  hint?: string
  error?: string
  /**
   * The lines a save refused: the list under the box that identifies them, and
   * their numbers.
   *
   * **The list is the box's error.** A body's problems are several lines
   * each with a line number, which no one-line `error` can hold; so the box
   * is marked wrong and described by the list (`aria-invalid`,
   * `aria-describedby`), and shows nothing of its own above it — a count would
   * only repeat what the list already shows. The editor colours the lines
   * (`codemirror.client.ts` の `highlightLines`).
   */
  refused?: { id: string, lines: number[] }
  /** Handed the way to put the caret on a line once the editor is mounted, and null when it goes. */
  onReady?: (goToLine: ((line: number) => void) | null) => void
}) {
  const id = useId()
  const box = useRef<HTMLTextAreaElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const editor = useRef<MountedMarkdown | null>(null)
  const refusedLines = refused?.lines.join(",") ?? ""

  useEffect(() => {
    const textarea = box.current
    const parent = container.current
    if (textarea === null || parent === null) return
    let gone = false
    void import("./codemirror.client").then(({ mountMarkdown }) => {
      if (gone) return
      const mounted = mountMarkdown(parent, {
        doc: textarea.value,
        label,
        onChange: (doc) => {
          textarea.value = doc
          textarea.dispatchEvent(new Event("input", { bubbles: true }))
        },
      })
      editor.current = mounted
      textarea.hidden = true
      onReady?.(mounted.goToLine)
    })
    return () => {
      gone = true
      editor.current?.destroy()
      editor.current = null
      textarea.hidden = false
      onReady?.(null)
    }
  }, [label, onReady])

  // The indicators follow the answer: set when a save is refused, cleared when the
  // next one goes through. Before the editor is shown there is nothing to mark,
  // and it reads the current answer as it mounts.
  useEffect(() => {
    editor.current?.highlightLines(refusedLines === "" ? [] : refusedLines.split(",").map(Number))
  }, [refusedLines])

  const wrong = error !== undefined || refused !== undefined
  return (
    <Labelled id={id} label={label} required={required} accepts={accepts} hint={hint} error={error} fill>
      <textarea
        id={id}
        ref={box}
        name={name}
        defaultValue={value}
        rows={BODY_ROWS}
        spellCheck={false}
        className={`${CONTROL} min-h-96 w-full ${TEXTAREA_LOOK.source} ${wrong ? "border-danger" : ""}`}
        {...(refused === undefined
          ? invalid(id, error)
          : { "aria-invalid": true, "aria-describedby": refused.id })}
      />
      {/* Empty until the editor is shown in it, and drawn as nothing while
          empty. **It clips the editor at its own corners**: the editor's fill
          and gutter are square, and a square corner shows past a round one.
          **It is a column the editor fills**, so that the editor is as tall as
          the container and no taller (`codemirror.client.ts`). **Its ceiling is
          thirty lines** of the editor's 21px (14px × 1.5) plus the content's
          padding and the edge, and its floor is 24rem. */}
      <div
        ref={container}
        className={`${CONTROL_EDGE} flex min-h-96 max-h-[calc(30*1.3125rem+0.75rem+2px)] flex-col overflow-hidden rounded empty:hidden focus-within:outline-2 focus-within:outline-focus focus-within:-outline-offset-1 ${wrong ? "border-danger" : ""}`}
      />
    </Labelled>
  )
}

export function Checkbox({ label, icon, name, value, checked, count, required, hint, error, disabled }: FieldLook & {
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
   * digits are set in the one typeface where they are all the same width.
   */
  count?: number
}) {
  const id = useId()
  return (
    <Labelled
      id={id}
      label={label}
      required={required}
      icon={icon}
      after={count === undefined
        ? undefined
        : <span className="shrink-0 font-mono text-ink-muted text-xs">{count}</span>}
      hint={hint}
      error={error}
      inline
    >
      {/* **The box takes a line's height and centres in it** (`CHECKBOX_CELL`, the same
          box the table's ticks stand in). The row is aligned to its top so that
          a label running to two lines keeps the box on the first of them, and a
          16px box left in that corner sits above the word beside it — 3.2px,
          which is the half of the line it does not fill. */}
      <span className={CHECKBOX_CELL}>
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
      <legend className={PANE_LABEL}>{label}</legend>
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
 * store with a signed URL — so this is a chooser and nothing else.
 *
 * **The browser's own control is put away and a button drives it.** Left as it
 * comes, a file input draws a button the page cannot reach — its style has to be
 * spelled a second time through `file:` pseudo-elements, and beside it the
 * browser writes its own words in its own language ("選択されていません"), which
 * implies nothing about which file this field wants. Hidden, the input keeps doing
 * the work and the page shows what was chosen.
 *
 * **It requests nothing through the browser's validation.** A hidden control
 * cannot be focused, so a `required` on it refuses the form with nowhere to put
 * the reader — the same trap a required field inside a collapsed panel is. A
 * field that has to be filled is said by the screen: the send stays disabled
 * until it is.
 */
export function FileField({
  label,
  name,
  required,
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
    <Labelled id={id} label={label} required={required} hint={hint} error={error}>
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
        {/* **What was chosen, in the page's own words.** A chooser that shows
            nothing leaves the reader pressing it again to find out. */}
        <span className={chosen.length === 0 ? "text-ink-muted text-sm" : "text-sm"}>
          {chosen.length === 0 ? t.noFileChosen : chosen.join(" / ")}
        </span>
      </span>
    </Labelled>
  )
}

/**
 * One value's two languages, **one above the other, at the distance a label
 * sits from its value**. Side by side they read as two columns of a table
 * rather than one thing said twice; at the 16px between fields they read as
 * two fields.
 */
export function LanguagePair({ children }: { children: ReactNode }) {
  return <Stack gap="tight">{children}</Stack>
}

/**
 * A checkbox shown on its own in a table cell.
 *
 * **It takes one line's height and sits in the middle of it**, so that it lands
 * where a word in the next column lands. A box is 13px against a line of 22.4px
 * and, left inline, sits on the baseline of prose that is not there: 1.5px above
 * the words beside it down the rows and 1.7px above them in the header row, measured.
 * Either reads as the table being out of true rather than as anything a reader
 * can point at.
 *
 * **A line's height rather than a number**, because what it has to match is the
 * height the cell beside it is already using.
 */
const CHECKBOX_CELL = "flex h-[1lh] items-center"

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
    <span className={CHECKBOX_CELL}>
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
 * Hidden fields are left out: they have the id and the revision, which the
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
 * change is the save, which is shown at the foot of whatever the form holds; a
 * screen that had to thread the answer from its boxes to that button would
 * write the same three lines on every screen that saves anything.
 */
export function Editing({ children, onInput, onSubmit, onDirty, ...rest }: ComponentProps<typeof Form> & {
  /**
   * Told whenever this form's own answer to "has this been typed into"
   * changes — for a save shown outside the form it sends, which cannot
   * read `Changed` because it is not inside the form's own tree.
   */
  onDirty?: (dirty: boolean) => void
}) {
  const [changed, setChanged] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  const id = useId()
  const { state } = useNavigation()
  // **What was sent is no longer unsent.** Once a submission has settled the
  // screen has been read again, and every control's loaded value is what the
  // server now holds — so the same walk returns false, or true when the save
  // was refused and the words are still only here. Without this the answer
  // given at the last keystroke stood until the next one, over a save that
  // had already gone through.
  useEffect(() => {
    if (state === "idle" && form.current !== null) {
      const next = changedIn(form.current)
      setChanged(next)
      onDirty?.(next)
      holdUnsaved(id, next)
    }
  }, [state, onDirty, id])
  // **The guard at the way off the screen hears the same answer**
  // (`unsaved.tsx`), and hears it let go when the form unmounts — a panel
  // closed with words in it is not holding them any more.
  useEffect(() => () => {
    holdUnsaved(id, false)
  }, [id])
  return (
    <Form
      {...rest}
      ref={form}
      onInput={(event) => {
        const next = changedIn(event.currentTarget)
        setChanged(next)
        onDirty?.(next)
        holdUnsaved(id, next)
        onInput?.(event)
      }}
      // **Sending is a way off the screen the guard must not stop**, so the
      // hold is let go in the same event, before the router asks. A refused
      // save comes back with the words still here, and the walk above takes
      // the hold again.
      onSubmit={(event) => {
        holdUnsaved(id, false)
        onSubmit?.(event)
      }}
    >
      <Changed.Provider value={changed}>{children}</Changed.Provider>
    </Form>
  )
}

/**
 * That there is unsent work, said beside the control that sends it.
 *
 * **The style of the save shows the same thing to anybody looking at it**, and
 * this is what shows it to anybody who is not. It is a live region, so it is
 * read at the moment the first character is typed rather than when the reader
 * next happens to move the focus there.
 *
 * **It is shown to the right of the save and centred on it**, which is a pairing
 * rather than a property of either: `self-center` would centre it on the flex
 * line, and a row that ends in a save usually holds a field twice the button's
 * height that sets what the line is. **So the two go in one box that centres its
 * own contents** (`flex items-center`), and that box takes whatever alignment
 * the row gives it.
 */
export function Unsaved({ locale, dirty }: {
  locale: Locale
  /**
   * The "has this been typed into" answer to use in place of `Changed`, for a
   * report shown beside a save that is outside the form it is about.
   */
  dirty?: boolean
}) {
  const contextChanged = useContext(Changed)
  const changed = dirty ?? contextChanged
  const word = messagesFor(locale).admin.editor.unsaved
  return (
    <span className="text-xs">
      <SaveNews words={[word]} said={changed === true ? { word, tone: "accent" } : null} />
    </span>
  )
}

/**
 * What a save is doing, in the room its longest word takes whether or not
 * anything is said.
 *
 * **Nothing beside it moves when the news comes and goes.** The news appears
 * at the first character typed and goes at the save; a report that takes its
 * width only while it has a word pushes whatever is to its right across the
 * row at every keystroke that starts or ends a change. So every word it can
 * say is laid in the same grid cell, out of sight and out of the reading
 * order, and the cell is as wide as the widest of them — the one being said
 * is drawn over them.
 */
export function SaveNews({ words, said }: {
  /** Every word this report can show, so that its room is the widest of them. */
  words: readonly string[]
  said: { word: string, tone: "accent" | "muted" } | null
}) {
  return (
    <span role="status" className="inline-grid">
      {words.map((word) => (
        <span key={word} aria-hidden="true" className="invisible col-start-1 row-start-1">{word}</span>
      ))}
      <span className={`col-start-1 row-start-1 ${said?.tone === "muted" ? "text-ink-muted" : "text-accent"}`}>
        {said?.word}
      </span>
    </span>
  )
}

export function Submit({
  children,
  intent,
  variant = "secondary",
  size,
  disabled,
  reasonAt,
  icon,
  className,
  saves = false,
  dirty,
  form,
  id,
  busy = false,
}: {
  children: ReactNode
  intent?: string
  variant?: ButtonVariant
  /** Passed on to `Button`, for a save that is shown in a row of `xs` controls. */
  size?: ButtonSize
  /**
   * Passed on to `Button`: a sentence is why it cannot be pressed, drawn over
   * it while it is pointed at or focused.
   */
  disabled?: boolean | string
  /** Passed on to `Button`, with the reason: which edge of it the reason hangs from. */
  reasonAt?: "left" | "right"
  /** Passed on to `Button`, for a row where the links beside it have one. */
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
   * **A save reflects the state of the form rather than staying fixed.** With
   * nothing typed there is nothing to send, so it cannot be pressed; with
   * something typed it is the one thing on the screen that has to be pressed
   * before the reader leaves, so it is shown with the accent. Outside `Editing` it is
   * an ordinary submit — a form that never loads a value has nothing to compare
   * against.
   */
  saves?: boolean
  /**
   * The "has this been typed into" answer to use in place of `Changed`, for a
   * save that is shown outside the form it sends and so cannot read a context
   * provided inside that form's own tree.
   */
  dirty?: boolean
  /** Passed on to `Button`: the form this control sends, when it is not the one it is shown in. */
  form?: string
  /** Passed on to `Button`, for a control another one has to find by id when Ctrl+S sends the form it is shown in. */
  id?: string
  /**
   * A wait the press cannot see for itself: a lookup sent through a fetcher
   * as `GET`, which reads rather than sends and so is not an action in flight
   * (`useSubmitting`), yet can keep the reader waiting as long as one.
   */
  busy?: boolean
}) {
  const contextChanged = useContext(Changed)
  const changed = dirty ?? contextChanged
  const waiting = saves && changed === true
  /*
    **While the action it sent is in flight, the control that sent it waits in
    place.** It cannot be pressed again, its icon's box holds the spinner, and
    its name and width stay exactly as they were — a control that renamed
    itself or grew would move whatever is shown beside it at the moment the
    reader is watching it. What is read out is
    beside it, out of sight: the admin screens are Japanese only, which is why
    the word needs no locale.
  */
  const { pending: pressed, press } = usePressed()
  const pending = pressed || busy
  return (
    <>
      <Button
        id={id}
        type="submit"
        variant={waiting ? "accent" : variant}
        size={size}
        disabled={typeof disabled === "string" ? disabled : disabled === true || pending || (saves && changed === false)}
        reasonAt={reasonAt}
        icon={pending ? <Spinner /> : icon}
        className={className}
        name={intent === undefined ? undefined : "intent"}
        value={intent}
        form={form}
        aria-busy={pending || undefined}
        onClick={(event) => { press(event.currentTarget.form) }}
      >
        {children}
      </Button>
      {pending && <span role="status" className="sr-only">{messagesFor("ja").admin.busy}</span>}
    </>
  )
}

/**
 * What a form did, said once at the top of the screen.
 *
 * It is a `Note` that announces itself when it appears: a save that responds on
 * the same page is otherwise silent to anybody not watching that corner. The
 * box it is drawn in is the one every other remark uses, rather than its own
 * arrangement of the same glyph, border and text.
 *
 * **It has no margin and no width.** It is drawn inside `Answered`, which
 * decides where it sits and how wide it gets.
 */
export function Result({ ok, also, children }: {
  ok: boolean
  /**
   * A control belonging to the answer rather than to the box — the way to take
   * back what was just done. It is shown left of the close button, which every message
   * has, so that the two are read as "undo this" and "put this away".
   */
  also?: ReactNode
  children: ReactNode
}) {
  const dismiss = useContext(Dismiss)
  return (
    <Note
      kind={ok ? "done" : "danger"}
      live
      action={(
        <>
          {also}
          {dismiss}
        </>
      )}
    >
      {children}
    </Note>
  )
}

/**
 * The answer to what was just sent, said the one way every screen shows it:
 * over the screen (`Answered`), in one box (`Result`), in the words `said`
 * gives for it.
 *
 * **A screen gives the table from answer to sentence and nothing else** — not
 * a row of boxes one per refusal, not a box of its own. An answer the screen
 * does not apply to (`said` gives `null`: a publish that left for the research
 * it published) raises nothing.
 */
export function Answer<A extends object>({ answer, locale, said, ok = saysOk, also, label, dismiss }: {
  answer: A | null | undefined
  locale: Locale
  /** What the answer is said as, or `null` where it needs no word. */
  said: (answer: A) => string | null
  /** Whether it went through; by default an answer whose `status` is `"ok"`. */
  ok?: (answer: A) => boolean
  /** The way to take back what was just done (`Result` の `also`). */
  also?: (answer: A) => ReactNode
  /** For an answer outside the management screens (`Answered` の `label` / `dismiss`). */
  label?: string
  dismiss?: string
}) {
  const words = answer === null || answer === undefined ? null : said(answer)
  const spoken = words === null ? null : answer
  return (
    <Answered answer={spoken} locale={locale} label={label} dismiss={dismiss}>
      {spoken !== null && spoken !== undefined && words !== null && (
        <Result ok={ok(spoken)} also={also?.(spoken)}>{words}</Result>
      )}
    </Answered>
  )
}

function saysOk(answer: object): boolean {
  return "status" in answer && answer.status === "ok"
}

/** The way to put the answer away, handed to the `Result` inside it. */
const Dismiss = createContext<ReactNode>(undefined)

/**
 * The answer to the last thing that was sent, over the screen rather than in it.
 *
 * **It is not shown in the page it is about.** An answer written into the
 * screen takes a strip of the card above the thing that was just edited, so a
 * save pushes the form down by the height of its own confirmation and the
 * reader loses the line they were on. Over the page nothing moves, and the
 * answer is in the same place on every screen that gives one — which is the
 * corner the public side already shows its result in when a dataset is marked.
 *
 * **It waits while it is being read.** The timer is held off while a pointer is
 * over the box or the focus is inside it.
 *
 * **What is passed in is the response, not a flag.** A screen whose answer is
 * only worth showing half the time (a publish that responds with nothing when it
 * worked) hands over what it wants shown, and nothing arrives here that the
 * screen had not decided to show.
 */
export function Answered({ answer, locale, label, dismiss, children }: {
  /** The last response. A new one raises the box; `null` and `undefined` do not. */
  answer: unknown
  locale: Locale
  /**
   * The region's name and the close button's, for an answer outside the management
   * screens: theirs are Japanese only, and a page read in English is not.
   */
  label?: string
  dismiss?: string
  children: ReactNode
}) {
  const messages = messagesFor(locale)
  // **Which answer this is, not whether one is up.** Two saves in a row answer
  // with the same words, and a box that was already standing would not come in
  // again — so they are counted, and the box is keyed by the count. Nought is
  // nothing to show.
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
    <Toast label={label ?? messages.admin.notice} announce="" at="head">
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
                  // **The close button is 36px to press and 24px tall in the box.**
                  // An icon-only control is 36px square, and left to itself it
                  // is the tallest thing here — taller than the glyph and half
                  // again the line of text — so the box stood 54px for a
                  // sentence needing 40.
                  // **It is given the glyph's height and lets its target hang
                  // over**, rather than a negative margin: the management
                  // screens write no margins at all (`app.spacing.test.ts`), and
                  // nothing here clips, so the 36px stays pressable.
                  <span className="flex h-6 items-center">
                    <IconButton
                      name="close"
                      label={dismiss ?? messages.admin.dismissNotice}
                      onClick={() => { setNth(0) }}
                    />
                  </span>
                )}
              >
                {children}
              </Dismiss.Provider>
            </div>
          )}
    </Toast>
  )
}
