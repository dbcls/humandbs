import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/$lang/_layout/guidelines/revision/$rev")(
  {
    component: RouteComponent,
  }
);

function RouteComponent() {
  return <div>Hello "/$lang/_layout/guidelines/revision/$rev"!</div>;
}
