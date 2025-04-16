import { Card } from "@/components/Card";
import { createLazyFileRoute, useRouterState } from "@tanstack/react-router";

export const Route = createLazyFileRoute(
  "/(other)/_layout/data-provision/navigation/"
)({ component: RouteComponent });

function RouteComponent() {
  return <Card caption="申請システムの前に">Content goes here</Card>;
}
