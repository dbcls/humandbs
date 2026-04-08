import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import {
  Cuboid,
  Files,
  LibraryBig,
  PanelsTopLeft,
  Newspaper,
  PenTool,
} from "lucide-react";
import { z } from "zod";

import { Navbar } from "@/components/Navbar";
import { USER_ROLES } from "@/config/permissions";
import { useCan } from "@/hooks/useCan";
import { Link } from "@/components/Link";

export const tabParamSchema = z.enum([
  "news",
  "documents",
  "content",
  "researches",
  "assets",
  "navigation",
]);

export type TabType = z.infer<typeof tabParamSchema>;

function getTabRoute(tabFromPath: string | undefined): TabType | null {
  if (!tabFromPath) return null;

  const afterAdminSegment = [
    ...(/\/admin\/([^\/]+)/i.exec(tabFromPath) || []),
  ]?.[1];

  if (tabParamSchema.safeParse(afterAdminSegment).success)
    return afterAdminSegment as TabType;

  return null;
}

function stringifySearch(
  search: Record<string, string | number> | undefined | null,
) {
  if (!search) return "";

  const params = new URLSearchParams();

  const appendValue = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        appendValue(key, entry);
      });
      return;
    }
    params.append(key, String(value));
  };

  Object.entries(search as Record<string, unknown>).forEach(([key, value]) => {
    appendValue(key, value);
  });

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function buildRedirectTarget(
  location: {
    pathname: string;
    search?: Record<string, string | number>;
    hash?: string;
  },
  fallback: string,
) {
  try {
    const pathname =
      typeof location.pathname === "string" && location.pathname.startsWith("/")
        ? location.pathname
        : "";

    if (!pathname) return fallback;

    const search = stringifySearch(location.search);

    const target = `${pathname}${search}${location.hash}`;

    if (!target.startsWith("/")) return fallback;

    return target || fallback;
  } catch {
    return fallback;
  }
}

export const Route = createFileRoute("/{-$lang}/_layout/_authed")({
  beforeLoad: ({ context, matches, location }) => {
    if (!context.user) {
      const fallback =
        typeof context.lang === "string" && context.lang.length > 0
          ? `/${context.lang}`
          : "/";

      const target = buildRedirectTarget(location, fallback);

      throw redirect({
        to: "/auth/login",
        search: {
          redirect: target,
        },
      });
    }

    const tab = getTabRoute(matches.at(-1)?.fullPath);

    return {
      tab,
    };
  },

  component: RouteComponent,
});

function RouteComponent() {
  return (
    <main className="flex h-screen flex-col gap-2 p-4">
      <Navbar />
      <section className="flex min-h-0 flex-1 items-stretch gap-3">
        <NavPanel />
        <Outlet />
      </section>
    </main>
  );
}

function NavPanel() {
  const { can: canViewCms } = useCan({
    resource: "admin-panel",
    action: "view-cms",
  });

  return (
    <aside className="flex flex-col gap-5 rounded-md bg-white px-4 py-3">
      {canViewCms && (
        <section className="flex flex-col gap-5 text-sm">
          <span>Static Pages</span>
          <div className="flex flex-col gap-5 pl-5 items-stretch">
            <PanelItem
              title={
                <span>
                  <PenTool className="mr-2 inline size-5 align-middle leading-normal" />
                  Content
                </span>
              }
              tab="content"
            />
            <PanelItem
              title={
                <span>
                  <Files className="mr-2 inline size-5 align-middle leading-normal" />
                  Documents
                </span>
              }
              tab="documents"
            />
            <PanelItem
              title={
                <span>
                  <Newspaper className="mr-2 inline size-5 align-middle leading-normal" />
                  News
                </span>
              }
              tab="news"
            />
            <PanelItem
              title={
                <span>
                  <Cuboid className="mr-2 inline size-5 align-middle leading-normal" />
                  Assets
                </span>
              }
              tab="assets"
            />
            <PanelItem
              title={
                <span>
                  <PanelsTopLeft className="mr-2 inline size-5 align-middle leading-normal" />
                  Navigation
                </span>
              }
              tab="navigation"
            />
          </div>
        </section>
      )}

      <PanelItem
        title={
          <span>
            <LibraryBig className="mr-2 inline size-5 align-middle leading-normal" />
            Researches
          </span>
        }
        tab="researches"
      />
    </aside>
  );
}

function PanelItem({ tab, title }: { tab: TabType; title: React.ReactNode }) {
  const { lang } = Route.useRouteContext();

  return (
    <Link
      variant={"nav"}
      className="w-auto rounded-sm data-[status=active]:bg-hover hover:bg-hover/50 hover:text-accent-foreground py-2 px-4"
      to={`/{-$lang}/admin/${tab}`}
      params={{ lang }}
    >
      {title}
    </Link>
  );
}
