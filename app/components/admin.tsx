import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { Link, useLocation } from "react-router"

import { adminNavigation, isHere } from "~/admin/navigation"
import { Icon } from "~/components/icons"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

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
        className={`fixed inset-y-4 left-12 z-30 flex w-64 flex-col rounded-lg border border-line bg-white shadow-xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-[calc(100%+3.5rem)]"
        }`}
      >
        <div className="border-line border-b px-4 py-3">
          <span className="font-bold text-ink text-sm">{words.heading}</span>
        </div>
        <nav aria-label={words.navigation} className="flex flex-1 flex-col overflow-y-auto py-2">
          {adminNavigation(locale).map((entry) => {
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
