import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/admin")({
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = Route.useRouteContext();

  return <div> Welcome {user?.name}</div>;
}
