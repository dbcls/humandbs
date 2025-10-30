import { user, UserRole } from "@/db/schema";
import { userSelectSchema } from "@/db/types";
import { db } from "@/lib/database";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import {
  createSessionCookie,
  getJWT,
  verifyAccessToken,
  verifyOrRefreshToken,
} from "@/utils/jwt-helpers";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookies } from "@tanstack/react-start/server";
import { serialize } from "cookie";
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

export type Session = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
};

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
  role?: UserRole;
  username: string | undefined;
  name: string | undefined;
  email: string | undefined;
};

export const $getAuthUser = createServerFn({ method: "GET" }).handler<
  Promise<{
    user: SessionUser | null;
    setCookie?: string;
  }>
>(async () => {
  try {
    const { claims, newSession } = await verifyOrRefreshToken();

    if (!claims) {
      return {
        user: null,
      };
    }

    const user: SessionUser = {
      name: claims?.name,
      email: claims?.email,
      username: claims?.preferred_username,
    };

    // If we refreshed the token, return the new cookie to be set
    if (newSession) {
      return {
        user,
        setCookie: createSessionCookie(newSession),
      };
    }

    return { user };
  } catch (error) {
    console.error("Error in $getAuthUser:", error);
    return { user: null };
  }
});
