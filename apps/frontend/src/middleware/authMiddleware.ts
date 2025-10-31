import { hasPermission, Permissions, USER_ROLES } from "@/config/permissions";
import { SessionUser } from "@/serverFunctions/user";
import {
  ensureFreshSession,
  getClearSessionCookieOptions,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
  stringifySession,
} from "@/utils/jwt-helpers";
import type { Session } from "@/utils/jwt-helpers";
import { createMiddleware } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";

export const authMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { session, claims, refreshed, shouldClear } =
      await ensureFreshSession();

    if (shouldClear) {
      setCookie(SESSION_COOKIE_NAME, "", getClearSessionCookieOptions());
    }

    let contextUser: SessionUser | null = null;
    let contextSession: Session | null = null;

    if (session && claims?.sub) {
      if (refreshed) {
        setCookie(
          SESSION_COOKIE_NAME,
          stringifySession(session),
          getSessionCookieOptions(session)
        );
      }

      contextSession = session;
      contextUser = {
        id: claims.sub,
        name: claims.name,
        email: claims.email,
        username: claims.preferred_username,
      };
    }

    return next({ context: { user: contextUser, session: contextSession } });
  }
);

export const hasPermissionMiddleware = createMiddleware({
  type: "function",
})
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    const typedContext = (context ?? {}) as {
      user?: SessionUser | null;
      session?: Session | null;
    };
    const user = typedContext.user ?? null;
    const session = typedContext.session ?? null;

    if (!user || !session?.access_token) {
      throw new Error("Unauthorized");
    }

    const userWithRole = { ...user };

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

    if (!isAdminRes.ok) {
      userWithRole.role = "user";
    } else {
      const { isAdmin } = (await isAdminRes.json()) as { isAdmin: boolean };

      if (isAdmin) {
        userWithRole.role = USER_ROLES.ADMIN;
      } else {
        userWithRole.role = USER_ROLES.USER;
      }
    }

    return next({
      context: {
        user: userWithRole,
        session,
        checkPermission: <Resource extends keyof Permissions>(
          resource: Resource,
          action: Permissions[Resource]["action"],
          data?: Permissions[Resource]["dataType"]
        ) => {
          if (!hasPermission(userWithRole, resource, action, data)) {
            throw new Error("Forbidden", {
              cause: `Trying to ${action} ${resource} for user ${userWithRole.name}`,
            });
          }
        },
      },
    });
  });
