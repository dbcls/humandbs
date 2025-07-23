import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_main/$lang/_layout/data-submission/application/"
)({
  component: RouteComponent,
  loader: ({ context }) => ({ crumb: context.messages.Navbar.application }),
});

function RouteComponent() {
  return <div> Hello "/$lang/_layout/data-submission/application/"! </div>;
}
