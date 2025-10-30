import { user, UserRole } from "@/db/schema";
import { userSelectSchema } from "@/db/types";
import { db } from "@/lib/database";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import {
  ensureFreshSession,
  getClearSessionCookieOptions,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
  SessionMeta,
  stringifySession,
} from "@/utils/jwt-helpers";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { count, eq } from "drizzle-orm";

export const $getUsers = createServerFn({ method: "GET" })
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context }) => {
    context.checkPermission("users", "view");

    const users = await db.select().from(user).orderBy(user.role);

    return users;
  });

export const $changeUserRole = createServerFn({
  method: "POST",
})
  .middleware([hasPermissionMiddleware])
  .inputValidator(userSelectSchema.pick({ role: true, id: true }))
  .handler(async ({ context, data }) => {
    context.checkPermission("users", "changeRole");

    const [amountOfAdmins] = await db
      .select({ count: count() })
      .from(user)
      .where(eq(user.role, "admin"));

    if (amountOfAdmins.count < 2)
      throw new Error("Cannot change role of last admin");

    const result = await db
      .update(user)
      .set({ role: data.role })
      .where(eq(user.id, data.id))
      .returning();

    return result;
  });

export function getUsersQueryOptions() {
  return queryOptions({
    queryKey: ["users"],
    queryFn: $getUsers,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export const $deleteUser = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(userSelectSchema.pick({ id: true }))
  .handler(async ({ context, data }) => {
    context.checkPermission("users", "delete");

    const [amountOfAdmins] = await db
      .select({ count: count() })
      .from(user)
      .where(eq(user.role, "admin"));

    if (amountOfAdmins.count < 2) throw new Error("Cannot delete last admin");

    const result = await db
      .delete(user)
      .where(eq(user.id, data.id))
      .returning();

    return result;
  });

export type SessionUser = {
  id: string;
  role?: UserRole;
  username?: string;
  name?: string;
  email?: string;
};

type AuthUserResponse = {
  user: SessionUser | null;
  session: SessionMeta | null;
};

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

    const user: SessionUser = {
      id: claims.sub,
      name: claims.name,
      email: claims.email,
      username: claims.preferred_username,
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
