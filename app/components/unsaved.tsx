/**
 * Unsent work, and the way off a screen that asks before losing it.
 *
 * **One place holds who has unsent work, and one guard reads it.** A screen
 * may hold several forms at once — an alert per language, a language per
 * article, a row's panel over a table — and the router takes one blocker at a
 * time; so each form says here whether it is holding anything, and the guard
 * standing in the area's layout is the one thing that asks the router to wait.
 *
 * **The guard reads the live answer, not a rendered one.** Sending a form is a
 * navigation too, and the form lets go of its hold in the same event that
 * sends it; a blocker holding a value captured at the last render would still
 * stop the save. Reading the set itself at the moment of asking means letting
 * go takes effect before the router looks.
 *
 * **Two ways off, two askers.** A way inside the area is a router navigation
 * and gets the site's own panel; reloading and closing the window are the
 * browser's, and only its own question can stand in their way.
 */

import { useEffect, useId } from "react"
import { useBeforeUnload, useBlocker } from "react-router"

import { Button, Chevron, Dialog } from "~/components/base"
import { messagesFor } from "~/i18n/messages"

const held = new Set<string>()

/** What one form (or one editing screen) says about itself. Idempotent. */
export function holdUnsaved(id: string, dirty: boolean): void {
  if (dirty) held.add(id)
  else held.delete(id)
}

export function anyUnsaved(): boolean {
  return held.size > 0
}

/**
 * For a screen that knows its own "has this been typed into" answer rather
 * than sending a form (the draft editors, `draft-tools.tsx`). A form that
 * sends itself holds and lets go on its own (`form.tsx` の `Editing`).
 */
export function useHoldsUnsaved(dirty: boolean): void {
  const id = useId()
  useEffect(() => {
    holdUnsaved(id, dirty)
    return () => {
      holdUnsaved(id, false)
    }
  }, [id, dirty])
}

function shouldBlockLeave(): boolean {
  return anyUnsaved()
}

function askBeforeUnload(event: BeforeUnloadEvent): void {
  if (!anyUnsaved()) return
  event.preventDefault()
}

/**
 * Stands once, in the management area's layout. Draws nothing until a way
 * off the screen has been taken with unsent work behind it; then the panel,
 * whose way out puts the reader back where they were.
 */
export function LeaveGuard() {
  const t = messagesFor("ja").admin.leave
  const blocker = useBlocker(shouldBlockLeave)
  useBeforeUnload(askBeforeUnload)

  return (
    <Dialog
      title={t.title}
      note={t.leaveWarning}
      held={{ open: blocker.state === "blocked", close: () => { blocker.reset?.() } }}
      action={() => (
        <Button
          type="button"
          variant="danger"
          icon={<Chevron dir="right" />}
          onClick={() => { blocker.proceed?.() }}
        >
          {t.confirm}
        </Button>
      )}
    />
  )
}
