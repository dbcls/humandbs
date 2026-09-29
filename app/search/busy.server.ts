/**
 * What the public search responds with when it cannot run now.
 *
 * The search runs on connections of its own, a few of them, with a limit on how
 * long a search waits for one and on how long one statement runs
 * (`getSearchDb`). **A search past either limit is refused rather than queued**:
 * a queue that grows faster than it drains holds every request in it for longer
 * than anyone waits, and the results it finally produces go to readers who have
 * already left. A 503 with a time to come back tells a person to try again and
 * tells a crawler to slow down.
 */

/** How long a refused search is asked to wait before it is sent again, in seconds. */
export const RETRY_AFTER_SECONDS = 30

/** The message pg-pool gives when no connection came free within its wait. */
const WAITED_TOO_LONG = "timeout exceeded when trying to connect"

/** The SQLSTATE of a statement cancelled by `statement_timeout`. */
const RAN_TOO_LONG = "57014"

/**
 * Whether an error is the search being refused by one of its limits. The query
 * builder wraps the driver's error in its own, so the chain of causes is read
 * rather than the error alone.
 */
export function isSearchBusy(error: unknown): boolean {
  const seen = new Set<unknown>()
  for (let at: unknown = error; at instanceof Error && !seen.has(at); at = at.cause) {
    seen.add(at)
    if (at.message === WAITED_TOO_LONG) return true
    if ((at as Error & { code?: unknown }).code === RAN_TOO_LONG) return true
  }
  return false
}

/**
 * Runs a page's or an export's search, answering 503 where the search is
 * refused. **The response is thrown**, the way a loader ends early; the site's
 * error page shows it as an error to try again later.
 */
export async function orBusy<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
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
