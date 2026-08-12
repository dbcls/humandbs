/**
 * What actually runs the file switches.
 *
 * **It runs inside the application process; there is no separate worker.** The
 * bytes move within the store, so all this process does is hold a socket open
 * and wait — and `SKIP LOCKED` means several processes can run the loop without
 * either of them starting the same copy. A worker service would need its own
 * configuration, its own health check and its own place in the deployment, to
 * buy nothing (docs/files.md).
 *
 * It is woken as soon as something is queued, and otherwise looks every few
 * seconds. Attempts abandoned by a process that stopped are made to wait again
 * on the first look after start-up.
 */

import { getDb } from "~/db/client.server"

import { recoverAbandoned, runOneJob } from "./jobs.server"

const IDLE_INTERVAL_MS = 5_000

/**
 * The dev server re-evaluates modules on change; without this the timer would
 * be started again on every reload and the old one would keep running.
 */
const globalForRunner = globalThis as typeof globalThis & {
  humandbsFileRunner?: { timer: NodeJS.Timeout, busy: boolean }
}

async function drain(): Promise<void> {
  const state = globalForRunner.humandbsFileRunner
  if (state === undefined || state.busy) return
  state.busy = true
  try {
    const db = getDb()
    await recoverAbandoned(db)
    // One at a time. A copy is the slow part and running several would only
    // divide the same store bandwidth between them.
    let ran = true
    while (ran) {
      ran = await runOneJob(db)
    }
  } catch (error) {
    // The loop has no caller to answer to, and a queue that stops on the first
    // failure stops for everything. Each job records its own reason.
    console.error("the file switch loop failed", error)
  } finally {
    state.busy = false
  }
}

/** Start the loop. Calling it again while it runs does nothing. */
export function startFileRunner(): void {
  if (globalForRunner.humandbsFileRunner !== undefined) return
  const timer = setInterval(() => {
    void drain()
  }, IDLE_INTERVAL_MS)
  // The timer must not be what keeps the process alive.
  timer.unref()
  globalForRunner.humandbsFileRunner = { timer, busy: false }
  void drain()
}

/**
 * Ask the loop to look now, if it is running. Called after something is queued
 * so that a small file appears to switch at once rather than at the next
 * interval.
 *
 * **It does not start the loop.** Starting belongs to the process, which does
 * it while serving its first request; an action that started one as a side
 * effect would put a background loop wherever the action is called from.
 */
export function wakeFileRunner(): void {
  if (globalForRunner.humandbsFileRunner === undefined) return
  void drain()
}
