import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Breadcrumbs } from "@/components/Breadcrumb";
import { DefaultCatchBoundary } from "@/components/DefaultCatchBoundary";
import { ResearchDatasetTabs } from "@/components/ResearchDatasetTabs";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other")({
  component: RouteComponent,
  errorComponent: DefaultCatchBoundary,
});

function onlyHasLangParam(paramsObj: Record<string, string | number>) {
  const keys = Object.keys(paramsObj);
  return keys.length === 1 && keys[0] === "lang";
}

function RouteComponent() {
  const matches = Route.useMatch();

  return (
    <div className="flex flex-col">
      <div className="z-20 -mb-px flex items-end justify-between pr-0 pl-2">
        <div className="pb-1.5">
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
