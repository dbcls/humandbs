import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$lang/_layout/data-provision/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/data-provision/"!</div>;
}
