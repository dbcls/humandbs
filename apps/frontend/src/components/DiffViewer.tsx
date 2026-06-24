import { useEffect, useState } from "react";

import { Markdown } from "@/components/markdown";
import type { DiffRow } from "@/utils/markdownDiff";
import { renderMarkdownDiffRows } from "@/utils/markdownDiff";

import { SkeletonLoading } from "./Skeleton";

/**
 * Side-by-side diff of two markdown documents. Each version is rendered through
 * the app's markdown pipeline, diffed at the AST level, and laid out as aligned
 * rows: old version on the left (removals in red), new on the right (additions
 * in green). Callouts and other custom elements render as on the live site.
 */
export function DiffViewer({ oldText, newText }: { oldText: string; newText: string }) {
  const [rows, setRows] = useState<DiffRow[]>();

  useEffect(() => {
    let cancelled = false;
    renderMarkdownDiffRows(oldText, newText).then((res) => {
      if (!cancelled) setRows(res);
    });
    return () => {
      cancelled = true;
    };
  }, [oldText, newText]);

  if (!rows) return <SkeletonLoading />;

  // Collapse runs of consecutive unchanged blocks into a single gap marker, so
  // only changed/added/removed blocks are shown (with the count of what's hidden).
  const groups: ({ type: "row"; row: DiffRow } | { type: "gap"; count: number })[] = [];
  for (const row of rows) {
    if (row.status === "unchanged") {
      const last = groups.at(-1);
      if (last?.type === "gap") last.count += 1;
      else groups.push({ type: "gap", count: 1 });
    } else {
      groups.push({ type: "row", row });
    }
  }

  return (
    <div className="markdown-diff w-full">
      <div className="grid grid-cols-2 gap-px border-foreground-light/40 border-b bg-foreground-light/40 font-medium text-foreground-light text-sm">
        <div className="bg-background px-3 py-1">Previous</div>
        <div className="bg-background px-3 py-1">This revision</div>
      </div>
      {groups.map((g, i) =>
        g.type === "gap" ? (
          <UnchangedGap key={i} count={g.count} />
        ) : (
          <DiffRowView key={i} row={g.row} />
        ),
      )}
    </div>
  );
}

function UnchangedGap({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-center gap-2 bg-foreground-light/10 py-1.5 text-foreground-light text-xs">
      <span className="h-px flex-1 bg-foreground-light/30" />
      <span>⋯ {count} unchanged section{count === 1 ? "" : "s"}</span>
      <span className="h-px flex-1 bg-foreground-light/30" />
    </div>
  );
}

function DiffRowView({ row }: { row: DiffRow }) {
  return (
    <div className="grid grid-cols-2 gap-px bg-foreground-light/20" data-status={row.status}>
      <DiffCell html={row.left} side="left" status={row.status} />
      <DiffCell html={row.right} side="right" status={row.status} />
    </div>
  );
}

function DiffCell({
  html,
  side,
  status,
}: {
  html?: string;
  side: "left" | "right";
  status: DiffRow["status"];
}) {
  // An empty side of an add/remove pair: render a placeholder so the rows align.
  if (html === undefined) {
    return <div className="bg-background/40" data-empty-side={status} />;
  }
  return (
    <div className="custom-prose min-w-0 bg-background px-3 py-2" data-side={side}>
      <Markdown contentHtml={{ markup: html, headings: [] }} />
    </div>
  );
}
