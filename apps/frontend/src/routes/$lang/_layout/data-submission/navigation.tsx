import { Card } from "@/components/Card";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/$lang/_layout/data-submission/navigation"
)({
  component: RouteComponent,
  context({ context }) {
    return {
      crumb: "navigation",
    };
  },
});

function RouteComponent() {
  return <Card caption="申請システムの前に">Content goes here</Card>;
}
