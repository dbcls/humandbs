import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";

import { Card } from "@/components/Card";
import {
  $getNavigationFlowcharts,
  getNavigationFlowchartsQueryOptions,
} from "@/serverFunctions/navigationFlowchartAdmin";
import type { NavigationFlowchartSummary } from "@/repositories/navigationFlowchart";
import { NAVIGATION_FLOWCHART_STATUS } from "@/db/schema";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_authed/admin/flowcharts",
)({
  component: RouteComponent,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(getNavigationFlowchartsQueryOptions()),
});

function RouteComponent() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <Card
        className="w-cms-list-panel flex h-full flex-col"
        caption="Flowcharts"
      >
        <FlowchartList
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </Card>
      {selectedId ? (
        <FlowchartEditorPlaceholder key={selectedId} id={selectedId} />
      ) : (
        <Card className="flex flex-1 items-center justify-center text-gray-400">
          <div className="flex flex-col items-center gap-3">
            <GitBranch className="size-10 opacity-30" />
            <p className="text-sm">Select a flowchart to edit</p>
          </div>
        </Card>
      )}
    </>
  );
}

function FlowchartList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data: flowcharts = [] } = useQuery(
    getNavigationFlowchartsQueryOptions(),
  );

  return (
    <div className="flex flex-col gap-1">
      {flowcharts.map((fc) => (
        <FlowchartListItem
          key={fc.id}
          flowchart={fc}
          isSelected={selectedId === fc.id}
          onSelect={() => onSelect(fc.id)}
        />
      ))}
      {flowcharts.length === 0 && (
        <p className="text-sm text-gray-400">No flowcharts yet.</p>
      )}
    </div>
  );
}

function FlowchartListItem({
  flowchart,
  isSelected,
  onSelect,
}: {
  flowchart: NavigationFlowchartSummary;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isPublished = flowchart.status === NAVIGATION_FLOWCHART_STATUS.PUBLISHED;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left text-sm transition-colors",
        isSelected
          ? "bg-hover text-accent-foreground"
          : "hover:bg-hover/50",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">{flowchart.nameEn}</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-medium",
            isPublished
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500",
          )}
        >
          {isPublished ? "published" : "draft"}
        </span>
        {flowchart.isEntryPoint && (
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
            entry point
          </span>
        )}
      </div>
      <span className="text-xs text-gray-400">{flowchart.slug}</span>
    </button>
  );
}

function FlowchartEditorPlaceholder({ id }: { id: string }) {
  return (
    <Card className="flex flex-1 flex-col">
      <p className="text-sm text-gray-400">
        Editor coming soon (id: {id})
      </p>
    </Card>
  );
}
