import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { QueryClient } from "@tanstack/react-query";
import { routerWithQueryClient } from "@tanstack/react-router-with-query";
import type { Locale, Messages } from "@/lib/i18n-config";

export type Context = {
  queryClient: QueryClient;
  crumb: string;
  lang: Locale;
  messages: Messages;
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
