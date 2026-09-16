import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { ButtonLink, Choice, IconButton, SectionTabs } from "./base"
import { Icon, type IconName } from "./icons"

/**
 * The way out of a screen the bar does not open.
 *
 * **Only a screen whose parent is missing from the bar carries one**
 * (`admin/navigation.ts` is what the bar holds): the box and the draft lead to
 * their research, the datasets and the review screen lead to their draft, a
 * dataset leads to the list it is in. A screen the bar already reaches would be
 * saying the same thing twice, and a management area that repeats its own shape
 * at the top of every screen is one where a curator reads the depth instead of
 * the work.
 *
 * **It is drawn as a control, not as a line of text.** It stands beside the
 * other places the screen leads to, and a bare link among outlined buttons
 * reads as a caption rather than as the one way out.
 *
 * `onBand` is for the one standing in a page's opening band (`base.tsx` の
 * `Band`), where the colour the rest of the site draws links in is unreadable
 * against the fill.
 */
export function AdminBack({ to, label, icon, onBand = false }: {
  to: string
  label: string
  /** The mark it carries, which the screen chooses along with the word. */
  icon?: IconName
  onBand?: boolean
}) {
  return (
    <ButtonLink
      to={to}
      variant="secondary"
      onBand={onBand}
      icon={icon === undefined ? undefined : <Icon name={icon} aria-hidden="true" />}
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
 * The arrangement lives in session storage and is read from there.
 *
 * **Storage is the state rather than a copy of it.** Held in React and written
 * out as a side effect, the two disagree for the length of a render, and the
 * server — which has no session storage — sends markup the browser then rebuilds
 * differently. Read as an external store there is one answer, and the server's
 * is simply "nothing kept yet".
 */
const paneWatchers = new Set<() => void>()

function watchPanes(notify: () => void): () => void {
  paneWatchers.add(notify)
  return () => {
    paneWatchers.delete(notify)
  }
}

function writePanes(filed: string, value: Arrangement): void {
  sessionStorage.setItem(filed, JSON.stringify(value))
  for (const notify of paneWatchers) notify()
}

/**
 * Two panes, each showing whatever it is told to.
 *
 * **What each pane holds belongs to the person, not to the screen.** Which of
 * the two is showing and what each holds are theirs, and neither changes a
 * single value — so both are kept for the session rather than written into the
 * address, the line every other arrangement is held to.
 *
 * **The two are the same width.** What is read here is a form beside the page it
 * writes and neither of them is the subject, so there is no width to prefer; a
 * seam that can be dragged asks for a decision on every visit and leaves
 * whoever opens the screen next with somebody else's answer to it.
 *
 * **Each pane is a box that scrolls inside itself, and the pair is as tall as
 * the window.** Reading one beside the other is the whole point, and a single
 * scroll would carry both away together. **The pair sticks to the top of the
 * window**, so scrolling takes the bar away and leaves two panes filling the
 * screen — which is what somebody writing is looking at most of the time. The
 * height is the window's rather than a number measured on the way past, so
 * nothing has to be told when the bar above wraps onto a second line.
 *
 * The switch is handed back apart from the panes because it belongs on the
 * draft's bar, up with saving and the draft's other faces, rather than floating
 * above one of the two things it governs.
 */
export function usePanes({ locale, contents, remember }: {
  locale: Locale
  contents: PaneContent[]
  /** What this screen's arrangement is filed under for the session. */
  remember: string
}): { control: ReactNode, view: ReactNode } {
  const words = messagesFor(locale).admin.panes
  const filed = `panes:${remember}`
  const raw = useSyncExternalStore(
    watchPanes,
    () => sessionStorage.getItem(filed),
    () => null,
  )

  const state = useMemo<Arrangement>(() => {
    const first = contents[0]?.id ?? ""
    const fallback: Arrangement = {
      left: first,
      right: contents[1]?.id ?? first,
      showing: "both",
    }
    if (raw === null) return fallback
    const known = (id: unknown): id is string => contents.some((one) => one.id === id)
    try {
      const read = JSON.parse(raw) as Partial<Arrangement>
      return {
        left: known(read.left) ? read.left : fallback.left,
        right: known(read.right) ? read.right : fallback.right,
        showing: read.showing ?? fallback.showing,
      }
    } catch {
      // A value this screen cannot read is one it did not write.
      return fallback
    }
  }, [raw, contents])

  const change = useCallback((next: Partial<Arrangement>) => {
    writePanes(filed, { ...state, ...next })
  }, [filed, state])

  // Left to right, the way the panes themselves stand: a list that starts with
  // "both" asks the reader to find the arrangement they are looking at.
  const shows = [
    { id: "left", label: words.left },
    { id: "both", label: words.both },
    { id: "right", label: words.right },
  ] as const

  const control = (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      {/* **The word saying what is being chosen stays outside the control**, the
          line a listing's own choices are held to (`base.tsx` の `Chooser`). */}
      <span className="text-ink-muted">{words.showing}</span>
      <Choice
        label={words.showing}
        value={state.showing}
        options={shows}
        onChange={(showing) => { change({ showing }) }}
        pill
      />
    </span>
  )

  function pane(side: "left" | "right") {
    const current = side === "left" ? state.left : state.right
    const shown = contents.find((one) => one.id === current) ?? contents[0]
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded bg-white">
        {/* **The tabs are the top of the box, not a row above it.** What a pane
            holds is part of that pane, and a strip standing on the tint belongs
            to neither of the two boxes it sits between. */}
        <SectionTabs
          label={words.holds}
          scope={side}
          tabs={contents.map((one) => ({ id: one.id, label: one.label }))}
          current={shown?.id ?? ""}
          onSelect={(id) => { change(side === "left" ? { left: id } : { right: id }) }}
        />
        {/* **The box that scrolls is also what the marks inside it are placed
            against.** Left `static` it is not the containing block of anything
            absolutely positioned within, so those are placed against the page
            instead — and a box only clips what it is the containing block of,
            so the comment marks hanging beside the fields escape the pane and
            stretch the document to the length of the form. */}
        <div className="relative min-h-0 flex-1 overflow-y-auto">{shown?.body}</div>
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
      className="sticky top-4 flex h-[calc(100dvh-2rem)] items-stretch gap-4"
    >
      {state.showing !== "right" && pane("left")}
      {state.showing !== "left" && pane("right")}
    </div>
  )

  return { control, view }
}

/**
 * The mark the page pane hangs at a place, and the way into the field writing it.
 *
 * **It is the only thing on that page that can be pressed.** Writing in place
 * would put a second box for the same value on the screen, and then there are
 * two answers to what is written there; the press moves the caret into the form
 * instead.
 *
 * **It fills while the caret is in that place, and brings itself into view.**
 * The two ways into one value — the ja box and the en box — are the same place,
 * so moving between them leaves the mark and the page exactly where they are.
 */
export function PaneSpot({ here, label, onGo }: {
  here: boolean
  label: string
  onGo: () => void
}) {
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (here) box.current?.scrollIntoView({ block: "center" })
  }, [here])
  return (
    <span ref={box}>
      <IconButton name="edit" label={label} pressed={here} onClick={onGo} />
    </span>
  )
}
