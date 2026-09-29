/**
 * Running the proxy's `docker/nginx/public-host.sh`, for tests that hold it to
 * the application's own reading of the same URL.
 *
 * The script is given nothing of this process's environment but `PATH`, and
 * writes into a directory of its own that is removed afterwards.
 */

import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SCRIPT = join(import.meta.dirname, "..", "docker", "nginx", "public-host.sh")

export type PublicHostOutcome
  = | { refused: false, host: string, conf: string }
    | { refused: true, message: string }

export function runPublicHost(uri: string | undefined): PublicHostOutcome {
  const dir = mkdtempSync(join(tmpdir(), "public-host-"))
  try {
    const conf = join(dir, "public-host.conf")
    const env: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin" }
    if (uri !== undefined) env.HUMANDBS_AUTH_REDIRECT_URI = uri
    const result = spawnSync("sh", [SCRIPT, conf], { env, encoding: "utf8" })
    if (result.error !== undefined) throw result.error
    if (result.status !== 0) return { refused: true, message: result.stderr }
    const text = readFileSync(conf, "utf8")
    const host = /^ {2}default "([^"]*)";$/m.exec(text)?.[1]
    if (host === undefined) throw new Error(`the script wrote an unexpected configuration: ${text}`)
    return { refused: false, host, conf: text }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
