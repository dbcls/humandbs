import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Breadcrumbs } from "@/components/Breadcrumb";
import { Card } from "@/components/Card";
import { ResearchDatasetTabs } from "@/components/ResearchDatasetTabs";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other")({
  component: RouteComponent,
  errorComponent: ({ error }) => (
    <Card captionSize={"lg"} caption={<span className="text-danger">Error</span>}>
      <pre>{error.message}</pre>
      <pre>{error.cause != null ? String(error.cause) : null}</pre>
    </Card>
  ),
});

function RouteComponent() {
  return (
    <div className="flex flex-col">
      <div className="flex items-end justify-between pl-2 pr-0 -mb-[1px] z-20">
        <div className="pb-1.5">
          <Breadcrumbs />
        </div>
        <ResearchDatasetTabs />
      </div>
      <div className="flex-1 z-10">
        <Outlet />
      </div>
    </div>
  );
}
