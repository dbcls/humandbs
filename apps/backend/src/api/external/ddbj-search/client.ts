/**
 * DDBJ Search API client (low-level fetch helper)
 *
 * Public DDBJ Search API. No auth, no rate limit headers documented, so we
 * rely on conservative concurrency limits at the caller. Each call is a single
 * fetch with the request id propagated via X-Request-ID for log correlation.
 *
 * Helper returns:
 *   - parsed JSON body on 2xx
 *   - null on 404 (caller decides whether to escalate)
 *   - throws on other non-2xx (network / 5xx)
 */
import { logger } from "@/api/logger"

const BASE_URL =
  process.env.HUMANDBS_DDBJ_SEARCH_API_BASE_URL ??
  "https://ddbj.nig.ac.jp/search/api"

export class DdbjSearchApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "DdbjSearchApiError"
    this.status = status
  }
}

interface FetchOptions {
  requestId?: string
}

/**
 * GET a JSON resource. Returns null on 404, throws DdbjSearchApiError on
 * other non-2xx.
 */
export const fetchJson = async <T>(
  path: string,
  opts: FetchOptions = {},
): Promise<T | null> => {
  const url = `${BASE_URL}${path}`
  const headers: Record<string, string> = {
    Accept: "application/json",
  }
  if (opts.requestId) {
    headers["X-Request-ID"] = opts.requestId
  }

  let res: Response
  try {
    res = await fetch(url, { headers })
  } catch (err) {
    logger.warn("DDBJ Search API network error", {
      url,
      error: err instanceof Error ? err.message : String(err),
    })
    throw new DdbjSearchApiError(
      `DDBJ Search API network error: ${url}`,
      502,
    )
  }

  if (res.status === 404) {
    return null
  }
  if (!res.ok) {
    logger.warn("DDBJ Search API error response", { url, status: res.status })
    throw new DdbjSearchApiError(
      `DDBJ Search API returned ${res.status} for ${url}`,
      res.status,
    )
  }

  try {
    return (await res.json()) as T
  } catch (err) {
    logger.warn("DDBJ Search API JSON parse error", {
      url,
      error: err instanceof Error ? err.message : String(err),
    })
    throw new DdbjSearchApiError(
      `DDBJ Search API returned invalid JSON: ${url}`,
      502,
    )
  }
}
