import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login-error")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Some error prevented login. Please try again later.</div>;
}
