import { Breacrumbs } from "@/components/Breadcrumb";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { FileRoutesByTo } from "@/routeTree.gen";
import { Outlet, useLocation, useMatches } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <main className="flex flex-col gap-2 p-4">
      <Navbar />

      <Outlet />
      <Footer />
    </main>
  );
}
