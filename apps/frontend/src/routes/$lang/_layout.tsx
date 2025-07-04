import {
  createFileRoute,
  isMatch,
  Match,
  Outlet,
  useMatches,
  useRouterState,
} from "@tanstack/react-router";

import { Breacrumbs } from "@/components/Breadcrumb";

export const Route = createFileRoute("/$lang/_layout")({
  component: RouteComponent,
});

function RouteComponent() {
  const matches = useMatches();

  if (matches.some((match) => match.status === "pending")) return null;

  const matchesWithCrumbs = matches.filter((match) =>
    isMatch(match, "context.crumb")
  );

  console.log("matchesWithCrumbs", matchesWithCrumbs);

  return (
    <div>
      <Breacrumbs
        breadcrumbsPath={matchesWithCrumbs.map((m) => ({
          label: m.context.crumb!,
          href: m.fullPath,
        }))}
      />

      <Outlet />
    </div>
  );
}
