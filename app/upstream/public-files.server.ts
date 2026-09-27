/**
 * Asking the DDBJ public file server for a file list, a directory listing or
 * the size of one file.
 *
 * This is the whole of the portal's contact with it, and the module tests
 * replace. It serves over HTTPS what the public FTP serves, and the size a
 * `HEAD` returns is the file's size in bytes — the directory listings round
 * theirs. A path that is not there is null; anything else that is not an
 * answer throws, so a server that did not respond fails the source rather than
 * emptying it.
 */

import type { PublicFiles } from "./archive-files"

const BASE_URL = "https://ddbj.nig.ac.jp/public"

/** Long enough for a large file list, short enough that one stalled request cannot hold the refresh. */
const TIMEOUT_MS = 60_000

async function request(path: string, method: "GET" | "HEAD"): Promise<Response | null> {
  const response = await fetch(`${BASE_URL}/${path}`, { method, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`the DDBJ public file server answered ${response.status} for ${path}`)
  return response
}

export const publicFiles: PublicFiles = {
  text: async (path) => {
    const response = await request(path, "GET")
    return response === null ? null : await response.text()
  },
  size: async (path) => {
    const response = await request(path, "HEAD")
    const length = response?.headers.get("content-length") ?? null
    const size = Number(length)
    if (length === null || !/^\d+$/.test(length) || !Number.isSafeInteger(size)) {
      throw new Error(`the DDBJ public file server gave no size for ${path}`)
    }
    return size
  },
}
