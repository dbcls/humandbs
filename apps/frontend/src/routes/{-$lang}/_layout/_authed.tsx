import { cn } from "@/lib/utils";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { Files, LibraryBig, Newspaper, PenTool, User2 } from "lucide-react";
import z from "zod";

export const tabParamSchema = z.enum([
  "news",
  "documents",
  "content",
  "users",
  "researches",
  "assets",
]);

type TabType = z.infer<typeof tabParamSchema>;

function isTabRoute(lastSegment: string | undefined): lastSegment is TabType {
  return tabParamSchema.safeParse(lastSegment).success;
}

export const Route = createFileRoute("/{-$lang}/_layout/_authed")({
  beforeLoad: async ({ context, matches }) => {
    if (!context.user) {
      throw redirect({
        to: "/{-$lang}",
        params: {
          lang: context.lang,
        },
      });
    }

    const lastSegment = matches
      .at(-1)
      ?.fullPath.split("/")
      .filter(Boolean)
      .at(-1) as string | undefined;

    if (!isTabRoute(lastSegment)) {
      throw redirect({
        to: "/{-$lang}/admin/news",
        params: {
          lang: context.lang,
        },
      });
    }

    return {
      tab: lastSegment,
    };
  },

  component: RouteComponent,
});

function RouteComponent() {
  return (
    <main className="flex h-screen flex-col gap-2 p-4">
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
      <PanelItem
        title={
          <span>
            <PenTool className="inline size-5 align-middle leading-normal" />{" "}
            Content
          </span>
        }
        tab="content"
      />
      <PanelItem
        title={
          <span>
            <Files className="inline size-5 align-middle leading-normal" />{" "}
            Documents
          </span>
        }
        tab="documents"
      />
      <PanelItem
        title={
          <span>
            <Newspaper className="inline size-5 align-middle leading-normal" />{" "}
            News
          </span>
        }
        tab="news"
      />
      <PanelItem
        title={
          <span>
            <LibraryBig className="inline size-5 align-middle leading-normal" />{" "}
            Researches
          </span>
        }
        tab="researches"
      />
      <PanelItem
        title={
          <span>
            <User2 className="inline size-5 align-middle leading-normal" />{" "}
            Users
          </span>
        }
        tab="users"
      />
    </aside>
  );
}

function PanelItem({ tab, title }: { tab: TabType; title: React.ReactNode }) {
  const { tab: activeTab } = Route.useRouteContext();
  const { lang } = Route.useRouteContext();

  return (
    <Link
      className={cn("px-3 py-2", {
        "bg-accent-light/20": activeTab === tab,
      })}
      to={`/{-$lang}/admin/${tab}`}
      params={{ lang }}
    >
      {title}
    </Link>
  );
}
