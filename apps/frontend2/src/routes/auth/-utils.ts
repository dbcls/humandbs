export function redirectWithCookies(
  to: string,
  cookies: string[],
  status = 302
) {
  const headers = new Headers();
  for (const c of cookies) headers.append("Set-Cookie", c);
  headers.set("Location", to);
  return new Response(null, { status, headers });
}

const DUMMY_BASE_URL = "https://example.invalid";

export function sanitizeRedirectPath(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;

  try {
    const url = new URL(trimmed, DUMMY_BASE_URL);
    if (url.origin !== DUMMY_BASE_URL) {
      return null;
    }
    const normalized = `${url.pathname}${url.search}${url.hash}`;
    return normalized || "/";
  } catch {
    return null;
  }
}
