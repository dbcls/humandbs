/**
 * The datasets a reader has collected on their way to an application.
 *
 * **The cart is not part of the portal's data.** Applying for controlled-access
 * data happens in the JGA application system, and what the portal does is help
 * somebody gather the accessions to paste into it: the cart's whole output is
 * the block of JSON on `/cart`. So it is held in the browser and nowhere else —
 * no row, no account, nothing to migrate, and nothing to keep in step.
 *
 * **`localStorage`, so it outlives the window.** Gathering the datasets for one
 * application is not one sitting's work — a reader picks through several
 * research pages and comes back the next day, and would otherwise find the
 * collection gone with nothing to say it had ever been there. What is kept is a list of published
 * accessions and nothing else: no name, no session, nothing about the person.
 * A shared terminal does hand the next reader what was left behind, which is
 * why **emptying it is one press** from the bar and from the cart's own page.
 *
 * It also means the two tabs a reader has open agree: `storage` fires across
 * them, and `subscribe` was already listening for it.
 *
 * **Only JGA datasets go in.** They are the ones the application system takes;
 * an unrestricted-access dataset needs no application at all, and a portal-issued
 * NHA id would have nowhere to be pasted.
 *
 * **There is no ceiling on how many.** There was one, of a hundred, and what it
 * held back was a mark that put a whole page of results in at once — a control
 * that no longer exists. On its own a reader cannot reach that far: the largest
 * research holds 95 JGA datasets, and every one in the portal comes to 681,
 * which is 37 KB of the 5 MB the browser will keep. A number the portal made up
 * cannot stand in for a limit the application system might have, either — if
 * there is one at the far end, a hundred is not it.
 */

import { useCallback, useSyncExternalStore } from "react"

const KEY = "humandbs.cart"

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
  return [...new Set(ids)]
}

/**
 * Adding keeps the order things were put in, and what is already in the cart is
 * not moved to the end of it.
 */
export function addToCart(current: string[], ids: string[]): string[] {
  const held = new Set(current)
  const added = ids.filter((id) => isCartable(id) && !held.has(id))
  return [...current, ...new Set(added)]
}

export function removeFromCart(current: string[], ids: string[]): string[] {
  const dropped = new Set(ids)
  return current.filter((id) => !dropped.has(id))
}

/**
 * Whether pressing a cart mark gathers what it stands for, or lets it go.
 *
 * **Pressing again always undoes.** A mark stands for every dataset under a
 * row, so a press gathers while any of them is still out, and lets the whole
 * row go once they are all in. A reader always gets back out through the
 * control they came in by.
 */
export function cartPressGathers(current: string[], ids: string[]): boolean {
  const cartable = new Set(ids.filter(isCartable))
  const inCart = new Set(current)
  let held = 0
  for (const id of cartable) if (inCart.has(id)) held += 1
  return held < cartable.size
}

/* ------------------------------------------------------ saying what moved */

/**
 * What to say about a press, and how to take it back.
 *
 * **The cart is not where the reader is looking.** The count sits in the top
 * bar, and a mark pressed at the foot of a listing is two thousand pixels below
 * it — so without this, the only thing that answers a press is the colour of a
 * 36px glyph. What is said belongs beside the press.
 *
 * **`before` is the way back.** Holding the whole list rather than the
 * difference is what lets one control undo a press that both added and dropped,
 * and the list is a hundred short strings at the very most.
 */
export interface CartNotice {
  kind: "added" | "removed"
  /** How many ids moved. Never zero: a press that moves nothing says nothing. */
  count: number
  /** The one id that moved, when exactly one did: the reader wants to see it. */
  only: string | null
  /** How many the cart holds now. */
  total: number
  /** What it held before. */
  before: string[]
  /** Tells one notice from the next when the two would read the same. */
  at: number
}

/**
 * Reads a press from the cart on either side of it.
 *
 * **A press that moves nothing has nothing to say.** Every mark either gathers
 * what is still out or lets go of what is in, so the only way to arrive here
 * with an unchanged cart is to press one that stands for no cartable dataset —
 * and those are not drawn at all.
 */
export function noticeOf(before: string[], after: string[], at: number): CartNotice | null {
  const moved = after.length - before.length
  if (moved === 0) return null
  const held = new Set(before)
  if (moved > 0) {
    const added = after.filter((id) => !held.has(id))
    return {
      kind: "added",
      count: moved,
      only: added.length === 1 ? (added[0] ?? null) : null,
      total: after.length,
      before,
      at,
    }
  }
  const gone = before.filter((id) => !after.includes(id))
  return {
    kind: "removed",
    count: -moved,
    only: gone.length === 1 ? (gone[0] ?? null) : null,
    total: after.length,
    before,
    at,
  }
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
    raw = window.localStorage.getItem(KEY)
  } catch {
    return EMPTY
  }
  if (raw === cached.raw) return cached.value
  cached = { raw, value: parseCart(raw) }
  return cached.value
}

/** Whether the cart actually changed: storage may be blocked (see `readCart`). */
function writeCart(next: string[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    return false
  }
  // `storage` is delivered to the other tabs but never to the one that wrote,
  // so this tab is told here.
  for (const listener of listeners) listener()
  return true
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
  /** Whether the cart holds this dataset. */
  holds: (id: string) => boolean
  add: (ids: string[]) => void
  remove: (ids: string[]) => void
}

/**
 * The cart as a set, for the marks that ask whether they are in it.
 *
 * **Made once per cart rather than once per mark.** A page of a listing draws a
 * hundred marks, each standing for as many as ninety-five datasets, against a
 * cart that can hold hundreds; asked of a list, one page is millions of
 * comparisons, and every press asks again. The snapshot is the same array until
 * the cart changes, which is what lets one set answer for all of them.
 */
let membership: { of: string[], set: Set<string> } = { of: EMPTY, set: new Set() }

function heldIn(ids: string[]): Set<string> {
  if (membership.of !== ids) membership = { of: ids, set: new Set(ids) }
  return membership.set
}

/**
 * The last press, and what it takes to answer for it.
 *
 * **One at a time.** Two notices stacked would make the reader choose which to
 * read before either goes, and the second is always the one they just caused.
 */
let notice: CartNotice | null = null
let pressed = 0
const noticeListeners = new Set<() => void>()

function setNotice(next: CartNotice | null): void {
  notice = next
  for (const listener of noticeListeners) listener()
}

function subscribeNotice(listener: () => void): () => void {
  noticeListeners.add(listener)
  return () => {
    noticeListeners.delete(listener)
  }
}

function readNotice(): CartNotice | null {
  return notice
}

function serverNotice(): null {
  return null
}

/**
 * Every way the cart changes goes through here, so that every way of changing
 * it is answered for. **A press that could not be written says nothing** — a
 * reader whose browser blocks storage is told the cart is empty by the cart
 * itself, and telling them something went in as well would be a lie.
 */
function press(
  move: (current: string[], ids: string[]) => string[],
  ids: string[],
): void {
  const before = readCart()
  const after = move(before, ids)
  if (before.length === after.length) return
  if (!writeCart(after)) return
  setNotice(noticeOf(before, after, ++pressed))
}

export function useCart(): Cart {
  const ids = useSyncExternalStore(subscribe, readCart, serverSnapshot)
  const holds = useCallback((id: string) => heldIn(ids).has(id), [ids])
  const add = useCallback((toAdd: string[]) => {
    press(addToCart, toAdd)
  }, [])
  const remove = useCallback((toRemove: string[]) => {
    press(removeFromCart, toRemove)
  }, [])
  return { ids, holds, add, remove }
}

export interface CartNoticeControl {
  notice: CartNotice | null
  dismiss: () => void
  /** Puts the cart back as it was before the notice. */
  undo: () => void
}

/**
 * Kept apart from `useCart` because every mark on a listing holds a cart: a
 * notice arriving would otherwise redraw all twenty of them.
 */
export function useCartNotice(): CartNoticeControl {
  const current = useSyncExternalStore(subscribeNotice, readNotice, serverNotice)
  const dismiss = useCallback(() => {
    setNotice(null)
  }, [])
  // Read from the module rather than from `current`: the way back belongs to
  // the notice standing when the press lands, not to the one this render saw.
  const undo = useCallback(() => {
    const back = notice?.before
    if (back === undefined) return
    if (writeCart(back)) setNotice(null)
  }, [])
  return { notice: current, dismiss, undo }
}
