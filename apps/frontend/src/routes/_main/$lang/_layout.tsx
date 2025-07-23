import { Breacrumbs } from "@/components/Breadcrumb";
import {
  CatchBoundary,
  createFileRoute,
  isMatch,
  Outlet,
  useMatches,
} from "@tanstack/react-router";
import { useMemo } from "react";

export const Route = createFileRoute("/_main/$lang/_layout")({
  component: RouteComponent,
});

function RouteComponent() {
  const matches = useMatches();

  const crumbs = useMemo(() => {
    return matches
      .filter((match) => isMatch(match, "loaderData.crumb"))
      .map((match) => ({
        label: (match.loaderData?.crumb ?? "") as string,
        href: match.fullPath,
      }));
  }, [matches]);

  return (
    <CatchBoundary getResetKey={() => "reset"}>
      <Breacrumbs breadcrumbsPath={crumbs} />
      <Outlet />
    </CatchBoundary>
  );
}
