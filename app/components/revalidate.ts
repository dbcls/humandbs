import { useEffect } from "react"
import { useRevalidator } from "react-router"

/** How often a screen waiting on a job that runs in the background reads itself again. */
export const WAITING_INTERVAL_MS = 3000

/**
 * Reads the screen's data again every few seconds while `waiting` — a file
 * switch or a move the screen shows as under way — and stops once what it
 * reads shows the job is over.
 *
 * **The jobs run in the app process, apart from any request**
 * (`files/runner.server.ts`), so nothing reaches the screen when one ends: without
 * this the screen goes on showing the job under way, and the controls it holds
 * back stay held back, until the reader reloads.
 *
 * A tick is skipped while the tab is hidden or a read is already in flight.
 * Reading again keeps what is typed into the screen's fields, since the
 * fields are not replaced by it.
 */
export function useRevalidateWhile(waiting: boolean): void {
  const revalidator = useRevalidator()
  useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || revalidator.state !== "idle") return
      void revalidator.revalidate()
    }, WAITING_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [waiting, revalidator])
}
