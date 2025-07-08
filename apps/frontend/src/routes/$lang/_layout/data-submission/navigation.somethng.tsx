import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/$lang/_layout/data-submission/navigation/somethng"
)({
  component: RouteComponent,
  context({ context }) {
    return {
      crumb: "something",
    };
  },
});

function RouteComponent() {
  return <div>Hello "/$lang/_layout/data-submission/navigation/somethng"!</div>;
}
