import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { CatchBoundary, createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/{-$lang}/_layout")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <CatchBoundary getResetKey={() => "reset"}>
      {/*<Navbar />*/}
      <Outlet />
      {/*<Footer />*/}
    </CatchBoundary>
  );
}
