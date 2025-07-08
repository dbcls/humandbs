import { auth } from "@/lib/auth";
import { createMiddleware } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";

export const authMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const req = getWebRequest()!;

    const session = await auth.api.getSession({ headers: req.headers });

    const user = session?.user;

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
        // TODO: Implement permissions check
        requirePermission: (permission: string) => {
          if (permission !== "please") {
            throw new Error("Permission denied");
          }
        },
      },
    });
  });
