/**
 * The catalog the public side reads, kept in memory between requests.
 *
 * **Read again only once the catalog has changed.** The catalog is every key
 * and every vocabulary term, and ICD10 alone is over ten thousand terms: read on
 * every request, it is most of what a listing or a page costs to answer. A
 * trigger on each table `loadCatalog` reads notifies `CATALOG_CHANNEL` when a
 * change commits (`drizzle/0016_catalog_changed.sql`), and a connection of its
 * own listens on the channel.
 *
 * **A change committed before a request is in the catalog the request reads.**
 * A notification arrives a moment after its commit, so each read first sends a
 * statement on the listening connection: the server hands a connection the
 * notifications waiting for it before it answers a statement, so once the
 * answer is back every change committed until then has been heard.
 *
 * **Nothing is kept while nobody is listening.** A notification sent while the
 * listening connection is down is lost, and a catalog kept across that gap
 * could stay old for good, so every request reads the catalog itself until the
 * connection is back.
 *
 * **A catalog read while a change arrived is not kept.** The read may have
 * begun before the change committed, and then what it holds is the catalog from
 * before it.
 *
 * The management screens and the preview read `loadCatalog` directly: they may
 * read inside the transaction that changes the catalog, and what they read has
 * to be what that transaction sees.
 */

import type { Client } from "pg"

import { listenerClient, type Executor } from "~/db/client.server"

import { loadCatalog } from "./queries.server"
import type { CatalogView } from "./view.server"

/** The channel `drizzle/0016_catalog_changed.sql` notifies. */
export const CATALOG_CHANNEL = "catalog_changed"

/** How long to go on reading the catalog on every request after a failed attempt to listen. */
const RETRY_MS = 10_000

interface Kept {
  listener: Client | null
  connecting: Promise<boolean> | null
  retryAt: number
  catalog: CatalogView | null
  /** Counts every notification and every lost listener, so that a read can tell one came during it. */
  changes: number
  /** The last statement sent on the listening connection, which the next one waits for. */
  sent: Promise<unknown>
}

/** On `globalThis` for the reason the pools are (`~/db/client.server`). */
const globalForCatalog = globalThis as typeof globalThis & { humandbsCatalog?: Kept }

function kept(): Kept {
  return globalForCatalog.humandbsCatalog ??= {
    listener: null,
    connecting: null,
    retryAt: 0,
    catalog: null,
    changes: 0,
    sent: Promise.resolve(),
  }
}

function forget(state: Kept): void {
  state.catalog = null
  state.changes++
}

function drop(state: Kept, client: Client): void {
  if (state.listener === client) {
    state.listener = null
    forget(state)
  }
  client.end().catch(() => undefined)
}

async function listen(state: Kept): Promise<boolean> {
  const client = listenerClient(CATALOG_CHANNEL)
  client.on("notification", () => {
    forget(state)
  })
  client.on("error", () => {
    drop(state, client)
  })
  client.on("end", () => {
    drop(state, client)
  })
  try {
    await client.connect()
    await client.query(`LISTEN ${CATALOG_CHANNEL}`)
  } catch {
    drop(state, client)
    state.retryAt = Date.now() + RETRY_MS
    return false
  }
  state.listener = client
  return true
}

/** Whether the listening connection is up and has handed over every notification sent before now. */
async function caughtUp(state: Kept): Promise<boolean> {
  if (state.listener === null) {
    if (Date.now() < state.retryAt) return false
    state.connecting ??= listen(state).finally(() => {
      state.connecting = null
    })
    if (!await state.connecting) return false
  }
  const listener = state.listener
  if (listener === null) return false
  // One statement at a time: a client of the driver runs the statements it is
  // given one after another, but no longer promises to hold the ones waiting.
  const sent = state.sent.then(() => listener.query("SELECT 1"))
  state.sent = sent.catch(() => undefined)
  try {
    await sent
  } catch {
    drop(state, listener)
    return false
  }
  return state.listener === listener
}

/**
 * The catalog as `loadCatalog` reads it, from memory where nothing has changed
 * since it was read. **Shared between requests**, which the read-only maps of
 * `CatalogView` are what make safe.
 */
export async function publicCatalog(db: Executor): Promise<CatalogView> {
  const state = kept()
  if (!await caughtUp(state)) return loadCatalog(db)
  if (state.catalog !== null) return state.catalog
  const before = state.changes
  const catalog = await loadCatalog(db)
  if (state.changes === before && state.listener !== null) state.catalog = catalog
  return catalog
}
