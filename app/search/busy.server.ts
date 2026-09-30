/**
 * What the public search responds with when it cannot run now.
 *
 * The search runs on connections of its own, a few searches at a time, with a
 * limit on how long a search waits to start and for a connection, and on how
 * long one statement runs (`SEARCH_POOL`). **A search past any limit is refused
 * rather than queued for longer**: a queue that grows faster than it drains
 * holds every request in it for longer than anyone waits, and the results it
 * finally produces go to readers who have already left. A 503 with a time to
 * come back tells a person to try again and tells a crawler to slow down.
 */

import { SEARCH_POOL } from "~/db/client.server"

/** How long a refused search is asked to wait before it is sent again, in seconds. */
export const RETRY_AFTER_SECONDS = 30

/** The message pg-pool gives when no connection came free within its wait. */
const WAITED_TOO_LONG = "timeout exceeded when trying to connect"

/** The SQLSTATE of a statement cancelled by `statement_timeout`. */
const RAN_TOO_LONG = "57014"

/** A search that waited as long as it may to start while as many as may run were running. */
export class SearchesFull extends Error {
  constructor() {
    super("too many searches are running")
  }
}

/**
 * Whether an error is the search being refused by one of its limits. The query
 * builder wraps the driver's error in its own, so the chain of causes is read
 * rather than the error alone.
 */
export function isSearchBusy(error: unknown): boolean {
  const seen = new Set<unknown>()
  for (let at: unknown = error; at instanceof Error && !seen.has(at); at = at.cause) {
    seen.add(at)
    if (at instanceof SearchesFull) return true
    if (at.message === WAITED_TOO_LONG) return true
    if ((at as Error & { code?: unknown }).code === RAN_TOO_LONG) return true
  }
  return false
}

/**
 * Runs at most `size` of the calls given to it at once. A call past that waits
 * for one to finish, in the order the calls came, and is refused with
 * `SearchesFull` when none has finished within `waitMs`.
 */
export function limiter(limits: { size: number, waitMs: number }): <T>(run: () => Promise<T>) => Promise<T> {
  let running = 0
  const waiting: (() => void)[] = []

  // A finished call hands its place straight to the first one waiting, so a
  // call arriving in between cannot take it out of turn.
  const release = () => {
    const next = waiting.shift()
    if (next === undefined) running--
    else next()
  }

  const started = () => new Promise<void>((resolve, reject) => {
    if (running < limits.size) {
      running++
      resolve()
      return
    }
    const admit = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      waiting.splice(waiting.indexOf(admit), 1)
      reject(new SearchesFull())
    }, limits.waitMs)
    waiting.push(admit)
  })

  return async (run) => {
    await started()
    try {
      return await run()
    } finally {
      release()
    }
  }
}

/** Runs a search within `SEARCH_POOL.searches`, the page's, the export's and the API's alike. */
export const searching = limiter({ size: SEARCH_POOL.searches, waitMs: SEARCH_POOL.waitMs })

/**
 * Runs a page's or an export's search, answering 503 where the search is
 * refused. **The response is thrown**, the way a loader ends early; the site's
 * error page shows it as an error to try again later.
 */
export async function orBusy<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await searching(run)
  } catch (error) {
    if (isSearchBusy(error)) {
      throw new Response(null, {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Retry-After": String(RETRY_AFTER_SECONDS) },
      })
    }
    throw error
  }
}
