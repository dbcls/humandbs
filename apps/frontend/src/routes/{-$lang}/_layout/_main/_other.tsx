import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Breadcrumbs } from "@/components/Breadcrumb";
import { Card } from "@/components/Card";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other")({
  component: RouteComponent,
  errorComponent: ({ error }) => (
    <Card
      captionSize={"lg"}
      caption={<span className="text-danger">Error</span>}
    >
      <pre>{error.message}</pre>
      <pre>{error.cause}</pre>
    </Card>
  ),
});

function RouteComponent() {
  return (
    <>
      <Breadcrumbs />
      <Outlet />
    </>
  );
}
