import { getConfig } from "@/lib/oidc";
import { createFileRoute } from "@tanstack/react-router";
import { parse, serialize } from "cookie";
import * as oidc from "openid-client";
import { redirectWithCookies, sanitizeRedirectPath } from "./-utils";
import {
  buildSessionFromTokenResponse,
  createSessionCookie,
} from "@/utils/jwt-helpers";

export const Route = createFileRoute("/api/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        console.log("callback");
        const cfg = await getConfig();
        const url = new URL(request.url);

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

        console.log("1");
        setCookies.push(serialize("oidc_pkce", "", { path: "/", maxAge: 0 }));
        console.log("2");

        const session = buildSessionFromTokenResponse(tokens);
        console.log("3");
        if (!session) {
          return new Response("Missing access token", { status: 400 });
        }

        setCookies.push(createSessionCookie(session));

        const redirectTarget = sanitizeRedirectPath(stash.redirect_to) ?? "/";

        console.log("redirectTarget", redirectTarget);

        return redirectWithCookies(redirectTarget, setCookies, 302);
      },
    },
  },
});
