import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import {
  ArchiveRestore,
  Bell,
  Cuboid,
  Files,
  GitBranch,
  LibraryBig,
  Newspaper,
  PanelsTopLeft,
  PenTool,
} from "lucide-react";
import { z } from "zod";

import { CollapsibleCard } from "@/components/CollapsibleCard";
import { Link } from "@/components/Link";
import { useCan } from "@/hooks/useCan";

export const tabParamSchema = z.enum([
  "news",
  "alerts",
  "documents",
  "content",
  "researches",
  "assets",
  "header-footer",
  "flowcharts",
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
    <main className="flex min-h-0 flex-1 items-stretch gap-3 p-4">
      <NavPanel />
      <Outlet />
    </main>
  );
}

function NavPanel() {
  const { can: canViewCms } = useCan({
    resource: "admin-panel",
    action: "view-cms",
  });

  return (
    <CollapsibleCard wLeftPanel>
      <section className="flex flex-col gap-5">
        {canViewCms && (
          <section className="flex flex-col gap-5 text-sm">
            <span>Static Pages</span>
            <div className="flex flex-col items-stretch gap-5 pl-5">
              <PanelRootItem
                title={
                  <span>
                    <ArchiveRestore className="mr-2 inline size-5 align-middle leading-normal" />
                    Data Transfer
                  </span>
                }
              />
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
                    <Bell className="mr-2 inline size-5 align-middle leading-normal" />
                    Alerts
                  </span>
                }
                tab="alerts"
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
                    Header & Footer
                  </span>
                }
                tab="header-footer"
              />
              <PanelItem
                title={
                  <span>
                    <GitBranch className="mr-2 inline size-5 align-middle leading-normal" />
                    Flowcharts
                  </span>
                }
                tab="flowcharts"
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
      </section>
    </CollapsibleCard>
  );
}

function PanelRootItem({ title }: { title: React.ReactNode }) {
  return (
    <Link
      variant={"nav"}
      activeOptions={{ exact: true }}
      className="data-[status=active]:bg-hover hover:bg-hover/50 hover:text-accent-foreground w-auto rounded-sm px-4 py-2"
      to={"/{-$lang}/admin" as never}
    >
      {title}
    </Link>
  );
}

function PanelItem({ tab, title }: { tab: TabType; title: React.ReactNode }) {
  return (
    <Link
      variant={"nav"}
      className="data-[status=active]:bg-hover hover:bg-hover/50 hover:text-accent-foreground w-auto rounded-sm px-4 py-2"
      to={`/{-$lang}/admin/${tab}` as never}
    >
      {title}
    </Link>
  );
}
