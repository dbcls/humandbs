import { createFileRoute } from "@tanstack/react-router";
import { parse, serialize } from "cookie";
import { getLogoutUrl } from "@/lib/oidc";
import { redirectWithCookies } from "./-utils";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cookies = parse(request.headers.get("cookie") ?? "");
        const session = cookies["session_tokens"]
          ? JSON.parse(cookies["session_tokens"])
          : null;
        const idTokenHint = session?.id_token as string | undefined;

        const postLogoutRedirect = new URL("/", new URL(request.url).origin)
          .href;

        const endSession = await getLogoutUrl(idTokenHint, postLogoutRedirect);

        const clears = [
          serialize("session_tokens", "", { path: "/", maxAge: 0 }),
          serialize("oidc_pkce", "", { path: "/", maxAge: 0 }),
        ];

        const headers = new Headers();
        for (const c of clears) headers.append("Set-Cookie", c);

        // If Keycloak advertises end_session_endpoint, redirect there
        if (endSession) {
          return redirectWithCookies(endSession.href, clears, 302);
        }

        return redirectWithCookies("/", clears, 302);
      },
    },
  },
});
