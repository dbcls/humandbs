/**
 * The one check every write to the portal passes before a route sees it.
 *
 * **React Router's own check does not cover every route.** It refuses a
 * mutation whose `Origin` names another host only for a route that renders a
 * page; a route that answers with data alone — the comment, upload and sign-out
 * endpoints — never reaches it. The session cookie is `SameSite=Lax`, and Lax
 * still sends it on a POST from any subdomain of the same registrable domain,
 * so without this a page on a sibling subdomain could post to the management
 * endpoints as whoever is signed in.
 *
 * **Same-origin is the bar, not same-site**, for that reason. A write is let
 * through when:
 *
 * - `Sec-Fetch-Site`, when the browser sends it, is `same-origin` or `none`
 *   (typed or bookmarked by the reader), and
 * - `Origin`, when sent, names this host. One naming `null` (a sandboxed or
 *   opaque document) or not a URL is refused.
 *
 * **A write carrying neither header is refused.** Every current browser sends
 * at least one of them on a non-GET request, and nothing the portal serves
 * expects a write from anything else.
 *
 * The host is compared rather than the whole origin, because the scheme in
 * front of the application is the proxy's rather than the browser's.
 */

const READS = new Set(["GET", "HEAD", "OPTIONS"])
const ALLOWED_FETCH_SITES = new Set(["same-origin", "none"])

export function refusedAsCrossSite(request: Request): boolean {
  if (READS.has(request.method.toUpperCase())) return false

  const site = request.headers.get("sec-fetch-site")
  if (site !== null && !ALLOWED_FETCH_SITES.has(site)) return true

  const origin = request.headers.get("origin")
  // A page cannot set `Sec-Fetch-Site` itself, so a browser saying the request
  // is its own origin's is enough on its own.
  if (origin === null) return site === null
  if (origin === "null") return true
  try {
    return new URL(origin).host !== new URL(request.url).host
  } catch {
    return true
  }
}

/** What a refused write is answered with. It says nothing about why. */
export function crossSiteRefusal(): Response {
  return new Response("Forbidden", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } })
}
