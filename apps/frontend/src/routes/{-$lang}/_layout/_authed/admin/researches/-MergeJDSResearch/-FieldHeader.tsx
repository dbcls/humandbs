import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

import type { FieldStatus, MergeFieldDescriptor } from "../-computeMergeFields";

function statusBadgeClass(status: FieldStatus): string {
  if (status === "conflict") return "bg-amber-100 text-amber-700";
  if (status === "can-fill") return "bg-blue-100 text-blue-700";
  if (status === "same") return "bg-gray-100 text-gray-600";
  return "bg-gray-50 text-gray-400";
}

function statusLabel(status: FieldStatus): string {
  if (status === "conflict") return "Conflict";
  if (status === "can-fill") return "Can fill";
  if (status === "same") return "Same";
  return "N/A";
}

export function FieldHeader({
  field,
  currentIndex,
  totalActionable,
  decidedCount,
  onPrev,
  onNext,
}: {
  field: MergeFieldDescriptor;
  currentIndex: number;
  totalActionable: number;
  decidedCount: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const progress = totalActionable > 0 ? (decidedCount / totalActionable) * 100 : 0;

  return (
    <div className="flex flex-col gap-2 border-gray-200 border-b bg-white px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800 text-sm">
            {field.group} — {field.label}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-medium text-[10px]",
              statusBadgeClass(field.status),
            )}
          >
            {statusLabel(field.status)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-500 text-xs">
          {totalActionable > 0 && (
            <span>
              {currentIndex + 1} of {totalActionable}
            </span>
          )}
          <button
            type="button"
            onClick={onPrev}
            disabled={currentIndex <= 0}
            className="rounded p-0.5 hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={currentIndex >= totalActionable - 1}
            className="rounded p-0.5 hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-400">
          {decidedCount}/{totalActionable}
        </span>
      </div>
    </div>
  );
}
