import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Breadcrumbs } from "@/components/Breadcrumb";
import { Card } from "@/components/Card";
import { ResearchDatasetTabs } from "@/components/ResearchDatasetTabs";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other")({
  component: RouteComponent,
  errorComponent: ({ error }) => (
    <Card captionSize={"lg"} caption={<span className="text-danger">Error</span>}>
      <pre>{error.message}</pre>
      {error.cause != null && <pre>{String(error.cause)}</pre>}
    </Card>
  ),
});

function onlyHasLangParam(paramsObj: Record<string, string | number>) {
  const keys = Object.keys(paramsObj);
  return keys.length === 1 && keys[0] === "lang";
}

function RouteComponent() {
  const matches = Route.useMatch();

  return (
    <div className="flex flex-col">
      <div className="z-20 mb-4 flex items-center justify-between pr-0 pl-2">
        <div>
          <Breadcrumbs />
        </div>
        {onlyHasLangParam(matches.params) ? <ResearchDatasetTabs /> : null}
      </div>
      <div className="z-10 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
