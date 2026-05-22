import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";

import type { UserRole } from "@/config/permissions";
import { USER_ROLES } from "@/config/permissions";
import type { SessionMeta, SessionUser } from "@/utils/jwt-helpers";
import {
  $$ensureFreshSession,
  $$getSessionCookieOptions,
  $$stringifySession,
  getClearSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/utils/jwt-helpers";

interface AuthUserResponse {
  user: SessionUser | null;
  session: SessionMeta | null;
}

export const $$getServerBackendBaseUrl = createServerOnlyFn(
  () =>
    process.env.HUMANDBS_BACKEND_BASE_URL ??
    `http://${process.env.HUMANDBS_BACKEND_HOST}:${process.env.HUMANDBS_BACKEND_PORT}${process.env.HUMANDBS_BACKEND_URL_PREFIX}`,
);

export const $$resolveUserRole = createServerOnlyFn(
  async (accessToken: string): Promise<UserRole> => {
    const backendBaseUrl = $$getServerBackendBaseUrl();
    const base = backendBaseUrl.endsWith("/") ? backendBaseUrl : `${backendBaseUrl}/`;
    const isAdminUrl = new URL("admin/is-admin", base);

    const isAdminRes = await fetch(isAdminUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!isAdminRes.ok) {
      return USER_ROLES.USER;
    }

    const response = (await isAdminRes.json()) as {
      data: { isAdmin: boolean };
    };

    return response.data.isAdmin ? USER_ROLES.ADMIN : USER_ROLES.USER;
  },
);

// Dev bypass: return mock user without hitting Keycloak or backend
// Set AUTH_DEV_ROLE to "admin" or "user" (defaults to "admin")
function getDevBypassResponse(): AuthUserResponse | null {
  if (process.env.AUTH_DEV_BYPASS !== "true") {
    return null;
  }

  const roleEnv = process.env.AUTH_DEV_ROLE?.toLowerCase();
  const role: UserRole = roleEnv === "user" ? USER_ROLES.USER : USER_ROLES.ADMIN;

  const mockUser: SessionUser = {
    id: process.env.AUTH_DEV_USER_ID ?? "dev-user-id",
    name: process.env.AUTH_DEV_NAME ?? `Dev User (${role})`,
    email: process.env.AUTH_DEV_EMAIL ?? "dev@localhost",
    username: process.env.AUTH_DEV_USERNAME ?? "devuser",
    role,
  };

  const mockSession: SessionMeta = {
    expires_at: `${Math.floor(Date.now() / 1000) + 86400}`, // 24 hours from now
    refresh_expires_at: `${Math.floor(Date.now() / 1000) + 86400 * 7}`, // 7 days
    expires_in: 86400,
    refresh_expires_in: 86400 * 7,
  };

  return { user: mockUser, session: mockSession };
}

export const $getAuthUser = createServerFn().handler<Promise<AuthUserResponse>>(async () => {
  // Check for dev bypass first
  const bypassResponse = getDevBypassResponse();
  if (bypassResponse && process.env.NODE_ENV === "development") {
    return bypassResponse;
  }

  try {
    const { session, claims, refreshed, shouldClear } = await $$ensureFreshSession();

    if (shouldClear) {
      setCookie(SESSION_COOKIE_NAME, "", getClearSessionCookieOptions());
    }

    if (!session || !claims?.sub) {
      return { user: null, session: null };
    }

    if (refreshed) {
      setCookie(
        SESSION_COOKIE_NAME,
        $$stringifySession(session),
        $$getSessionCookieOptions(session),
      );
    }

    let role = session.role;

    if (!role) {
      role = await $$resolveUserRole(session.access_token);

      setCookie(
        SESSION_COOKIE_NAME,
        $$stringifySession({
          ...session,
          role,
        }),
        $$getSessionCookieOptions({
          ...session,
          role,
        }),
      );
    }

    const user: SessionUser = {
      id: claims.sub,
      name: claims.name ?? "",
      email: claims.email ?? "",
      username: claims.preferred_username ?? "",
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
