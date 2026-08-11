/**
 * What makes the caches refresh without anybody asking.
 *
 * **It runs inside the application process; there is no separate worker.** The
 * same judgement as the file switches: the work is one long query and a few
 * dozen requests, and a worker service would need its own configuration, its
 * own health check and its own place in the deployment to buy nothing. Several
 * processes may run this loop — the claim is a single statement, so only one of
 * them fetches (docs/data-model.md の「外部キャッシュ」).
 *
 * The loop looks often and acts rarely. Nothing here is urgent: a source is due
 * a day after it last succeeded, and looking every few minutes is only so that
 * a process which has just started does not wait a whole interval before
 * noticing that yesterday's refresh never happened.
 */

import { getDb } from "~/db/client.server"

import { claimDueSources, needsApplicationDb, runUpstreamRefresh } from "./refresh.server"
import { UPSTREAM_SOURCES, type UpstreamSource } from "./sources"
import { loadConfig } from "~/config.server"

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * An attempt still unfinished after this is assumed to have died with its
 * process. It is well above how long the slowest source takes (about half a
 * minute against production) so that a running refresh is never restarted
 * underneath itself.
 */
const ATTEMPT_TIMEOUT_MS = 60 * 60 * 1000

const TICK_MS = 10 * 60 * 1000

/**
 * The dev server re-evaluates modules on change; without this the timer would
 * be started again on every reload and the old one would keep running.
 */
const globalForRunner = globalThis as typeof globalThis & {
  humandbsUpstreamRunner?: { timer: NodeJS.Timeout, busy: boolean }
}

/**
 * The sources this deployment can reach at all. Without a connection to the
 * application system its three are not claimed, so the loop leaves no daily
 * trail of attempts that were never going to happen.
 */
function availableSources(): UpstreamSource[] {
  const configured = loadConfig(process.env).applicationDb !== null
  return UPSTREAM_SOURCES.filter((source) => configured || !needsApplicationDb(source))
}

async function tick(): Promise<void> {
  const state = globalForRunner.humandbsUpstreamRunner
  if (state === undefined || state.busy) return
  state.busy = true
  try {
    const db = getDb()
    const claimed = await claimDueSources(db, availableSources(), new Date(), {
      refreshMs: REFRESH_INTERVAL_MS,
      attemptTimeoutMs: ATTEMPT_TIMEOUT_MS,
    })
    if (claimed.length === 0) return
    await runUpstreamRefresh(db, claimed)
  } catch (error) {
    // There is no caller to answer to, and each source already records its own
    // reason; what reaches here is the loop itself failing.
    console.error("the upstream refresh loop failed", error)
  } finally {
    state.busy = false
  }
}

/** Start the loop. Calling it again while it runs does nothing. */
export function startUpstreamRunner(): void {
  if (globalForRunner.humandbsUpstreamRunner !== undefined) return
  const timer = setInterval(() => {
    void tick()
  }, TICK_MS)
  // The timer must not be what keeps the process alive.
  timer.unref()
  globalForRunner.humandbsUpstreamRunner = { timer, busy: false }
  void tick()
}
