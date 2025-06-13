import { Card } from "@/components/Card";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/(other)/_layout/data-provision/navigation/"
)({ component: RouteComponent });

function RouteComponent() {
  return <Card caption="申請システムの前に">Content goes here</Card>;
}
