/**
 * Refreshing the upstream caches from the command line.
 *
 * The application process does this daily on its own; this is the same run,
 * started by hand. **It does not wait for a source to be due and does not
 * claim** — whoever runs it means now, and the alternative would be a command
 * that silently does nothing because the loop refreshed an hour ago. Two runs
 * at once would only fetch the same values twice; the write is a transaction
 * either way.
 */

import { closePools, getDb } from "~/db/client.server"
import { runUpstreamRefresh } from "~/upstream/refresh.server"
import { isUpstreamSource, UPSTREAM_SOURCES, type UpstreamSource } from "~/upstream/sources"

const USAGE = `usage:
  npm run upstream:refresh
  npm run upstream:refresh -- --source=<name>

sources: ${UPSTREAM_SOURCES.join(", ")}`

const requested: UpstreamSource[] = []
let usageError = false
for (const argument of process.argv.slice(2)) {
  const name = argument.startsWith("--source=") ? argument.slice("--source=".length) : null
  if (name !== null && isUpstreamSource(name)) requested.push(name)
  else usageError = true
}

if (usageError) {
  console.error(USAGE)
  process.exitCode = 1
} else {
  const outcomes = await runUpstreamRefresh(
    getDb(),
    requested.length > 0 ? requested : UPSTREAM_SOURCES,
  )
  for (const outcome of outcomes) {
    if (outcome.status === "written") console.log(`${outcome.source}\t${outcome.rowCount} rows`)
    else if (outcome.status === "failed") console.error(`${outcome.source}\tfailed: ${outcome.failure}`)
    else console.log(`${outcome.source}\tskipped: the application system is not configured`)
  }
  if (outcomes.some((outcome) => outcome.status === "failed")) process.exitCode = 1
}

await closePools()
