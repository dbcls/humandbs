import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(other)/_layout/data-provision/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/data-provision/"!</div>;
}
