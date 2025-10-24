import { getCookies } from "@tanstack/react-start/server";
import * as jose from "jose";

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
