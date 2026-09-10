import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import { Link } from "react-router"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { Choice, IconButton, SectionTabs } from "./base"

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
 * **It names where it goes rather than the step.** One link on a screen has
 * nothing beside it to say what "back" would be back to.
 *
 * `onBand` is for the one standing in a page's opening band (`base.tsx` の
 * `Band`), where the colour the rest of the site draws links in is unreadable
 * against the fill.
 */
export function AdminBack({ to, label, onBand = false }: {
  to: string
  label: string
  onBand?: boolean
}) {
  return (
    <Link to={to} className={`text-sm ${onBand ? "text-white" : ""}`}>{label}</Link>
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
  /** The share of the width the left pane takes. */
  split: number
  showing: "both" | "left" | "right"
}

const SPLIT_LIMIT = { least: 0.2, most: 0.8 }

/** What `Page` keeps below its content, which the panes may not scroll under. */
const PAGE_FOOT = 16

function held(split: number): number {
  return Math.min(SPLIT_LIMIT.most, Math.max(SPLIT_LIMIT.least, split))
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
 * **The arrangement belongs to the person, not to the screen.** Which of the
 * two is showing, what each holds and where the seam stands are all theirs, and
 * none of it changes a single value — so it is kept for the session rather than
 * written into the address, the line every other arrangement is held to.
 *
 * **The panes scroll separately and reach the foot of the window.** Reading one
 * beside the other is the whole point, and a single scroll would carry both away
 * together. Where they start is wherever the page put them, so the height is
 * measured rather than named.
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
      split: 0.5,
      showing: "both",
    }
    if (raw === null) return fallback
    const known = (id: unknown): id is string => contents.some((one) => one.id === id)
    try {
      const read = JSON.parse(raw) as Partial<Arrangement>
      return {
        left: known(read.left) ? read.left : fallback.left,
        right: known(read.right) ? read.right : fallback.right,
        split: typeof read.split === "number" ? held(read.split) : fallback.split,
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

  const box = useRef<HTMLDivElement>(null)
  const [tall, setTall] = useState<number | null>(null)
  useEffect(() => {
    function fit() {
      const top = box.current?.getBoundingClientRect().top
      if (top === undefined) return
      setTall(window.innerHeight - top - PAGE_FOOT)
    }
    fit()
    window.addEventListener("resize", fit)
    return () => {
      window.removeEventListener("resize", fit)
    }
  }, [])

  const dragging = useRef(false)
  const onSeamDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])
  const onSeamMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const rect = box.current?.getBoundingClientRect()
    if (rect === undefined || rect.width === 0) return
    change({ split: held((event.clientX - rect.left) / rect.width) })
  }, [change])
  const onSeamUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])
  // The seam is a control, so it answers the keyboard as well as the pointer.
  const onSeamKey = useCallback((event: React.KeyboardEvent) => {
    const by = event.key === "ArrowLeft" ? -0.05 : event.key === "ArrowRight" ? 0.05 : 0
    if (by === 0) return
    event.preventDefault()
    change({ split: held(state.split + by) })
  }, [change, state.split])

  const shows = [
    { id: "both", label: words.both },
    { id: "left", label: words.left },
    { id: "right", label: words.right },
  ] as const

  const control = (
    <Choice
      label={words.showing}
      value={state.showing}
      options={shows}
      onChange={(showing) => { change({ showing }) }}
    />
  )

  function pane(side: "left" | "right") {
    const current = side === "left" ? state.left : state.right
    const shown = contents.find((one) => one.id === current) ?? contents[0]
    return (
      <>
        <SectionTabs
          label={words.holds}
          scope={side}
          tabs={contents.map((one) => ({ id: one.id, label: one.label }))}
          current={shown?.id ?? ""}
          onSelect={(id) => { change(side === "left" ? { left: id } : { right: id }) }}
        />
        <div className="min-h-0 flex-1 overflow-y-auto pt-4">{shown?.body}</div>
      </>
    )
  }

  const view = (
    <div
      ref={box}
      className="flex items-stretch"
      style={tall === null ? undefined : { height: `${tall}px` }}
    >
      {state.showing !== "right" && (
        <div
          className="flex min-w-0 flex-col"
          style={state.showing === "both" ? { width: `${state.split * 100}%` } : { flex: "1 1 0%" }}
        >
          {pane("left")}
        </div>
      )}
      {state.showing === "both" && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={words.seam}
          aria-valuenow={Math.round(state.split * 100)}
          tabIndex={0}
          onPointerDown={onSeamDown}
          onPointerMove={onSeamMove}
          onPointerUp={onSeamUp}
          onKeyDown={onSeamKey}
          className="w-2 shrink-0 cursor-col-resize bg-line hover:bg-brand"
        />
      )}
      {state.showing !== "left" && (
        <div className="flex min-w-0 flex-1 flex-col">{pane("right")}</div>
      )}
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
