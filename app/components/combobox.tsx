/**
 * A box to type in with a list that opens under it, for choosing one of a list
 * too long to read down — a vocabulary's terms and the keys to add on a
 * dataset's screen, the article a policy links to.
 */

import { type CSSProperties, type RefObject, useId, useLayoutEffect, useRef, useState } from "react"

import { MENU_PANEL } from "./base"
import { CONTROL } from "./form"
import { Icon } from "./icons"

/** The most the list takes, 18rem: about eight lines, and it scrolls past that. */
const LIST_HEIGHT = 288
/** The room kept between the box and the list, and between the list and the window's edge. */
const LIST_GAP = 4
/** The least room under the box the list opens into, about four lines. */
const LIST_ROOM = 160

/**
 * Where the list is drawn, against the window rather than inside whatever
 * holds the box.
 *
 * **Placed against the window**, because the box is written in panels that
 * scroll — a dialog, a pane — and a list placed inside one was cut off at its
 * edge, or made it scroll to show the rest. **Under the box**, and over it
 * only where there is less than `LIST_ROOM` under it and more above — a list
 * that jumps above the box because a long one would not fit below reads as
 * belonging to what is above. As tall as the room allows up to `LIST_HEIGHT`. **At least as wide as the box, and wider for a long line**, up
 * to the window's right edge, where a line wraps. Placed again as anything
 * scrolls or the window changes size, so it stays against the box.
 */
export function listPlace(
  box: { top: number, bottom: number, left: number, width: number },
  window: { width: number, height: number },
): CSSProperties {
  const below = window.height - box.bottom - 2 * LIST_GAP
  const above = box.top - 2 * LIST_GAP
  const up = below < LIST_ROOM && above > below
  const height = Math.max(0, Math.min(LIST_HEIGHT, up ? above : below))
  const across = {
    left: box.left,
    width: "max-content",
    minWidth: box.width,
    maxWidth: Math.max(box.width, window.width - box.left - LIST_GAP),
  }
  return up
    ? { ...across, bottom: window.height - box.top + LIST_GAP, maxHeight: height }
    : { ...across, top: box.bottom + LIST_GAP, maxHeight: height }
}

function useListPlace(box: RefObject<HTMLInputElement | null>, shown: boolean): CSSProperties | null {
  const [placed, setPlaced] = useState<CSSProperties | null>(null)
  useLayoutEffect(() => {
    if (!shown) return
    const place = () => {
      const el = box.current
      if (el !== null) setPlaced(listPlace(el.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }))
    }
    place()
    // Capture, so a scroll of any box around it is heard, not only the window's.
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    return () => {
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
    }
  }, [box, shown])
  // Placed before the list is painted (a layout effect), so a place left from
  // the last time it opened is never seen.
  return shown ? placed : null
}

/**
 * A box to type in with a list that opens under it — **one combobox for every
 * list chosen from by typing** (a vocabulary's terms, the keys to add, the
 * article a policy links to), so the keys and the look are learned once.
 *
 * WAI-ARIA APG, "list autocomplete" (`comboKey`): the list opens as the box is
 * entered, by the pointer or the keyboard, and as it is typed into; Up and Down
 * walk it while the caret stays in the box; Enter takes the one walked to and
 * never sends the form; Escape closes, a second empties. The caret stays in the
 * box after a choice, so the next one is a key away.
 */
export function ComboBox<T>({ label, placeholder, disabled = false, options, keyOf, render, loading = false, empty, more, words, onQuery, onChoose, kept, initial = "" }: {
  label: string
  /** The grey word in the empty field; the label when absent. */
  placeholder?: string
  disabled?: boolean
  /** What the list offers for what is typed now. */
  options: readonly T[]
  keyOf: (option: T) => string
  render: (option: T) => React.ReactNode
  /** Whether the options are still being asked for. */
  loading?: boolean
  empty: string
  /** A line under a truncated list, indicating so. */
  more?: string
  words: { searching: string, count: (count: number) => string }
  /** What is typed, whenever it changes or the box is entered (typed: false). */
  onQuery?: (value: string, typed: boolean) => void
  onChoose: (option: T) => void
  /**
   * Keep the choice in the box, as these words, rather than emptying it — for a
   * choice that is confirmed by a button beside the box rather than acted on
   * as it is made. Typing again goes back to looking.
   */
  kept?: (option: T) => string
  /** What the box holds when it is drawn: the words of a choice already made (`kept`). */
  initial?: string
}) {
  const [find, setFind] = useState(initial)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLInputElement>(null)
  const listId = useId()
  const optionId = (at: number) => `${listId}-${String(at)}`
  const shown = open && !disabled
  const at = Math.min(active, options.length - 1)
  const current = options[at]
  const placed = useListPlace(box, shown)

  const look = (value: string) => {
    setFind(value)
    setActive(0)
    setOpen(true)
    onQuery?.(value, true)
  }
  const enter = () => {
    if (disabled || open) return
    setOpen(true)
    setActive(0)
    onQuery?.(find, false)
  }
  const choose = (option: T) => {
    onChoose(option)
    setFind(kept === undefined ? "" : kept(option))
    setOpen(false)
    setActive(0)
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const next = comboKey({ open: shown, active, find }, event.key, options.length)
    if (next === null) return
    event.preventDefault()
    if (event.key === "Escape") event.stopPropagation()
    if (next.choose && current !== undefined) {
      choose(current)
      return
    }
    if (next.state.open && !shown) onQuery?.(find, false)
    setOpen(next.state.open)
    setActive(next.state.active)
    setFind(next.state.find)
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={box}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && current !== undefined ? optionId(at) : undefined}
        // The browser's own suggestions are what someone typed in some other
        // box; over this one they hide the list that responds.
        autoComplete="off"
        spellCheck={false}
        value={find}
        disabled={disabled}
        aria-label={label}
        placeholder={placeholder ?? label}
        onChange={(event) => { look(event.target.value) }}
        onKeyDown={onKeyDown}
        onFocus={enter}
        onClick={enter}
        onBlur={() => { setOpen(false) }}
        className={`${CONTROL} w-full pr-8 text-sm disabled:opacity-50`}
      />
      {/* The indicator of a list that opens here, the way a pull-down draws it.
          Not a control of its own: the box is what is pressed. */}
      <Icon
        name="chevron-down"
        className={`pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-muted transition-transform ${shown ? "rotate-180" : ""}`}
      />
      {shown && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          style={placed ?? undefined}
          className={`fixed z-30 flex overflow-y-auto ${placed === null ? "invisible" : ""} ${MENU_PANEL}`}
        >
          {options.length === 0 && (
            <li role="presentation" className="px-4 py-2 text-ink-muted text-sm">{loading ? words.searching : empty}</li>
          )}
          {!loading && more !== undefined && (
            <li role="presentation" className="order-last border-line border-t px-4 py-2 text-ink-muted text-xs">{more}</li>
          )}
          {options.map((option, index) => (
            <li
              key={keyOf(option)}
              id={optionId(index)}
              role="option"
              aria-selected={index === at}
              // Pressed with the pointer, the box keeps the caret: taking it
              // away would close the list before the press lands.
              onMouseDown={(event) => { event.preventDefault() }}
              onMouseEnter={() => { setActive(index) }}
              onClick={() => { choose(option) }}
              className={`flex items-baseline gap-2 px-4 py-2 text-sm ${index === at ? "bg-surface-hover" : ""}`}
            >
              {render(option)}
            </li>
          ))}
        </ul>
      )}
      <span role="status" className="sr-only">{shown && !loading ? words.count(options.length) : ""}</span>
    </div>
  )
}

/** What a combobox holds between keys: whether its list is open, which option is walked to, what is typed. */
export interface ComboState {
  open: boolean
  active: number
  find: string
}

/**
 * **The keys of a combobox** (WAI-ARIA APG, "list autocomplete"). The list
 * opens as the box is entered — by the pointer or the keyboard — and as it is
 * typed into, and Down opens it again once it has been closed. Up and Down walk
 * it, wrapping, while the caret stays in the box; Enter takes the one walked to
 * and is never the form's submit; Escape closes the list, and a second Escape
 * empties the box. Any other key is the box's own (null).
 */
export function comboKey(
  state: ComboState,
  key: string,
  count: number,
): { state: ComboState, choose: boolean } | null {
  if (key === "ArrowDown" || key === "ArrowUp") {
    if (!state.open) return { state: { ...state, open: true, active: 0 }, choose: false }
    if (count === 0) return { state, choose: false }
    const from = Math.min(Math.max(state.active, 0), count - 1)
    const by = key === "ArrowDown" ? 1 : -1
    return { state: { ...state, active: (from + by + count) % count }, choose: false }
  }
  if (key === "Enter") return { state, choose: state.open && count > 0 }
  if (key === "Escape") {
    if (state.open) return { state: { ...state, open: false }, choose: false }
    if (state.find !== "") return { state: { ...state, find: "" }, choose: false }
    return null
  }
  return null
}
