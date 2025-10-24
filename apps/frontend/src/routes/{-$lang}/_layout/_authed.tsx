import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { authClient } from "@/lib/auth-client";
import {
  createFileRoute,
  getRouterContext,
  Outlet,
  redirect,
} from "@tanstack/react-router";

export const Route = createFileRoute("/{-$lang}/_layout/_authed")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({
        to: "/{-$lang}",
        params: {
          lang: context.lang,
        },
      });
    }
  },

  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex h-screen flex-col gap-2 p-4">
      {/*<Navbar />*/}
      {children}
      {/*<Footer />*/}
    </main>
  );
}
