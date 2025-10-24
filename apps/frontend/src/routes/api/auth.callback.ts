import { getConfig } from "@/lib/oidc";
import { createFileRoute } from "@tanstack/react-router";
import { parse, serialize } from "cookie";
import * as oidc from "openid-client";
import { redirectWithCookies } from "./-utils";

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
        setCookies.push(
          serialize(
            "session_tokens",
            JSON.stringify({
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              id_token: tokens.id_token,
              expires_in: tokens.expires_in,
            }),
            {
              httpOnly: true,
              secure: true,
              sameSite: "lax",
              path: "/",
              maxAge: 60 * 60 * 8,
            }
          )
        );

        return redirectWithCookies("/", setCookies, 302);
      },
    },
  },
});
