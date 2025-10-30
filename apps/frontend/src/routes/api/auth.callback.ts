import { getConfig } from "@/lib/oidc";
import { createFileRoute } from "@tanstack/react-router";
import { parse, serialize } from "cookie";
import * as oidc from "openid-client";
import { redirectWithCookies } from "./-utils";
import {
  buildSessionFromTokenResponse,
  createSessionCookie,
} from "@/utils/jwt-helpers";

export const Route = createFileRoute("/api/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
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
        setCookies.push(serialize("oidc_pkce", "", { path: "/", maxAge: 0 }));

        const session = buildSessionFromTokenResponse(tokens);
        if (!session) {
          return new Response("Missing access token", { status: 400 });
        }

        setCookies.push(createSessionCookie(session));

        return redirectWithCookies("/", setCookies, 302);
      },
    },
  },
});
