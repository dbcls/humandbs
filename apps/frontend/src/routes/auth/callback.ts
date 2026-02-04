import { createFileRoute } from "@tanstack/react-router";
import { parse, serialize } from "cookie";
import * as jose from "jose";
import * as oidc from "openid-client";

import { db } from "@/db/database";
import { user } from "@/db/schema";
import { getConfig } from "@/lib/oidc";
import {
  AccessTokenClaims,
  buildSessionFromTokenResponse,
  createSessionCookie,
} from "@/utils/jwt-helpers";

import { redirectWithCookies, sanitizeRedirectPath } from "./-utils";

export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cfg = await getConfig();

        // request.url reflects the internal proxy address (e.g. http://localhost/...),
        // not the external origin the user hit. Use OIDC_REDIRECT_URI so the
        // redirect_uri sent during the token exchange matches what was sent in
        // the authorization request.
        const internalUrl = new URL(request.url);
        const url = new URL(process.env.OIDC_REDIRECT_URI!);
        url.search = internalUrl.search;

        const cookies = parse(request.headers.get("cookie") ?? "");

        const stash = cookies["oidc_pkce"]
          ? JSON.parse(cookies["oidc_pkce"])
          : null;

        if (!stash) return new Response("Missing PKCE stash", { status: 400 });

        const tokens: oidc.TokenEndpointResponse =
          await oidc.authorizationCodeGrant(
            cfg,
            url, // includes ?code & ?state
            {
              pkceCodeVerifier: stash.code_verifier,
              expectedState: stash.state,
            }
            // NOTE: no client_secret, no client authentication for public client
          );

        const setCookies: string[] = [];

        setCookies.push(serialize("oidc_pkce", "", { path: "/", maxAge: 0 }));

        const session = buildSessionFromTokenResponse(tokens);
        if (!session) {
          return new Response("Missing access token", { status: 400 });
        }

        // Decode token to get user claims and upsert user to local DB
        const claims = jose.decodeJwt(
          session.access_token
        ) as AccessTokenClaims;

        await db
          .insert(user)
          .values({
            id: claims.sub,
            email: claims.email ?? null,
            name: claims.name ?? claims.preferred_username ?? null,
          })
          .onConflictDoUpdate({
            target: user.id,
            set: {
              email: claims.email ?? null,
              name: claims.name ?? claims.preferred_username ?? null,
              updatedAt: new Date(),
            },
          });

        setCookies.push(createSessionCookie(session));

        const redirectTarget = sanitizeRedirectPath(stash.redirect_to) ?? "/";

        return redirectWithCookies(redirectTarget, setCookies, 302);
      },
    },
  },
});
