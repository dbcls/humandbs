import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { count, eq } from "drizzle-orm";

import { USER_ROLES } from "@/config/permissions";
import { db } from "@/db/database";
import { user, UserRole } from "@/db/schema";
import { userSelectSchema } from "@/db/types";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";

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
      .where(eq(user.role, USER_ROLES.ADMIN));

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
      .where(eq(user.role, USER_ROLES.ADMIN));

    if (amountOfAdmins.count < 2) throw new Error("Cannot delete last admin");

    const result = await db
      .delete(user)
      .where(eq(user.id, data.id))
      .returning();

    return result;
  });

export interface SessionUser {
  id: string;
  role?: UserRole;
  username?: string;
  name?: string;
  email?: string;
}
