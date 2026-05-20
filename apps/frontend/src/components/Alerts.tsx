import { useState } from "react";

import { useLoaderData } from "@tanstack/react-router";
import { LucideX, TriangleAlert } from "lucide-react";

import { Button } from "./ui/button";

export function Alerts() {
  const { alerts } = useLoaderData({ from: "/{-$lang}/_layout/_main" });
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const visibleAlerts = alerts?.filter((a) => !hiddenIds.has(a.id));

  if (!visibleAlerts || visibleAlerts.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {visibleAlerts.map((alert) => (
        <AlertMessage
          key={alert.id}
          {...alert}
          onHide={(alertId) => setHiddenIds((prev) => new Set(prev).add(alertId))}
        />
      ))}
    </ul>
  );
}

export function AlertMessage({
  id,
  content,
  onHide,
}: {
  onHide?: (alertId: string) => void;
  id: string;
  content: string;
}) {
  return (
    <div className="text-foreground-dark flex items-center justify-between gap-2 rounded-sm border border-amber-600 bg-amber-50 px-4 py-2">
      <div className="flex items-center gap-4">
        <TriangleAlert className="size-5 text-amber-700" />
        <p className="text-xs whitespace-pre-wrap">{content}</p>
      </div>
      <Button
        onClick={() => onHide?.(id)}
        variant={"ghost"}
        size={"icon"}
        aria-label="Hide alert"
      >
        <LucideX className="size-5" />
      </Button>
    </div>
  );
}
