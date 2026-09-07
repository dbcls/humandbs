import { useEffect, useState } from "react"
import { useLocation, useNavigation } from "react-router"

/**
 * How long a navigation has to have been under way before the page admits to it.
 *
 * **Below this the reader sees nothing change**, which covers most of what the
 * listings do: the loader answers in 12–62ms, and a mark put up and taken away
 * inside a fifth of a second reads as a flicker rather than as an answer.
 */
export const SHOW_BUSY_AFTER = 200

/**
 * Whether a navigation to the address already on screen is still under way.
 *
 * **Refining is not going anywhere.** Choosing a facet value, sorting, or paging
 * lands on the same path with a different query, and what changes is the middle
 * of the page — so the page stays where it is and says that the part which is
 * about to change is not the answer yet. Following a row to a research page is a
 * different path and reads as leaving, so nothing there is dimmed: the page the
 * reader is leaving has no reason to look unwell on the way out.
 *
 * **The delay is what keeps this from being noise.** Held until
 * `SHOW_BUSY_AFTER`, the busy state exists for the slow connection and the slow
 * response, and never for the local one.
 */
export function useBusyHere(): boolean {
  const navigation = useNavigation()
  const location = useLocation()
  const going = navigation.state === "loading"
    && navigation.location.pathname === location.pathname
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!going) {
      setShown(false)
      return
    }
    const waiting = window.setTimeout(() => {
      setShown(true)
    }, SHOW_BUSY_AFTER)
    return () => {
      window.clearTimeout(waiting)
    }
  }, [going])

  return shown
}
