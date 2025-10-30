import { getConfig } from "@/lib/oidc";
import { createFileRoute } from "@tanstack/react-router";
import * as oidc from "openid-client";
import { serialize } from "cookie";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      GET: async () => {
        const cfg = await getConfig();
        const code_verifier = oidc.randomPKCECodeVerifier();
        const code_challenge =
          await oidc.calculatePKCECodeChallenge(code_verifier);
        // (Optional) still use state alongside PKCE
        const state = oidc.randomState();

        const stash = { code_verifier, state };
        const cookie = serialize("oidc_pkce", JSON.stringify(stash), {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: 5 * 60,
        });

        const redirect_uri = process.env.OIDC_REDIRECT_URI!;
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
