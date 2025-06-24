import { createFileRoute, isMatch, Outlet } from "@tanstack/react-router";

import { Breacrumbs } from "@/components/Breadcrumb";
import { useMatches } from "@tanstack/react-router";

export const Route = createFileRoute("/$lang/_layout")({
  component: RouteComponent,
});

function RouteComponent() {
  const matches = useMatches();

  if (matches.some((match) => match.status === "pending")) return null;

  const matchesWithCrumbs = matches.filter((match) =>
    isMatch(match, "loaderData.crumb")
  );

  return (
    <div>
      <Breacrumbs
        breadcrumbsPath={matchesWithCrumbs.map((m) => ({
          label: m.loaderData!.crumb!,
          href: m.fullPath,
        }))}
      />

      <Outlet />
    </div>
  );
}
