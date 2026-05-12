export function redirectWithCookies(
  to: string,
  cookies: string[],
  status = 302,
) {
  const headers = new Headers();
  for (const c of cookies) headers.append("Set-Cookie", c);
  headers.set("Location", to);
  return new Response(null, { status, headers });
}

const DUMMY_BASE_URL = "https://example.invalid";
const AUTH_STATE_VERSION = 1;

interface AuthStatePayload {
  v: number;
  n: string;
  r: string;
}

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

export function buildAuthState(nonce: string, redirectTo: string) {
  const payload: AuthStatePayload = {
    v: AUTH_STATE_VERSION,
    n: nonce,
    r: redirectTo,
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function parseAuthState(
  value?: string | null,
): { nonce: string; redirectTo: string } | null {
  if (!value) return null;

  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<AuthStatePayload>;

    if (parsed.v !== AUTH_STATE_VERSION) return null;
    if (typeof parsed.n !== "string" || parsed.n.length === 0) return null;

    const redirectTo = sanitizeRedirectPath(parsed.r);
    if (!redirectTo) return null;

    return {
      nonce: parsed.n,
      redirectTo,
    };
  } catch {
    return null;
  }
}
