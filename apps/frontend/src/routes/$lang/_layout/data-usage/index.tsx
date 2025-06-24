import { createFileRoute } from "@tanstack/react-router";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/$lang/_layout/data-usage/")({
  component: RouteComponent,
  loader: () => ({ crumb: "DataUsage" }),
});

function RouteComponent() {
  return <div>{m.hello()} "/data-usage/"!</div>;
}
