import { createFileRoute } from "@tanstack/react-router";
import { serialize } from "cookie";
import * as oidc from "openid-client";

import { getConfig } from "@/lib/oidc";

import { sanitizeRedirectPath } from "./-utils";

export const Route = createFileRoute("/auth/login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cfg = await getConfig();
        const code_verifier = oidc.randomPKCECodeVerifier();
        const code_challenge =
          await oidc.calculatePKCECodeChallenge(code_verifier);
        // (Optional) still use state alongside PKCE
        const state = oidc.randomState();

        const requestUrl = new URL(request.url);
        const redirectParam = requestUrl.searchParams.get("redirect");
        const redirect_to = sanitizeRedirectPath(redirectParam) ?? "/";

        const stash = { code_verifier, state, redirect_to };
        const cookie = serialize("oidc_pkce", JSON.stringify(stash), {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: 5 * 60,
        });

        const redirect_uri = process.env.OIDC_REDIRECT_URI!;
        console.log("OIDC_REDIRECT_URI", redirect_uri);
        const scope = "openid profile email offline_access";

        const url = oidc.buildAuthorizationUrl(cfg, {
          redirect_uri,
          scope,
          code_challenge,
          code_challenge_method: "S256",
          state,
        });
        console.log(" login get 1 url", url.href);

        return new Response(null, {
          status: 302,
          headers: { Location: url.href, "Set-Cookie": cookie },
        });
      },
    },
  },
});
