import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";

import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { QueryClient } from "@tanstack/react-query";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: () => (
    <>
      <main className="flex flex-col gap-2 p-4">
        <Navbar />

        <Outlet />

        <TanStackRouterDevtools />
      </main>
      <Footer />
    </>
  ),
});
