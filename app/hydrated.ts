import { useSyncExternalStore } from "react"

/**
 * Whether the page is running in a browser yet.
 *
 * **For controls that only a browser can honour.** A close button rendered on
 * the server is a button that does nothing until the script arrives, and the
 * reader cannot tell the difference by looking; a cart drawn from
 * `sessionStorage` is empty on the server for a reason that is not "the cart is
 * empty". Both need to know which of the two they are in.
 *
 * It is not a piece of state: nothing ever changes it after the first render,
 * so there is nothing to subscribe to. The two snapshots are the whole of it.
 */
const noSubscription = () => () => undefined

export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false)
}
