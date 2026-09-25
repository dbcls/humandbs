import { useEffect, useRef, useState } from "react"
import { useFetchers, useLocation, useNavigation } from "react-router"

/**
 * How long a navigation has to have been under way before the page admits to it.
 *
 * **Below this the reader sees nothing change**, which covers most of what the
 * listings do: the loader responds in 12–62ms, and an indicator put up and taken away
 * inside a fifth of a second reads as a flicker rather than as an answer.
 */
export const SHOW_BUSY_AFTER = 200

/**
 * Whether a navigation to the address already on screen is still under way.
 *
 * **Refining is not going anywhere.** Choosing a facet value, sorting, or paging
 * lands on the same path with a different query, and what changes is the middle
 * of the page — so the page stays where it is and signals that the part which is
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

/**
 * Whether a submission is on its way to a route action — by navigation or by a fetcher.
 *
 * **Reading is not sending.** A listing narrowed by its pane, or the pane
 * beside a form requesting the page, is a load: nothing the reader pressed is
 * waiting on it. What is held is the action in flight, and it stays in flight
 * through the read that follows it, until the screen shows what it did.
 */
export function useSubmitting(): boolean {
  const navigation = useNavigation()
  const fetchers = useFetchers()
  const sends = (method: string | undefined): boolean =>
    method !== undefined && method.toUpperCase() !== "GET"
  return (navigation.state !== "idle" && sends(navigation.formMethod))
    || fetchers.some((fetcher) => fetcher.state !== "idle" && sends(fetcher.formMethod))
}

/**
 * Whether the action a control started is still in flight.
 *
 * **Only the control that was pressed shows it is waiting.** Every submit on
 * the page could read the same navigation, and every one would then dim
 * together; what the reader pressed is what has to respond, and the press is
 * the one thing each control knows about itself.
 *
 * **The press is remembered until a sending has ended**, not until the next
 * render: the press and the router's first word about it can land in different
 * renders, and clearing on a render in which nothing is being sent yet would
 * forget the press before it counted. A press the browser refuses to send —
 * a required box left empty — is not remembered at all.
 */
export function usePressed(): { pending: boolean, press: (form: HTMLFormElement | null) => void } {
  const submitting = useSubmitting()
  const pressed = useRef(false)
  const wasSubmitting = useRef(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (submitting && pressed.current) setPending(true)
    if (!submitting && wasSubmitting.current) {
      pressed.current = false
      setPending(false)
    }
    wasSubmitting.current = submitting
  }, [submitting])

  return {
    pending,
    press: (form) => {
      if (form !== null && !form.noValidate && !form.checkValidity()) return
      pressed.current = true
    },
  }
}
