/**
 * Refreshing the upstream caches from the command line.
 *
 * The application process does this on its own at the configured interval;
 * this is the same run, started by hand. **It does not wait for a source to be
 * due and does not claim** — whoever runs it means now, and the alternative
 * would be a command that silently does nothing because the loop refreshed an
 * hour ago. Two runs at once would only fetch the same values twice; the write
 * is a transaction either way.
 *
 * `--allow-shrink` writes a source that came back with fewer than half the rows
 * it wrote last time, which the loop refuses (`shrankByHalf`). It is for a
 * shrink somebody has checked upstream is real.
 */

import { closePools, getDb } from "~/db/client.server"
import { runUpstreamRefresh } from "~/upstream/refresh.server"
import { isUpstreamSource, UPSTREAM_SOURCES, type UpstreamSource } from "~/upstream/sources"

const USAGE = `usage:
  npm run upstream:refresh
  npm run upstream:refresh -- --source=<name>
  npm run upstream:refresh -- --allow-shrink

sources: ${UPSTREAM_SOURCES.join(", ")}`

const requested: UpstreamSource[] = []
let allowShrink = false
let usageError = false
for (const argument of process.argv.slice(2)) {
  if (argument === "--allow-shrink") {
    allowShrink = true
    continue
  }
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
    { allowShrink },
  )
  for (const outcome of outcomes) {
    if (outcome.status === "written") {
      console.log(`${outcome.source}\t${outcome.rowCount} rows`)
      // What the list of formats is missing (`app/files/formats.ts`); `(none)` is a name with no extension.
      const unknown = (outcome.unknownExtensions ?? []).map(([extension, files]) => `${extension || "(none)"} ${files}`)
      if (unknown.length > 0) console.log(`${outcome.source}\textensions that made no format (files): ${unknown.join(", ")}`)
    } else if (outcome.status === "failed") console.error(`${outcome.source}\tfailed: ${outcome.failure}`)
    else console.log(`${outcome.source}\tskipped: the application system is not configured`)
  }
  if (outcomes.some((outcome) => outcome.status === "failed")) process.exitCode = 1
}

await closePools()
