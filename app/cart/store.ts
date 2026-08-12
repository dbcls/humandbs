/**
 * The datasets a reader has collected on their way to an application.
 *
 * **The cart is not part of the portal's data.** Applying for controlled-access
 * data happens in the JGA application system, and what the portal does is help
 * somebody gather the accessions to paste into it: the cart's whole output is
 * the block of JSON on `/cart`. So it is held in the browser and nowhere else —
 * no row, no account, nothing to migrate, and nothing to keep in step.
 *
 * **`sessionStorage` rather than `localStorage`**, because a cart is a task
 * somebody is in the middle of rather than a preference. A shared terminal
 * would otherwise hand the next reader the previous one's collection, and
 * storing something beyond a visit is a choice that has to earn itself.
 *
 * **Only JGA datasets go in.** They are the ones the application system takes;
 * an unrestricted-access dataset needs no application at all, and a portal-issued
 * NHA id would have nowhere to be pasted.
 */

import { useCallback, useSyncExternalStore } from "react"

const KEY = "humandbs.cart"

/**
 * How many a cart may hold. The application form is filled in by hand at the
 * other end, and the largest research has over two hundred datasets — without a
 * ceiling, "add every dataset on the page" would produce something nobody can
 * check.
 */
export const CART_LIMIT = 100

/**
 * Case-sensitive: the ids that reach here are the labels the archive issued and
 * the portal pinned, which are upper case. Accepting `jgad000117` as well would
 * let the same dataset sit in the cart twice under two spellings.
 */
const JGA_DATASET = /^JGAD\d+$/

/** Whether this dataset is one an application can be made for. */
export function isCartable(datasetId: string): boolean {
  return JGA_DATASET.test(datasetId)
}

/** The stored value, ignoring anything that is not a list of cartable ids. */
export function parseCart(raw: string | null): string[] {
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const ids = (parsed as unknown[]).filter(
    (id): id is string => typeof id === "string" && isCartable(id),
  )
  return [...new Set(ids)].slice(0, CART_LIMIT)
}

/**
 * Adding keeps the order things were put in and drops what does not fit — a
 * reader who adds forty rows at once should get the first of them rather than
 * an error, and the ones already in the cart are not moved.
 */
export function addToCart(current: string[], ids: string[]): string[] {
  const held = new Set(current)
  const added = ids.filter((id) => isCartable(id) && !held.has(id))
  return [...current, ...new Set(added)].slice(0, CART_LIMIT)
}

export function removeFromCart(current: string[], ids: string[]): string[] {
  const dropped = new Set(ids)
  return current.filter((id) => !dropped.has(id))
}

/**
 * Where an application is actually made. The portal collects the accessions and
 * hands the reader on; nothing about the application itself lives here.
 */
export const APPLICATION_FORM_URL
  = "https://humandbs.ddbj.nig.ac.jp/nbdc/application/dataset_import"

/**
 * What gets pasted into the application form: one component per dataset, under
 * the key the form reads. The shape is the one v1 produced, because the thing
 * at the other end has not changed.
 */
export function applicationPayload(ids: string[]): string {
  return JSON.stringify(
    { components: ids.map((id) => ({ key: "use_dataset_request", value: id })) },
    null,
    2,
  )
}

/* ------------------------------------------------------- the live cart */

const EMPTY: string[] = []

const listeners = new Set<() => void>()

/**
 * `useSyncExternalStore` compares snapshots by identity, so parsing on every
 * read would loop forever. The parse is kept against the raw string it came
 * from, which also makes a write from another tab (which does fire `storage`)
 * come out as a new value.
 */
let cached: { raw: string | null, value: string[] } = { raw: null, value: EMPTY }

/**
 * **Reaching the store can throw**, not just return nothing: a browser set to
 * block all storage, and an iframe with a restrictive sandbox, both raise on
 * the property itself. This is a `getSnapshot`, so it runs during render — and
 * the header carries it, so a throw here would take down every page and the
 * error boundary with it. A reader with storage turned off gets a cart that
 * cannot remember anything, which is the worst that should happen.
 */
function readCart(): string[] {
  let raw: string | null
  try {
    raw = window.sessionStorage.getItem(KEY)
  } catch {
    return EMPTY
  }
  if (raw === cached.raw) return cached.value
  cached = { raw, value: parseCart(raw) }
  return cached.value
}

function writeCart(next: string[]): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    return
  }
  // `storage` is not delivered to the tab that wrote, so this tab is told here.
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

/** The server has no cart, so a page renders as if it were empty and fills in. */
function serverSnapshot(): string[] {
  return EMPTY
}

export interface Cart {
  ids: string[]
  add: (ids: string[]) => void
  remove: (ids: string[]) => void
}

/**
 * Whether the page is running in a browser yet.
 *
 * The cart is empty on the server, so a screen that draws from it has to know
 * whether "empty" means "nothing collected" or "not asked yet" — otherwise the
 * cart page renders as empty for everybody and fills in a frame later.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false)
}

export function useCart(): Cart {
  const ids = useSyncExternalStore(subscribe, readCart, serverSnapshot)
  const add = useCallback((toAdd: string[]) => {
    writeCart(addToCart(readCart(), toAdd))
  }, [])
  const remove = useCallback((toRemove: string[]) => {
    writeCart(removeFromCart(readCart(), toRemove))
  }, [])
  return { ids, add, remove }
}
