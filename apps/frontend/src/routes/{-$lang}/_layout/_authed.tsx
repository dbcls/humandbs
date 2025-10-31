import { Navbar } from "@/components/Navbar";
import { cn } from "@/lib/utils";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import {
  Cuboid,
  Files,
  LibraryBig,
  Newspaper,
  PenTool,
  User2,
} from "lucide-react";
import z from "zod";

export const tabParamSchema = z.enum([
  "news",
  "documents",
  "content",
  "users",
  "researches",
  "assets",
]);

export type TabType = z.infer<typeof tabParamSchema>;

function getTabRoute(tabFromPath: string | undefined): TabType | null {
  if (!tabFromPath) return null;

  const afterAdminSegment = [
    ...(tabFromPath?.match(/\/admin\/([^\/]+)/i) || []),
  ]?.[1];

  if (tabParamSchema.safeParse(afterAdminSegment).success)
    return afterAdminSegment as TabType;

  return null;
}

function stringifySearch(
  search: Record<string, string | number> | undefined | null
) {
  if (!search) return "";

  const params = new URLSearchParams();

  const appendValue = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => appendValue(key, entry));
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
  fallback: string
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
  beforeLoad: async ({ context, matches, location }) => {
    if (!context.user) {
      const fallback =
        typeof context.lang === "string" && context.lang.length > 0
          ? `/${context.lang}`
          : "/";

      const target = buildRedirectTarget(location, fallback);

      throw redirect({
        to: "/api/auth/login",
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
      <section className="flex flex-1 items-stretch gap-3">
        <NavPanel />
        <Outlet />
      </section>
    </main>
  );
}

function NavPanel() {
  return (
    <aside className="flex flex-col gap-5 rounded-md bg-white px-4 py-3">
      <section className="flex flex-col gap-5">
        <p>Static Pages</p>
        <div className="flex flex-col gap-5 pl-5">
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
        </div>
      </section>

      <PanelItem
        title={
          <span>
            <LibraryBig className="mr-2 inline size-5 align-middle leading-normal" />
            Researches
          </span>
        }
        tab="researches"
      />
      <PanelItem
        title={
          <span>
            <User2 className="mr-2 inline size-5 align-middle leading-normal" />
            Users
          </span>
        }
        tab="users"
      />
    </aside>
  );
}

function PanelItem({ tab, title }: { tab: TabType; title: React.ReactNode }) {
  const { tab: activeTab, lang } = Route.useRouteContext();

  return (
    <Link
      className={cn("hover:bg-hover rounded-sm px-3 py-2 transition-colors", {
        "bg-secondary/20 hover:bg-secondary/30": activeTab === tab,
      })}
      to={`/{-$lang}/admin/${tab}`}
      params={{ lang }}
    >
      {title}
    </Link>
  );
}
