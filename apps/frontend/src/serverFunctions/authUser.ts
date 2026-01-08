import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";

import { USER_ROLES } from "@/config/permissions";
import { type UserRole } from "@/db/schema";
import {
  ensureFreshSession,
  getClearSessionCookieOptions,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
  stringifySession,
  type SessionMeta,
} from "@/utils/jwt-helpers";

import { type SessionUser } from "./user";

interface AuthUserResponse {
  user: {
    id: string;
    role?: UserRole;
    username?: string;
    name?: string;
    email?: string;
  } | null;
  session: SessionMeta | null;
}

export const $getAuthUser = createServerFn({ method: "GET" }).handler<
  Promise<AuthUserResponse>
>(async () => {
  try {
    const { session, claims, refreshed, shouldClear } =
      await ensureFreshSession();

    if (shouldClear) {
      setCookie(SESSION_COOKIE_NAME, "", getClearSessionCookieOptions());
    }

    if (!session || !claims?.sub) {
      return { user: null, session: null };
    }

    if (refreshed) {
      setCookie(
        SESSION_COOKIE_NAME,
        stringifySession(session),
        getSessionCookieOptions(session)
      );
    }

    let role: UserRole = USER_ROLES.USER;

    const isAdminRes = await fetch(
      `http://${process.env.HUMANDBS_BACKEND}:${process.env.HUMANDBS_BACKEND_PORT}/users/is-admin`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );

    if (isAdminRes.status === 401 || isAdminRes.status === 403) {
      setCookie(SESSION_COOKIE_NAME, "", getClearSessionCookieOptions());
      throw new Error("Unauthorized");
    }

    if (isAdminRes.ok) {
      const { isAdmin } = (await isAdminRes.json()) as { isAdmin: boolean };

      if (isAdmin) {
        role = USER_ROLES.ADMIN;
      }
    }

    const user: SessionUser = {
      id: claims.sub,
      name: claims.name,
      email: claims.email,
      username: claims.preferred_username,
      role,
    };

    const sessionMeta: SessionMeta = {
      expires_at: session.expires_at,
      refresh_expires_at: session.refresh_expires_at,
      expires_in: session.expires_in,
      refresh_expires_in: session.refresh_expires_in,
    };

    return { user, session: sessionMeta };
  } catch (error) {
    console.error("Error in $getAuthUser:", error);
    setCookie(SESSION_COOKIE_NAME, "", getClearSessionCookieOptions());
    return { user: null, session: null };
  }
});
