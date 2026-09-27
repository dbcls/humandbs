import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import { useLocation } from "react-router"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { ButtonLink, Choice, SectionTabs, Chevron, type ButtonSize } from "./base"
import { Icon, type IconName } from "./icons"

/**
 * The back link of a screen the bar does not open.
 *
 * **Only a screen whose parent is missing from the bar has one**
 * (`admin/navigation.ts` is what the bar holds): the files, a version's
 * datasets, a draft, its review and its publishing lead to their research,
 * the import leads to its draft, a dataset leads to the list it is in. A
 * draft's editor, its datasets and its review lead instead to the screen that
 * opened them when it is one they know (`useOpenedFrom`): the draft's editor
 * for the datasets, its publishing for the editor and the review. A screen the
 * bar already reaches would be
 * indicating the same thing twice, and a management area that repeats its own shape
 * at the top of every screen is one where a curator reads the depth instead of
 * the work.
 *
 * **It is drawn as a control, not as a line of text.** It is shown beside the
 * other places the screen leads to, and a bare link among outlined buttons
 * reads as a caption rather than as the one back link.
 *
 * `onHeaderBar` is for the one shown in a page's opening header bar (`base.tsx` の
 * `HeaderBar`), where the colour the rest of the site draws links in is unreadable
 * against the fill.
 */
export function AdminBack({ to, label, icon, onHeaderBar = false }: {
  to: string
  label: string
  /** The icon it shows, which the screen chooses along with the word. */
  icon?: IconName
  onHeaderBar?: boolean
}) {
  return (
    <ButtonLink
      to={to}
      variant="secondary"
      onHeaderBar={onHeaderBar}
      icon={icon === undefined
        ? undefined
        : icon === "chevron-left" || icon === "chevron-right"
          ? <Chevron dir={icon === "chevron-left" ? "left" : "right"} />
          : <Icon name={icon} aria-hidden="true" />}
    >
      {label}
    </ButtonLink>
  )
}

/**
 * What one pane can be told to show.
 *
 * The body is built by the screen: a pane holds a form, or the public page the
 * research is written for, or the row that research takes in the listing, and
 * only the screen knows how to draw any of them.
 */
export interface PaneContent {
  id: string
  label: string
  body: ReactNode
}

/** How the two panes are arranged, which is the reader's and not the screen's. */
interface Arrangement {
  left: string
  right: string
  showing: "both" | "left" | "right"
}

/**
 * Two panes, each showing whatever it is told to.
 *
 * **Every screen opens the same way: both panes, the form on the left, the
 * Japanese page on the right.** Which of the two is showing and what each
 * holds are the person's to change while the screen is open, and neither
 * changes a single value — so the arrangement is not written into the
 * address, the line every other arrangement is held to, and **it is not kept
 * either**: the next screen, and the next visit to this one, open the same
 * way. What was rearranged for one draft is not what the next one wants.
 *
 * **The two are the same width.** What is read here is a form beside the page it
 * writes and neither of them is the subject, so there is no width to prefer; a
 * seam that can be dragged requests a decision on every visit and leaves
 * whoever opens the screen next with somebody else's answer to it.
 *
 * **Each pane is a box that scrolls inside itself, and the pair is as tall as
 * the window.** Reading one beside the other is the whole point, and a single
 * scroll would move both away together. **The pair sticks to the top of the
 * window**, so scrolling takes the bar away and leaves two panes filling the
 * screen — which is what somebody writing is looking at most of the time. The
 * height is the window's rather than a number measured on the way past, so
 * nothing has to be told when the bar above wraps onto a second line.
 *
 * The switch is handed back apart from the panes, for a screen whose head
 * has a toolbar (`draft-tools.tsx` の `DraftTools`, `contents.tsx` の
 * `ArticleTools`) to put it on — at that row's far end, beside saving — rather
 * than floating above one of the two things it governs. A screen with no such
 * row keeps it where it always stood, on the showing pane's own tabs.
 */
/**
 * How far from the top of the window the panes stick, and how tall they are.
 *
 * **Under a header that collapses to one row, the panes start below that row.** The
 * collapsed head is one 36px row with 12px above and below (`draft-tools.tsx` の
 * `DraftHead`), so the two are a sum rather than a measurement: the row, then
 * the gap between it and the boxes. Without such a header the panes start at the
 * page's margin.
 */
const PANE_STANCE = {
  page: "top-4 h-[calc(100dvh-2rem)]",
  bar: "top-[calc(3.75rem+1rem)] h-[calc(100dvh-3.75rem-2rem)]",
} as const

export function usePanes({ locale, contents, opens, under = "page" }: {
  locale: Locale
  contents: PaneContent[]
  /** What the right pane opens on; the second content otherwise. */
  opens?: string
  /** What the panes are shown under: the page's margin, or a row that stays at the top. */
  under?: keyof typeof PANE_STANCE
}): { view: ReactNode, control: ReactNode, left: string, right: string, showing: Arrangement["showing"] } {
  const words = messagesFor(locale).admin.panes
  const [state, setState] = useState<Arrangement>(() => {
    const first = contents[0]?.id ?? ""
    return {
      left: first,
      right: (opens !== undefined && contents.some((one) => one.id === opens) ? opens : contents[1]?.id) ?? first,
      showing: "both",
    }
  })

  const change = useCallback((next: Partial<Arrangement>) => {
    setState((was) => ({ ...was, ...next }))
  }, [])

  // Left to right, the way the panes themselves stand: a list that starts with
  // "both" makes the reader find the arrangement they are looking at.
  const shows = [
    { id: "left", label: words.left },
    { id: "both", label: words.both },
    { id: "right", label: words.right },
  ] as const

  // **The word is shown beside it, and once.** The group is named for whoever
  // is not looking, and the same word is shown for whoever is — hidden from
  // the reader that already has it as the group's name, so it is not said
  // twice. A step smaller than the save it shares a row with: it arranges the
  // screen and changes nothing, and should not weigh what the save weighs.
  const control = (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-ink-muted text-xs">
      <span aria-hidden="true">{words.showing}</span>
      <Choice
        label={words.showing}
        value={state.showing}
        options={shows}
        onChange={(showing) => { change({ showing }) }}
        pill
        size="xs"
      />
    </span>
  )

  // **A screen whose head has a toolbar draws the switch there instead**
  // (`draft-tools.tsx` の `DraftTools`): that row stays at the top of the
  // window, and the switch belongs beside saving, not floating above one of
  // the two panes it governs. Every other screen keeps it where it always
  // stood — on the panes' own top edge, at the far end of the strip of
  // whichever pane is shown last, the right one or the only one.
  const onOwnEdge = under === "page"
  const holdsControl = state.showing === "left" ? "left" : "right"

  function pane(side: "left" | "right") {
    const current = side === "left" ? state.left : state.right
    const shown = contents.find((one) => one.id === current) ?? contents[0]
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded bg-white">
        {/* **The tabs are the top of the box, not a row above it.** What a pane
            holds is part of that pane, and a strip shown on the tint belongs
            to neither of the two boxes it sits between. */}
        <SectionTabs
          label={words.holds}
          scope={side}
          tabs={contents.map((one) => ({ id: one.id, label: one.label }))}
          current={shown?.id ?? ""}
          onSelect={(id) => { change(side === "left" ? { left: id } : { right: id }) }}
          aside={onOwnEdge && side === holdsControl ? control : undefined}
        />
        {/* **The box that scrolls is also what the indicators inside it are placed
            against.** Left `static` it is not the containing block of anything
            absolutely positioned within, so those are placed against the page
            instead — and a box only clips what it is the containing block of,
            so the comment buttons hanging beside the fields escape the pane and
            stretch the document to the length of the form. */}
        <div data-pane-body className="relative min-h-0 flex-1 overflow-y-auto">{shown?.body}</div>
      </div>
    )
  }

  const view = (
    <div
      // **The window less what the page keeps above and below its content**
      // (`Page` の `py-4`), held that far off the top. At the window's full
      // height the pair reaches both edges: the tabs at the head of each box
      // end up against the browser's own frame, and — because a stuck box is
      // pushed back up by its parent once the page is scrolled to the end —
      // past it by whatever the page keeps under the content.
      className={`sticky flex items-stretch gap-4 ${PANE_STANCE[under]}`}
    >
      {state.showing !== "right" && pane("left")}
      {state.showing !== "left" && pane("right")}
    </div>
  )

  // **Which content is shown where, for a screen whose own toolbar has more to
  // say about it than the switch alone.** An article's save is one control per
  // open language, so the row above the panes has to know which of them are
  // showing — and Ctrl+S sends the left one specifically — which the switch's
  // own markup does not have (`contents.tsx` の `ArticleTools`).
  return { view, control, left: state.left, right: state.right, showing: state.showing }
}

/**
 * The link to another screen, shown in a row of controls.
 *
 * **The style of the back link, with the indicator after the word** (`AdminBack`
 * turned around): an outlined button with no indicator reads as something done
 * here, and a bare link reads as a caption. The indicator before the word shows
 * what the screen is about; the chevron after
 * it shows it is somewhere else, and moves that way when pointed at
 * (`base.tsx` の `Chevron`).
 */
export function ScreenLink({ to, icon, size, children }: {
  to: string
  /** What the screen is about, before the word. */
  icon?: IconName
  /** `row` inside a table's row, where the row's own operations are that size. */
  size?: ButtonSize
  children: ReactNode
}) {
  return (
    <ButtonLink to={to} size={size} chevron icon={icon === undefined ? undefined : <Icon name={icon} aria-hidden="true" />}>
      {children}
    </ButtonLink>
  )
}

/** Where the tab keeps the screens on the way back from the one shown. */
const OPENED_FROM_KEY = "humandbs.admin.openedFrom"

/** The screens of the management area a tab has shown, as far as their back links need. */
export interface OpenedFrom {
  /** The path of the screen shown last. */
  last: string | null
  /** For each screen on the way back from the last one, the path of the screen it was opened from. */
  from: Record<string, string>
}

const NOTHING_OPENED: OpenedFrom = { last: null, from: {} }

/**
 * What is kept once `path` is shown.
 *
 * **Going back does not overwrite where a screen was opened from**: arriving
 * from a screen this one opened (a dataset's editor back to the dataset list,
 * or the browser's back button) leaves the screen it was opened from before.
 * Arriving from anywhere else records the last screen. **Only the screens on the way back from `path` are
 * kept**, so what is kept is as long as that way and no longer.
 */
export function nextOpenedFrom(held: OpenedFrom, path: string): OpenedFrom {
  if (held.last === path) return held
  const returning = held.last !== null && held.from[held.last] === path
  const from = returning || held.last === null ? held.from : { ...held.from, [path]: held.last }
  const kept: Record<string, string> = {}
  let at = path
  for (;;) {
    const opener = from[at]
    if (opener === undefined || at in kept) break
    kept[at] = opener
    at = opener
  }
  return { last: path, from: kept }
}

/** What is kept, as it was written; anything else reads as nothing kept. */
export function readOpenedFrom(raw: string | null): OpenedFrom {
  if (raw === null) return NOTHING_OPENED
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== "object" || value === null) return NOTHING_OPENED
    const { last, from } = value as { last?: unknown, from?: unknown }
    if (last !== null && typeof last !== "string") return NOTHING_OPENED
    if (typeof from !== "object" || from === null) return NOTHING_OPENED
    const entries = Object.entries(from).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    return { last, from: Object.fromEntries(entries) }
  } catch {
    return NOTHING_OPENED
  }
}

/**
 * **Reaching the store can throw** (a browser set to block all storage), and
 * this runs during render. Without it every back link leads where it does by
 * default.
 */
function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(OPENED_FROM_KEY)
  } catch {
    return null
  }
}

/** What is kept changes only when the screen does, and a new screen is drawn anew. */
function subscribeToNothing(): () => void {
  return () => undefined
}

function nothingOnServer(): null {
  return null
}

/**
 * Keeps, for each admin screen shown, the screen it was opened from
 * (`nextOpenedFrom`). Called once, in the area's layout.
 */
export function useKeepOpenedFrom(): void {
  const { pathname } = useLocation()
  useEffect(() => {
    const next = nextOpenedFrom(readOpenedFrom(readStored()), pathname)
    try {
      window.sessionStorage.setItem(OPENED_FROM_KEY, JSON.stringify(next))
    } catch {
      return
    }
  }, [pathname])
}

/**
 * The path of the screen this one was opened from, for a back link that leads
 * there when it is one of the screens it knows.
 *
 * **Kept in `sessionStorage` rather than in the address**: a screen is reached
 * again from the screens it opens and from the redirect after each save, and
 * an address would have to be written into every one of them. What is kept
 * is lost with the tab, and then the back link leads where it does by default.
 * **Read as it will be once this screen is kept** — the layout keeps it after
 * the screen is drawn.
 */
export function useOpenedFrom(): string | null {
  const { pathname } = useLocation()
  const raw = useSyncExternalStore(subscribeToNothing, readStored, nothingOnServer)
  return useMemo(
    () => raw === null ? null : nextOpenedFrom(readOpenedFrom(raw), pathname).from[pathname] ?? null,
    [raw, pathname],
  )
}

/** Where a back link leads, and its label. */
export interface BackTo {
  path: string
  label: string
}

/**
 * A back link that leads to the screen this one was opened from when that is
 * one of `known`, and to `otherwise` when it is not (`useOpenedFrom`).
 */
export function useBackTo(otherwise: BackTo, known: readonly BackTo[]): BackTo {
  const from = useOpenedFrom()
  return known.find((one) => one.path === from) ?? otherwise
}
