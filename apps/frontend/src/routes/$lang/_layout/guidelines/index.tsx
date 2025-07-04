import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$lang/_layout/guidelines/")({
  component: RouteComponent,
  loader: () => {
    return {
      crumb: "Guidelines",
    };
  },
});

function RouteComponent() {
  return <div>Hello "/$lang/_layout/guidelines/"!</div>;
}
