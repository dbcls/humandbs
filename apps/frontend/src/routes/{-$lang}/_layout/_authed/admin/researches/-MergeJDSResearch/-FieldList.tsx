import { AlertTriangle, Check, CheckCircle2, Minus, PlusCircle } from "lucide-react";
import { useTranslations } from "use-intl";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import type { FieldDecision, FieldStatus, MergeFieldDescriptor } from "../-computeMergeFields";

export function StatusIcon({ status, decided }: { status: FieldStatus; decided: boolean }) {
  if (decided) return <CheckCircle2 className="size-5 text-green-600" />;
  if (status === "conflict") return <AlertTriangle className="size-5 text-amber-500" />;
  if (status === "can-fill") return <PlusCircle className="size-5 text-blue-500" />;
  if (status === "same") return <Check className="size-5 text-gray-400" />;
  return <Minus className="size-5 text-gray-300" />;
}

export function StatPills({
  fields,
  decisions,
}: {
  fields: MergeFieldDescriptor[];
  decisions: Record<string, FieldDecision>;
}) {
  const actionable = fields.filter((f) => f.status !== "na" && f.status !== "same");
  const decided = actionable.filter((f) => (decisions[f.key] ?? "pending") !== "pending");
  const toReview = actionable.length - decided.length;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
        {toReview} to review
      </span>
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">
        {decided.length} decided
      </span>
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
        {actionable.length} total
      </span>
    </div>
  );
}

export function FieldList({
  fields,
  decisions,
  activeKey,
  onSelect,
}: {
  fields: MergeFieldDescriptor[];
  decisions: Record<string, FieldDecision>;
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  const t = useTranslations("MergeWizard");
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeKey]);

  const groups: Record<string, MergeFieldDescriptor[]> = {};
  for (const f of fields) {
    if (!groups[f.group]) groups[f.group] = [];
    groups[f.group].push(f);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto border-gray-200 border-r">
      {Object.entries(groups).map(([group, groupFields]) => (
        <div key={group}>
          <div className="sticky top-0 z-10 bg-gray-50 px-3 py-1.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">
            {group}
          </div>
          {groupFields.map((field) => {
            const isActive = field.key === activeKey;
            const isSame = field.status === "same";
            const decision = decisions[field.key] ?? "pending";
            const decided = decision !== "pending";

            return (
              <button
                key={field.key}
                ref={isActive ? activeRef : null}
                type="button"
                disabled={isSame}
                onClick={() => !isSame && onSelect(field.key)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                  isActive && "bg-blue-50",
                  !isActive && !isSame && "hover:bg-gray-50",
                  isSame && "cursor-default opacity-40",
                )}
              >
                <StatusIcon status={field.status} decided={decided} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-gray-800 text-xs">{field.label}</div>
                  <div className="truncate text-2xs text-gray-400">
                    {decided ? t(`field-decision-${decision}`) : t(`field-status-${field.status}`)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
