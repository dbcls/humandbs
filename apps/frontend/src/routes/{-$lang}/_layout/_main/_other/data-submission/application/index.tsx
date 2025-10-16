import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-submission/application/"
)({
  component: RouteComponent,
  loader: ({ context }) => ({ crumb: context.messages.Navbar.application }),
});

function RouteComponent() {
  return <div> Hello "/-lang/_layout/data-submission/application/"! </div>;
}
