import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { createFileRoute, Outlet } from "@tanstack/react-router";

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
