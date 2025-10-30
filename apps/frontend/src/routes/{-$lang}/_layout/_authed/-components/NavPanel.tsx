import { cn } from "@/lib/utils";
import { Link, useChildMatches, useRouteContext } from "@tanstack/react-router";
import { Files, LibraryBig, Newspaper, PenTool, User2 } from "lucide-react";
import z from "zod";
import { tabParamSchema } from "../admin.route";

type PanelType = z.infer<typeof tabParamSchema>;

export function NavPanel() {
  return (
    <aside className="flex flex-col gap-5 rounded-md bg-white px-4 py-3">
      <PanelItem
        title={
          <span>
            <PenTool className="inline size-5 align-middle leading-normal" />{" "}
            Content
          </span>
        }
        panel="content"
      />
      <PanelItem
        title={
          <span>
            <Files className="inline size-5 align-middle leading-normal" />{" "}
            Documents
          </span>
        }
        panel="documents"
      />
      <PanelItem
        title={
          <span>
            <Newspaper className="inline size-5 align-middle leading-normal" />{" "}
            News
          </span>
        }
        panel="news"
      />
      <PanelItem
        title={
          <span>
            <LibraryBig className="inline size-5 align-middle leading-normal" />{" "}
            Researches
          </span>
        }
        panel="researches"
      />
      <PanelItem
        title={
          <span>
            <User2 className="inline size-5 align-middle leading-normal" />{" "}
            Users
          </span>
        }
        panel="users"
      />
    </aside>
  );
}

function PanelItem({
  panel,
  title,
}: {
  panel: PanelType;
  title: React.ReactNode;
}) {
  const matches = useChildMatches();
  const { lang } = useRouteContext({ from: "/{-$lang}/_layout/_authed" });

  const lastSegment = matches.at(-1)?.fullPath.split("/").pop();
  return (
    <Link
      className={cn("px-3 py-2", {
        "bg-accent-light/20": lastSegment === panel,
      })}
      to={`/{-$lang}/admin/${panel}`}
      params={{ lang }}
    >
      {title}
    </Link>
  );
}
