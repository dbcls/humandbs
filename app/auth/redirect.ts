/**
 * Where to send a browser after signing in or out.
 *
 * The value arrives in a query parameter, so it is treated as untrusted: only a
 * path within this site is allowed through, and anything else becomes the front
 * page. Parsing it against a throwaway origin and insisting the origin comes
 * back unchanged is what catches the awkward cases — `//evil.example`, a
 * backslash where a browser reads a separator, an absolute URL with a scheme.
 *
 * **The result is checked as well as the input.** `/..//evil.example` parses to
 * this origin and resolves to the path `//evil.example`, which is a different
 * host again the moment it is put in a `Location` header. What has to hold is a
 * property of the answer, so that is where it is asserted.
 */

const FALLBACK = "/"
const THROWAWAY_ORIGIN = "https://redirect.invalid"

export function safeRedirectPath(value: string | null | undefined): string {
  if (value === null || value === undefined) return FALLBACK

  const candidate = value.trim()
  if (!candidate.startsWith("/")) return FALLBACK

  let url: URL
  try {
    url = new URL(candidate, THROWAWAY_ORIGIN)
  } catch {
    return FALLBACK
  }

  if (url.origin !== THROWAWAY_ORIGIN) return FALLBACK

  const path = `${url.pathname}${url.search}${url.hash}`
  if (path === "" || path.startsWith("//")) return FALLBACK
  return path
}
