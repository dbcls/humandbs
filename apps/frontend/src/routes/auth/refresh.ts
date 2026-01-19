import { createFileRoute } from "@tanstack/react-router";
import { parse } from "cookie";

import {
  createClearSessionCookie,
  createSessionCookie,
  ensureFreshSession,
  parseSession,
  SESSION_COOKIE_NAME,
  SessionMeta,
} from "@/utils/jwt-helpers";

export const Route = createFileRoute("/auth/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        console.log("refreshing");
        console.log("refreshing");
        console.log("refreshing");
        const cookieHeader = request.headers.get("cookie") ?? "";
        const cookies = parse(cookieHeader);
        const rawSession = cookies[SESSION_COOKIE_NAME];
        const existingSession = rawSession ? parseSession(rawSession) : null;

        const { session, claims, refreshed, shouldClear } =
          await ensureFreshSession({
            session: existingSession,
          });

        console.log("refreshed?", { refreshed, session, claims });

        if (!session || !claims) {
          const headers = new Headers();
          if (rawSession || shouldClear) {
            headers.append("Set-Cookie", createClearSessionCookie());
          }
          return new Response(null, {
            status: 401,
            headers,
          });
        }

        const headers = new Headers({
          "Content-Type": "application/json",
        });

        if (refreshed) {
          headers.append("Set-Cookie", createSessionCookie(session));
        }

        const sessionMeta: SessionMeta = {
          expires_at: session.expires_at,
          refresh_expires_at: session.refresh_expires_at,
          expires_in: session.expires_in,
          refresh_expires_in: session.refresh_expires_in,
        };

        return new Response(
          JSON.stringify({
            refreshed,
            session: sessionMeta,
          }),
          {
            status: 200,
            headers,
          }
        );
      },
    },
  },
});
