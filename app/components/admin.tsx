import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { Link, useLocation } from "react-router"

import { adminNavigation, isHere } from "~/admin/navigation"
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
 * are drawn only when they are wanted. What is permanently on screen is a grip
 * six pixels wide.
 *
 * **A mouse opens it by resting on the grip**, which is what makes a panel that
 * is usually shut worth having: reaching the destinations is a movement rather
 * than a press and a press back. It obeys the three things a thing shown on
 * hover has to (WCAG 1.4.13) — Escape dismisses it, the pointer can travel onto
 * it, and nothing takes it away on its own.
 *
 * **The grip is a button.** The zone alone would be reachable by neither the
 * keyboard nor a finger, and both open it the way they open anything.
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
  const grip = useRef<HTMLButtonElement>(null)
  const linger = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // The press that should shut it is by definition not on the card, and the
    // key is pressed wherever focus happens to be, so both listen at the
    // document. They do nothing while it is shut.
    const onPress = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (box.current?.contains(event.target) === true) return
      if (grip.current?.contains(event.target) === true) return
      setOpenAt(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setOpenAt(null)
      // Focus goes back to what opened it: shutting a panel the reader is
      // inside would otherwise leave focus on nothing.
      grip.current?.focus()
    }
    document.addEventListener("pointerdown", onPress)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPress)
      document.removeEventListener("keydown", onKey)
    }
  }, [])

  useEffect(() => () => {
    if (linger.current !== null) clearTimeout(linger.current)
  }, [])

  const show = useCallback(() => {
    if (linger.current !== null) clearTimeout(linger.current)
    setOpenAt(key)
  }, [key])

  /**
   * **Not at once.** The grip is at the edge and the card stands away from it,
   * so a pointer travelling between them crosses a gap that belongs to neither;
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
        **What is drawn is narrower than what can be pressed.** The mark is six
        pixels of the edge; the button around it keeps the 36px every other
        target has (`docs/ui.md` の「押せるものの大きさ」).
      */}
      <button
        ref={grip}
        type="button"
        aria-expanded={open}
        aria-controls="admin-drawer"
        aria-label={words.navigation}
        onClick={() => { setOpenAt(open ? null : key) }}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        className={`group -translate-y-1/2 fixed top-1/2 left-0 z-30 flex h-24 w-tap cursor-pointer items-center justify-start transition-opacity ${
          open ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <span className="h-16 w-1.5 rounded-r bg-line transition-colors group-hover:bg-brand group-focus-visible:bg-brand" />
      </button>

      {/*
        **A card standing off the edge, not a wall against it.** It keeps the
        room at its sides that everything else on the page keeps, so the screen
        underneath is still a screen rather than something being covered up.

        **It has no way to shut it of its own.** Pressing anywhere else does
        that, and so does Escape and going somewhere — a panel that is opened by
        resting a pointer on an edge is not one anybody goes looking for a
        button inside of.
      */}
      <div
        id="admin-drawer"
        ref={box}
        inert={!open}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        className={`fixed inset-y-4 left-4 z-30 flex w-64 flex-col rounded-lg border border-line bg-white shadow-xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-[calc(100%+1.5rem)]"
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
