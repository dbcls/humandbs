import { createFileRoute } from "@tanstack/react-router";
import { serialize } from "cookie";
import * as oidc from "openid-client";

import { $$getOIDCConfig } from "@/lib/oidc";

import { buildAuthState, sanitizeRedirectPath } from "./-utils";

const PKCE_STASH_MAX_AGE_SECONDS = 30 * 60;

export const Route = createFileRoute("/auth/login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const redirectParam = requestUrl.searchParams.get("redirect");
        const redirect_to = sanitizeRedirectPath(redirectParam) ?? "/";

        // Dev bypass: skip Keycloak entirely and redirect to target
        if (process.env.AUTH_DEV_BYPASS === "true") {
          return new Response(null, {
            status: 302,
            headers: { Location: redirect_to },
          });
        }

        const redirect_uri = process.env.HUMANDBS_AUTH_REDIRECT_URI!;

        const cfg = await $$getOIDCConfig();
        const code_verifier = oidc.randomPKCECodeVerifier();
        const code_challenge =
          await oidc.calculatePKCECodeChallenge(code_verifier);
        const state = buildAuthState(oidc.randomState(), redirect_to);

        const stash = { code_verifier, state, redirect_to };
        const cookie = serialize("oidc_pkce", JSON.stringify(stash), {
          httpOnly: true,
          secure: process.env.NODE_ENV !== "development",
          sameSite: "lax",
          path: "/",
          maxAge: PKCE_STASH_MAX_AGE_SECONDS,
        });

        const scope = "openid profile email offline_access";

        const url = oidc.buildAuthorizationUrl(cfg, {
          redirect_uri,
          scope,
          code_challenge,
          code_challenge_method: "S256",
          state,
        });

        return new Response(null, {
          status: 302,
          headers: { Location: url.href, "Set-Cookie": cookie },
        });
      },
    },
  },
});
