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
import { Link, useLocation } from "react-router"

import { adminDestinations, isHere } from "~/admin/navigation"
import { adminPath } from "~/admin/urls"
import { Icon } from "~/components/icons"
import { Crumbs } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import { IconButton, SectionTabs } from "./base"

/**
 * The trail into a management screen.
 *
 * **Every one of them starts at the area's front page**, which is what makes
 * the map there the way to all nineteen and back: a screen four levels down
 * used to carry one hand-written link to its parent, so getting out of a draft
 * meant three presses or finding the tab at the edge of the window.
 *
 * The trail below that step is the screen's own, and it names what the reader
 * came through rather than what the address spells — a research is a hum label
 * to the person reading it and a uuid in the URL.
 */
export function AdminCrumbs({ locale, trail = [], current }: {
  locale: Locale
  trail?: { label: string, to: string }[]
  current: string
}) {
  const words = messagesFor(locale).admin
  return (
    <Crumbs
      locale={locale}
      trail={[{ label: words.heading, to: href(locale, adminPath()) }, ...trail]}
      current={current}
    />
  )
}

/** How long a pointer may be between the handle and the card before it shuts. */
const LINGER = 200

/**
 * Where the management area can be gone from, and where it stays out of the way.
 *
 * **It is not in the bar.** The management screens want the whole window — a
 * research listing is eight columns, an editor is the same fields in two
 * languages side by side — so the destinations live against the left edge and
 * are drawn only when they are wanted.
 *
 * **What stands there is a tab, not a rule.** It is the only thing saying the
 * destinations exist, so it has to be found without being looked for: the
 * brand colour against the page's tint, the size of every other control, and
 * the same glyph the bar uses for a menu. Drawn narrower than it can be pressed
 * it read as a divider — nothing about a line one shade off the rules elsewhere
 * on the page says it is a way somewhere.
 *
 * **A mouse opens it by resting on the tab**, which is what makes a panel that
 * is usually shut worth having: reaching the destinations is a movement rather
 * than a press and a press back. It obeys the three things a thing shown on
 * hover has to (WCAG 1.4.13) — Escape dismisses it, the pointer can travel onto
 * it, and nothing takes it away on its own.
 *
 * **The tab stays where it is when the card comes out**, which is why the card
 * stands clear of the edge rather than against it. A control that disappeared
 * as it was used would take the keyboard's place on the page with it.
 *
 * **The card is in the markup whether it is open or not**, moved out of sight by
 * a transform, so that it can slide. Shut, it is `inert` — otherwise the tab
 * order would run through destinations nobody can see.
 */
export function AdminDrawer({ locale, path }: { locale: Locale, path: string }) {
  const words = messagesFor(locale).admin
  const { key } = useLocation()
  /**
   * **What is held is the page it was opened on, not a flag.** Choosing an
   * entry does not reload the page, so a panel that remembered only that it was
   * open would stand over whatever was asked for; comparing against the current
   * page shuts it on arrival without anything having to watch for that.
   */
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === key

  const box = useRef<HTMLDivElement>(null)
  const tab = useRef<HTMLButtonElement>(null)
  const linger = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // **Only while it is open.** The press that should shut it is by definition
    // not on the card, and the key is pressed wherever focus happens to be, so
    // both listen at the document — which is also why they may not be listening
    // when there is nothing to shut. Escape belongs to whatever the reader is
    // in the middle of, and an editing screen is a page of text fields.
    if (!open) return

    const onPress = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (box.current?.contains(event.target) === true) return
      if (tab.current?.contains(event.target) === true) return
      setOpenAt(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setOpenAt(null)
      // Focus goes back to what opened it: shutting a panel the reader is
      // inside would otherwise leave focus on nothing.
      tab.current?.focus()
    }
    document.addEventListener("pointerdown", onPress)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPress)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  useEffect(() => () => {
    if (linger.current !== null) clearTimeout(linger.current)
  }, [])

  const show = useCallback(() => {
    if (linger.current !== null) clearTimeout(linger.current)
    setOpenAt(key)
  }, [key])

  /**
   * **Not at once.** The tab is at the edge and the card stands clear of it, so
   * a pointer travelling between them crosses a gap that belongs to neither;
   * shutting on the first leave would make the card unreachable with a mouse.
   */
  const hideSoon = useCallback(() => {
    if (linger.current !== null) clearTimeout(linger.current)
    linger.current = setTimeout(() => {
      setOpenAt(null)
    }, LINGER)
  }, [])

  // A tap raises these too, and acting on one would open the card and then
  // shut it again with the press that follows.
  const onEnter = useCallback((event: ReactPointerEvent) => {
    if (event.pointerType === "mouse") show()
  }, [show])
  const onLeave = useCallback((event: ReactPointerEvent) => {
    if (event.pointerType === "mouse") hideSoon()
  }, [hideSoon])

  return (
    <>
      {/*
        **What is drawn is what can be pressed.** The tab is the 36px every
        other target has (`docs/ui.md` の「押せるものの大きさ」), filled rather
        than outlined so that the one thing naming the area is not a shade of
        the rules around it.
      */}
      <button
        ref={tab}
        type="button"
        aria-expanded={open}
        aria-controls="admin-drawer"
        aria-label={words.navigation}
        onClick={() => { setOpenAt(open ? null : key) }}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        className="-translate-y-1/2 fixed top-1/2 left-0 z-30 flex h-24 w-tap cursor-pointer items-center justify-center rounded-r-full bg-brand text-lg text-white shadow-md transition-colors hover:bg-brand-light"
      >
        <Icon name="menu" />
      </button>

      {/*
        **A card standing off the edge, not a wall against it.** It keeps the
        room at its sides that everything else on the page keeps, so the screen
        underneath is still a screen rather than something being covered up —
        and it begins past the tab, which stays pressable while it is out.

        **It starts on the same line the screen underneath starts on.** The
        screens are inset by the gutter their page keeps plus the 20px the area
        adds for the tab (`routes/admin-layout.tsx`), and the card is fixed to
        the window, so it has to name that sum itself: 16 + 20 narrow, 24 + 20
        from `sm` up. Standing 4px off it read as a card that had missed the
        line rather than one laid over it.

        **The shadow reaches sideways.** The card is white over screens that are
        themselves white cards, so the only thing between them is a 1px rule —
        and the shadow scale offsets downwards only, which on a panel as tall as
        the window falls off the bottom of the screen where nobody sees it. What
        says "laid on top" is a soft shadow off the near edge.

        **Shut, it clears the window by more than that shadow reaches**, or the
        page would carry a smudge down its left edge with nothing casting it.

        **It has no way to shut it of its own.** The tab does that, and so does
        pressing anywhere else, and Escape, and going somewhere — a panel that
        is opened by resting a pointer on an edge is not one anybody goes
        looking for a button inside of.
      */}
      <div
        id="admin-drawer"
        ref={box}
        inert={!open}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        className={`fixed inset-y-4 left-9 z-30 flex w-64 flex-col rounded-lg border border-line bg-white shadow-[4px_0_16px_rgba(0,34,69,0.16)] transition-transform duration-200 ease-out sm:left-11 ${
          open ? "translate-x-0" : "-translate-x-[calc(100%+4.5rem)]"
        }`}
      >
        <div className="border-line border-b px-4 py-3">
          <span className="font-bold text-ink text-sm">{words.heading}</span>
        </div>
        <nav aria-label={words.navigation} className="flex flex-1 flex-col overflow-y-auto py-2">
          {adminDestinations(locale).map((entry) => {
            const current = isHere(entry, path)
            return (
              <Link
                key={entry.path}
                to={href(locale, entry.path)}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-tap items-center px-4 py-2 text-sm no-underline hover:bg-surface-hover ${
                  current ? "font-bold text-brand" : "text-ink"
                }`}
              >
                {entry.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </>
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
    <div role="group" aria-label={words.showing} className="flex items-center gap-1">
      {shows.map((one) => (
        <button
          key={one.id}
          type="button"
          aria-pressed={state.showing === one.id}
          onClick={() => { change({ showing: one.id }) }}
          className={`inline-flex h-tap cursor-pointer items-center rounded border px-3 text-sm ${
            state.showing === one.id
              ? "border-brand bg-brand text-white"
              : "border-line bg-white text-ink hover:bg-surface-hover"
          }`}
        >
          {one.label}
        </button>
      ))}
    </div>
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
