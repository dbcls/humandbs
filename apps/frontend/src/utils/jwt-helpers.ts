import { getCookies } from "@tanstack/react-start/server";
import { serialize } from "cookie";
import * as jose from "jose";
import * as oidc from "openid-client";

import { getConfig } from "@/lib/oidc";

export const SESSION_COOKIE_NAME = "session_tokens";
const PROACTIVE_REFRESH_WINDOW_SEC = 60;
const DEFAULT_MAX_AGE = 3600;

export interface Session {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  expires_at?: string;
  refresh_expires_in?: number;
  refresh_expires_at?: string;
  scope?: string;
  token_type?: string;
}

export type SessionMeta = Pick<
  Session,
  "expires_at" | "refresh_expires_at" | "expires_in" | "refresh_expires_in"
>;

export interface AccessTokenClaims {
  sub: string;
  preferred_username?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  scope?: string;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
  aud?: string | string[];
  azp?: string;
  [k: string]: unknown;
}

export interface EnsureFreshSessionResult {
  session: Session | null;
  claims: AccessTokenClaims | null;
  refreshed: boolean;
  shouldClear: boolean;
}

const JWKS = jose.createRemoteJWKSet(
  new URL(`${process.env.HUMANDBS_AUTH_ISSUER_URL}/protocol/openid-connect/certs`)
);

function computeAbsoluteExpiry(expiresIn?: number): string | undefined {
  if (!expiresIn || Number.isNaN(expiresIn)) {
    return undefined;
  }
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function computeCookieMaxAge(session: Session): number {
  if (session.expires_at) {
    const diff = Math.floor(
      (Date.parse(session.expires_at) - Date.now()) / 1000
    );
    if (diff > 0) return diff;
  }
  if (session.expires_in && session.expires_in > 0) {
    return session.expires_in;
  }
  return DEFAULT_MAX_AGE;
}

export function parseSession(raw: string): Session | null {
  try {
    const parsed = JSON.parse(raw) as Session;
    return parsed?.access_token ? parsed : null;
  } catch (error) {
    return null;
  }
}

export function stringifySession(session: Session): string {
  return JSON.stringify(session);
}

export function getSession(): Session | null {
  const cookies = getCookies();
  const raw = cookies[SESSION_COOKIE_NAME];
  if (!raw) return null;
  return parseSession(raw);
}

export function getJWT(): string | null {
  const session = getSession();
  return session?.access_token ?? null;
}

export function buildSessionFromTokenResponse(
  tokens: oidc.TokenEndpointResponse,
  fallbackRefreshToken?: string
): Session | null {
  if (!tokens.access_token) {
    return null;
  }

  const refreshExpiresIn = (tokens as { refresh_expires_in?: number })
    .refresh_expires_in;

  const session: Session = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? fallbackRefreshToken,
    id_token: tokens.id_token,
    expires_in: tokens.expires_in,
    expires_at: computeAbsoluteExpiry(tokens.expires_in),
    token_type: tokens.token_type,
    scope: tokens.scope,
  };

  if (typeof refreshExpiresIn === "number") {
    session.refresh_expires_in = refreshExpiresIn;
    session.refresh_expires_at = computeAbsoluteExpiry(refreshExpiresIn);
  }

  return session;
}

/** Refreshes the access token using the refresh token */
export async function refreshAccessToken(
  refreshToken: string
): Promise<Session | null> {
  try {
    const cfg = await getConfig();
    const tokens = await oidc.refreshTokenGrant(cfg, refreshToken);
    return buildSessionFromTokenResponse(tokens, refreshToken);
  } catch (error) {
    console.error("Failed to refresh token:", error);
    return null;
  }
}

/** Verifies signature + standard claims and returns the token payload. */
export async function verifyAccessToken(token: string, clockToleranceSec = 60) {
  try {
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: process.env.HUMANDBS_AUTH_ISSUER_URL!,
      audience: "account",
      clockTolerance: clockToleranceSec,
    });

    if (payload.azp && payload.azp !== process.env.HUMANDBS_AUTH_CLIENT_ID) {
      throw new Error("Unexpected azp");
    }
    return payload as AccessTokenClaims;
  } catch (error) {
    console.log("error ", error);
    return null;
  }
}

export async function ensureFreshSession(
  options: {
    clockToleranceSec?: number;
    session?: Session | null;
  } = {}
): Promise<EnsureFreshSessionResult> {
  const { clockToleranceSec = 60, session: providedSession } = options;
  const session = providedSession ?? getSession();

  if (!session) {
    return {
      session: null,
      claims: null,
      refreshed: false,
      shouldClear: false,
    };
  }

  if (!session.access_token) {
    return {
      session: null,
      claims: null,
      refreshed: false,
      shouldClear: true,
    };
  }

  const expiresAtMs = session.expires_at
    ? Date.parse(session.expires_at)
    : undefined;
  const shouldAttemptProactiveRefresh =
    typeof expiresAtMs === "number" &&
    !Number.isNaN(expiresAtMs) &&
    expiresAtMs - Date.now() <= PROACTIVE_REFRESH_WINDOW_SEC * 1000;

  const claims = await verifyAccessToken(
    session.access_token,
    clockToleranceSec
  );

  if (claims && !shouldAttemptProactiveRefresh) {
    return {
      session,
      claims,
      refreshed: false,
      shouldClear: false,
    };
  }

  if (!session.refresh_token) {
    if (claims) {
      return {
        session,
        claims,
        refreshed: false,
        shouldClear: false,
      };
    }

    return {
      session: null,
      claims: null,
      refreshed: false,
      shouldClear: true,
    };
  }

  const refreshedSession = await refreshAccessToken(session.refresh_token);
  if (!refreshedSession) {
    if (claims) {
      return {
        session,
        claims,
        refreshed: false,
        shouldClear: false,
      };
    }
    return {
      session: null,
      claims: null,
      refreshed: false,
      shouldClear: true,
    };
  }

  const refreshedClaims = await verifyAccessToken(
    refreshedSession.access_token,
    clockToleranceSec
  );

  if (!refreshedClaims) {
    return {
      session: null,
      claims: null,
      refreshed: false,
      shouldClear: true,
    };
  }

  return {
    session: refreshedSession,
    claims: refreshedClaims,
    refreshed: true,
    shouldClear: false,
  };
}

export function getSessionCookieOptions(session: Session) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: computeCookieMaxAge(session),
  };
}

export function getClearSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

/**
 * Creates a cookie header for setting a new session
 */
export function createSessionCookie(session: Session): string {
  return serialize(
    SESSION_COOKIE_NAME,
    stringifySession(session),
    getSessionCookieOptions(session)
  );
}

export function createClearSessionCookie(): string {
  return serialize(SESSION_COOKIE_NAME, "", getClearSessionCookieOptions());
}
