import {
  CatchBoundary,
  createFileRoute,
  Outlet,
  useLocation,
  useMatches,
} from "@tanstack/react-router";

import { Breacrumbs } from "@/components/Breadcrumb";
import { FileRoutesByTo } from "@/routeTree.gen";

export const Route = createFileRoute("/$lang/_layout")({
  component: RouteComponent,
});

function RouteComponent() {
  const current = useLocation();

  const matches = useMatches();

  console.log("matches", matches);

  const routeHistory = current.pathname
    .split("/")
    .filter((x) => x && x.length > 0);

  const breadcrumbRoutes = routeHistory.reduce(
    (acc: { label: string; href: keyof FileRoutesByTo }[], route) => {
      const prev_path = acc[acc.length - 1]?.href ?? "";
      acc.push({
        label: route,
        href: `${prev_path}/${route}` as keyof FileRoutesByTo,
      });
      return acc;
    },
    []
  );

  breadcrumbRoutes[0].label = "home";

  return (
    <div>
      <CatchBoundary getResetKey={() => "reset"}>
        <Breacrumbs breadcrumbsPath={breadcrumbRoutes} />
        <Outlet />
      </CatchBoundary>
    </div>
  );
}
