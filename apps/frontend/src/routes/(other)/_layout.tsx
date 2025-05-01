import {
  createFileRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { useMemo } from "react";

import { Breacrumbs, BreadcroumbsPath } from "@/components/Breadcrumb";

export const Route = createFileRoute("/(other)/_layout")({
  component: RouteComponent,
});

function RouteComponent() {
  const { resolvedLocation } = useRouterState();

  const breadcrumbs = useMemo(() => {
    if (!resolvedLocation) return [];
    const paths = resolvedLocation.href
      .split("/")
      .slice(2)
      .map((_, index, array) => {
        const href = "/" + array.slice(0, index + 1).join("/");
        const label = array[index];
        return { href, label };
      });

    paths.unshift({ href: "/", label: "Home" });

    return paths as BreadcroumbsPath[];
  }, [resolvedLocation]);

  return (
    <div>
      <Breacrumbs breadcrumbsPath={breadcrumbs} />

      <Outlet />
    </div>
  );
}
