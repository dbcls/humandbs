import { Breadcrumbs } from "@/components/Breadcrumb";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <Breadcrumbs />
      <Outlet />
    </>
  );
}
