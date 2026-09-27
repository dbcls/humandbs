/**
 * What sends the Slack message without anybody asking for it.
 *
 * **It runs inside the application process**, as the file switches and the
 * upstream refresh do. It looks every minute and sends at most once in
 * `SEND_INTERVAL_MS`; the row it claims keeps several processes from sending
 * the same thing.
 *
 * It runs with no webhook configured as well, reading past what happens so
 * that configuring one later does not send what happened before.
 */

import { loadConfig, publicOrigin } from "~/config.server"
import { getDb } from "~/db/client.server"

import { notifySlack, postToSlack } from "./notify.server"

const TICK_MS = 60 * 1000

/**
 * The dev server re-evaluates modules on change; without this the timer would
 * be started again on every reload and the old one would keep running.
 */
const globalForRunner = globalThis as typeof globalThis & {
  humandbsSlackRunner?: { timer: NodeJS.Timeout, busy: boolean }
}

async function tick(): Promise<void> {
  const state = globalForRunner.humandbsSlackRunner
  if (state === undefined || state.busy) return
  state.busy = true
  try {
    const config = loadConfig(process.env)
    const webhookUrl = config.slackWebhookUrl
    await notifySlack(getDb(), {
      now: new Date(),
      origin: publicOrigin(config.auth),
      send: webhookUrl === null ? null : (text) => postToSlack(webhookUrl, text),
    })
  } catch (error) {
    // There is no caller to respond to. The point read up to has not moved,
    // so the next tick sends the same interval again.
    console.error("the Slack notification failed", error)
  } finally {
    state.busy = false
  }
}

/** Start the loop. Calling it again while it runs does nothing. */
export function startSlackRunner(): void {
  if (globalForRunner.humandbsSlackRunner !== undefined) return
  const timer = setInterval(() => {
    void tick()
  }, TICK_MS)
  // The timer must not be what keeps the process alive.
  timer.unref()
  globalForRunner.humandbsSlackRunner = { timer, busy: false }
  void tick()
}
