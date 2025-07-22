import { auth } from "@/lib/auth";
import { hasPermission, Permissions } from "@/lib/permissions";
import { SessionUser } from "@/router";
import { createMiddleware } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";

export const authMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const req = getWebRequest()!;

    const session = await auth.api.getSession({ headers: req.headers });

    const user = session?.user as SessionUser | undefined;

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

    return next({
      context: {
        checkPermission: <Resource extends keyof Permissions>(
          resource: Resource,
          action: Permissions[Resource]["action"],
          data?: Permissions[Resource]["dataType"]
        ) => {
          if (!hasPermission(user, resource, action, data)) {
            throw new Error("Forbidden", {
              cause: `Trying to ${action} ${resource} for user ${user.name}`,
            });
          }
        },
      },
    });
  });
