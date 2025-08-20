import type { Locale, Messages } from "@/lib/i18n-config";
import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routerWithQueryClient } from "@tanstack/react-router-with-query";
import { routeTree } from "./routeTree.gen";
import { authClient } from "./lib/auth-client";
import { AlertTranslation, UserRole } from "./db/schema";

export type SessionUser = typeof authClient.$Infer.Session.user & {
  role: UserRole;
};

export type Context = {
  queryClient: QueryClient;
  crumb: string;
  lang: Locale;
  messages: Messages;
  user: SessionUser | null | undefined;
  alerts: AlertTranslation[] | undefined;
};

export function createRouter() {
  const queryClient = new QueryClient();

  return routerWithQueryClient(
    createTanStackRouter({
      routeTree,
      context: {
        queryClient,
      } as Context,
      defaultPreload: "intent",
      scrollRestoration: true,
    }),
    queryClient
  );
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
