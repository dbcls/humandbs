/**
 * Which address a request to the assistant is handed on to.
 *
 * Everything the portal decides about the forwarding is here, so that it can be
 * checked without a service to talk to. The rule is short because the portal
 * deliberately knows nothing about the assistant's API: what arrives after
 * `/admin/assistant/api/` is the service's own address, and the portal's part
 * is to say where the service is and to refuse what would leave it.
 */

/**
 * **A segment that climbs out of the API is refused rather than resolved.**
 * `new URL()` would happily fold `applications/../../healthz` into a path
 * outside the prefix, which would make the proxy a way to reach whatever else
 * the service answers at — and a service written on the promise that it is only
 * ever reached through here has no reason to guard its other addresses.
 *
 * An empty rest is the API's own root, which is a legitimate address.
 */
export function assistantTarget(origin: string, rest: string, search: string): string | null {
  if (rest.split("/").includes("..")) return null
  // Built rather than concatenated, so that what arrives is a path and only a
  // path: setting `pathname` encodes `?` and `#`, which a decoded segment can
  // hold and which pasted into a string would start a query instead. The
  // setter also folds `..`, which is why it is refused above rather than here.
  const url = new URL(origin)
  url.pathname = `/api/${rest}`
  url.search = search
  return url.toString()
}

/**
 * The headers a request keeps on its way in.
 *
 * **The portal's own credentials do not travel.** The session cookie is the
 * whole of a session here (`docs/auth.md`), and the assistant has no use for
 * one: it is reached only through a route that has already decided the reader
 * may reach it. Forwarding either would make the service a second place where
 * the portal's authentication can be read or replayed.
 *
 * The hop-by-hop headers belong to the connection that has just ended, and
 * `host` belongs to the one about to be made.
 */
const REQUEST_HEADERS_DROPPED = new Set([
  "cookie",
  "authorization",
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

/**
 * The headers an answer keeps on its way out.
 *
 * **`set-cookie` is dropped**: a cookie from the assistant would be set on the
 * portal's own origin, which is where the session cookie lives.
 *
 * **The encoding and the length are dropped** because `fetch` has already
 * undone the first and the body being passed on may no longer match the second.
 * Repeating either describes the answer that arrived rather than the one being
 * sent.
 */
const RESPONSE_HEADERS_DROPPED = new Set([
  "set-cookie",
  "content-encoding",
  "content-length",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "transfer-encoding",
  "upgrade",
])

export function forwardedRequestHeaders(headers: Headers): Headers {
  return copyExcept(headers, REQUEST_HEADERS_DROPPED)
}

export function forwardedResponseHeaders(headers: Headers): Headers {
  return copyExcept(headers, RESPONSE_HEADERS_DROPPED)
}

function copyExcept(headers: Headers, dropped: ReadonlySet<string>): Headers {
  const kept = new Headers()
  headers.forEach((value, name) => {
    if (!dropped.has(name.toLowerCase())) kept.append(name, value)
  })
  return kept
}

/** Whether a method may carry one. `fetch` refuses a body on the two that may not. */
export function carriesBody(method: string): boolean {
  const named = method.toUpperCase()
  return named !== "GET" && named !== "HEAD"
}
