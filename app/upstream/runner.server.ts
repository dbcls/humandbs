/**
 * What makes the caches refresh without anybody asking for it.
 *
 * **It runs inside the application process; there is no separate worker.** The
 * same judgement as the file switches: the work is a few long queries and a few
 * hundred requests, and a worker service would need its own configuration, its
 * own health check and its own place in the deployment to buy nothing. Several
 * processes may run this loop — the claim is a single statement, so only one of
 * them fetches.
 *
 * The loop looks every minute and acts at the boundaries of the configured
 * interval (`claimDueSources`), so a refresh starts within a minute of the
 * clock time it falls on. A deployment configured with no interval does not
 * start the loop at all, and is refreshed from the command line.
 */

import { loadConfig } from "~/config.server"
import { getDb } from "~/db/client.server"

import { claimDueSources, needsApplicationDb, runUpstreamRefresh } from "./refresh.server"
import { UPSTREAM_SOURCES, type UpstreamSource } from "./sources"

/**
 * How long after an attempt a source is tried again, whether that attempt
 * failed or died with its process. It is well above how long the slowest source
 * takes (a few minutes against production) so that a running refresh is never
 * restarted underneath itself, and short enough that an outage of the
 * application system costs an hour of freshness rather than an interval.
 */
const RETRY_MS = 60 * 60 * 1000

const TICK_MS = 60 * 1000

/**
 * The dev server re-evaluates modules on change; without this the timer would
 * be started again on every reload and the old one would keep running.
 */
const globalForRunner = globalThis as typeof globalThis & {
  humandbsUpstreamRunner?: { timer: NodeJS.Timeout, busy: boolean }
}

/**
 * The sources this deployment can reach at all. Without a connection to the
 * application system its six are not claimed, so the loop leaves no trail of
 * attempts that were never going to happen.
 */
function availableSources(): UpstreamSource[] {
  const configured = loadConfig(process.env).applicationDb !== null
  return UPSTREAM_SOURCES.filter((source) => configured || !needsApplicationDb(source))
}

async function tick(minutes: number): Promise<void> {
  const state = globalForRunner.humandbsUpstreamRunner
  if (state === undefined || state.busy) return
  state.busy = true
  try {
    const db = getDb()
    const claimed = await claimDueSources(db, availableSources(), new Date(), { minutes, retryMs: RETRY_MS })
    if (claimed.length === 0) return
    await runUpstreamRefresh(db, claimed)
  } catch (error) {
    // There is no caller to respond to, and each source already records its own
    // reason; what reaches here is the loop itself failing.
    console.error("the upstream refresh loop failed", error)
  } finally {
    state.busy = false
  }
}

/** Start the loop. Calling it again while it runs, or with no interval configured, does nothing. */
export function startUpstreamRunner(): void {
  if (globalForRunner.humandbsUpstreamRunner !== undefined) return
  const minutes = loadConfig(process.env).upstreamIntervalMinutes
  if (minutes === 0) return
  const timer = setInterval(() => {
    void tick(minutes)
  }, TICK_MS)
  // The timer must not be what keeps the process alive.
  timer.unref()
  globalForRunner.humandbsUpstreamRunner = { timer, busy: false }
  void tick(minutes)
}
