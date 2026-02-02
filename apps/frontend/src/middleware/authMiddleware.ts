import { createMiddleware } from "@tanstack/react-start";

import { hasPermission, Permissions } from "@/config/permissions";
import { $getAuthUser } from "@/serverFunctions/authUser";

export const authMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { user, session } = await $getAuthUser();

    if (!user) {
      throw new Error("Unauthorized");
    }

    return next({ context: { user, session } });
  }
);

export const hasPermissionMiddleware = createMiddleware({
  type: "function",
})
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    return next({
      context: {
        user: context.user,
        session: context.session,
        checkPermission: <Resource extends keyof Permissions>(
          resource: Resource,
          action: Permissions[Resource]["action"],
          data?: Permissions[Resource]["dataType"]
        ) => {
          if (!hasPermission(context.user, resource, action, data)) {
            throw new Error("Forbidden", {
              cause: `Trying to ${action} ${resource} for user ${context.user?.name}`,
            });
          }
        },
      },
    });
  });
