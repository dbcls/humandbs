import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { QueryClient } from "@tanstack/react-query";
import css from "../index.css?url";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => (
    {
      meta: [
        {
          charSet: 'utf-8',
        },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1',
        },

      ],
    }
  ),
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
