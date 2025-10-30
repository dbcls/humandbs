import { getConfig } from "@/lib/oidc";
import { getCookies } from "@tanstack/react-start/server";
import { serialize } from "cookie";
import * as jose from "jose";
import * as oidc from "openid-client";

export type Session = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
};

const JWKS = jose.createRemoteJWKSet(
  new URL(`${process.env.OIDC_ISSUER_URL}/protocol/openid-connect/certs`)
);

export type AccessTokenClaims = {
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
};

export function getJWT() {
  const cookies = getCookies();

  const raw = cookies["session_tokens"];

  if (!raw) return null;

  try {
    const { access_token } = JSON.parse(raw);
    return access_token as string;
  } catch (e) {
    return null;
  }
}

export function getSession(): Session | null {
  const cookies = getCookies();
  const raw = cookies["session_tokens"];

  if (!raw) return null;

  try {
    return JSON.parse(raw) as Session;
  } catch (e) {
    return null;
  }
}

/** Refreshes the access token using the refresh token */
export async function refreshAccessToken(
  refreshToken: string
): Promise<Session | null> {
  try {
    const cfg = await getConfig();

    const tokens = await oidc.refreshTokenGrant(cfg, refreshToken);

    return {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token || refreshToken, // Use new refresh token if provided
      id_token: tokens.id_token,
      expires_in: tokens.expires_in,
    };
  } catch (error) {
    console.error("Failed to refresh token:", error);
    return null;
  }
}

/** Verifies signature + standard claims and returns the token payload. */
export async function verifyAccessToken(token: string, clockToleranceSec = 60) {
  try {
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: process.env.OIDC_ISSUER_URL!,
      audience: "account",
      clockTolerance: clockToleranceSec,
    });

    // Optional defense-in-depth: ensure azp (authorized party) matches your client
    if (payload.azp && payload.azp !== process.env.OIDC_CLIENT_ID) {
      throw new Error("Unexpected azp");
    }
    return payload as AccessTokenClaims;
  } catch (e) {
    console.log("error ", e);
    return null;
  }
}

/**
 * Verifies access token and attempts to refresh if expired
 * Returns { claims, newSession } where newSession is provided if token was refreshed
 */
export async function verifyOrRefreshToken(clockToleranceSec = 60): Promise<{
  claims: AccessTokenClaims | null;
  newSession?: Session;
}> {
  const session = getSession();

  if (!session?.access_token) {
    return { claims: null };
  }

  // Try to verify the current token
  const claims = await verifyAccessToken(
    session.access_token,
    clockToleranceSec
  );

  if (claims) {
    return { claims };
  }

  // Token verification failed, try to refresh if we have a refresh token
  if (session.refresh_token) {
    const newSession = await refreshAccessToken(session.refresh_token);

    if (newSession) {
      // Verify the new access token
      const newClaims = await verifyAccessToken(
        newSession.access_token,
        clockToleranceSec
      );
      return {
        claims: newClaims,
        newSession: newClaims ? newSession : undefined,
      };
    }
  }

  return { claims: null };
}

/**
 * Makes an authenticated request to your backend API with automatic token refresh
 * Returns the response or null if authentication fails completely
 */
export async function authenticatedBackendRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ response: Response | null; newSession?: Session }> {
  const session = getSession();

  if (!session?.access_token) {
    return { response: null };
  }

  const baseUrl = `http://${process.env.HUMANDBS_BACKEND}:${process.env.HUMANDBS_BACKEND_PORT}`;

  // Try the request with current token
  let response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  // If 401, try to refresh token and retry
  if (response.status === 401 && session.refresh_token) {
    const newSession = await refreshAccessToken(session.refresh_token);

    if (newSession) {
      // Retry with new token
      response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${newSession.access_token}`,
        },
      });

      if (response.ok || response.status !== 401) {
        return { response, newSession };
      }
    }

    // Refresh failed or still getting 401
    return { response: null };
  }

  return { response };
}

/**
 * Creates a cookie header for setting a new session
 */
export function createSessionCookie(session: Session): string {
  return serialize("session_tokens", JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: session.expires_in || 3600,
  });
}
