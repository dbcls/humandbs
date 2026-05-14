import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}
