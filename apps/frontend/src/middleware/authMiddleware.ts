import { hasPermission, Permissions } from "@/lib/permissions";
import { $getAuthUser, SessionUser } from "@/serverFunctions/user";
import { getJWT } from "@/utils/jwt-helpers";

import { createMiddleware } from "@tanstack/react-start";

export const authMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const user = await $getAuthUser();

    return next({ context: { user } });
  }
);

export const hasPermissionMiddleware = createMiddleware({
  type: "function",
})
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    const { user } = context;

    if (!user) {
      throw new Error("Unauthorized");
    }
    const jwt = getJWT();

    const userWithRole = { ...user };

    const isAdminRes = await fetch(
      `http://${process.env.HUMANDBS_BACKEND}:${process.env.HUMANDBS_BACKEND_PORT}/users/is-admin`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      }
    );

    if (!isAdminRes.ok) {
      userWithRole.role = "user";
    } else {
      const { isAdmin } = (await isAdminRes.json()) as { isAdmin: boolean };

      if (isAdmin) {
        userWithRole.role = "admin";
      } else {
        userWithRole.role = "user";
      }
    }

    return next({
      context: {
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
