import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/$lang/_layout/data-submission/application/"
)({
  component: RouteComponent,
});

function RouteComponent() {
  return <div> Hello "/$lang/_layout/data-submission/application/"! </div>;
}
