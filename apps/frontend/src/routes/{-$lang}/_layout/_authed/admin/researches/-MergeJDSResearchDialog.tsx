import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Minus,
  PlusCircle,
  Trash2,
} from "lucide-react";

import { useEffect, useRef, useState } from "react";

import type { ResearchDetailResponse } from "@humandbs/backend/types";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { $getJDSResearch } from "@/serverFunctions/researches";
import useMergeWizardStore from "@/stores/mergeWizardStore";

import type { ResearchTemplateData } from "../../../../../../../../backend/src/api/types/templates";
import { AdminStatusMessage } from "../-components/AdminStatusMessage";
import { applyMergeDecisions } from "./-applyMergeDecisions";
import type { ArrayItem, EditableCard } from "./-arrayCodecs";
import { arrayCodecs } from "./-arrayCodecs";
import type { FieldDecision, FieldStatus, MergeFieldDescriptor } from "./-computeMergeFields";
import { computeMergeFields } from "./-computeMergeFields";
import type { MergeResearchResult } from "./-mergeJDSResearch";

type ResearchValues = ResearchDetailResponse["data"];

// ── Status icon ──────────────────────────────────────────────────────────────

function StatusIcon({ status, decided }: { status: FieldStatus; decided: boolean }) {
  if (decided) return <CheckCircle2 className="size-5 text-green-600" />;
  if (status === "conflict") return <AlertTriangle className="size-5 text-amber-500" />;
  if (status === "can-fill") return <PlusCircle className="size-5 text-blue-500" />;
  if (status === "same") return <Check className="size-5 text-gray-400" />;
  return <Minus className="size-5 text-gray-300" />;
}

// ── Stat pills ───────────────────────────────────────────────────────────────

function StatPills({
  fields,
  decisions,
}: {
  fields: MergeFieldDescriptor[];
  decisions: Record<string, FieldDecision>;
}) {
  const actionable = fields.filter((f) => f.status !== "na" && f.status !== "same");
  const decided = actionable.filter((f) => {
    const d = decisions[f.key] ?? "pending";
    return d !== "pending";
  });
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

// ── Field list panel (left) ──────────────────────────────────────────────────

function FieldList({
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
            const isDimmed = field.status === "same";
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
                  isDimmed && "opacity-40",
                  isSame && "cursor-default",
                )}
              >
                <StatusIcon status={field.status} decided={decided} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-gray-800 text-xs">{field.label}</div>
                  <div className="truncate text-2xs text-gray-400">{field.status}</div>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Value display helpers ─────────────────────────────────────────────────────

function ScalarValue({ value, placeholder }: { value: unknown; placeholder: string }) {
  const text =
    value != null && typeof value === "object" && "text" in value
      ? (value as { text: string }).text
      : (value as string | null);

  if (!text) {
    return (
      <div className="rounded border border-gray-200 border-dashed p-3 text-gray-400 text-xs italic">
        {placeholder}
      </div>
    );
  }
  return (
    <div className="whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-3 text-xs">
      {text}
    </div>
  );
}

function ArrayCards({
  items,
  dataType,
}: {
  items: ArrayItem[];
  dataType: MergeFieldDescriptor["dataType"];
}) {
  if (items.length === 0) {
    return <div className="py-4 text-center text-gray-400 text-xs italic">No items</div>;
  }
  if (dataType === "scalar") return null;
  const codec = arrayCodecs[dataType];
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <codec.ViewCard key={i} item={item} />
      ))}
    </div>
  );
}

// ── Inline scalar editor ──────────────────────────────────────────────────────

function InlineScalarEditor({
  field,
  decision,
  customValue,
  onSave,
  onCancel,
}: {
  field: MergeFieldDescriptor;
  decision: FieldDecision;
  customValue: unknown;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  function toText(v: unknown): string {
    if (v == null) return "";
    if (typeof v === "object" && "text" in v) return (v as { text: string }).text ?? "";
    return String(v);
  }

  function getInitial(): string {
    if (decision === "custom" && customValue !== undefined) return toText(customValue);
    if (decision === "accepted") return toText(field.incomingValue);
    if (decision === "rejected") return toText(field.currentValue);
    // pending → current
    return toText(field.currentValue);
  }

  const [text, setText] = useState(getInitial);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSave(text);
    }
  }

  const hasCurrent = Boolean(toText(field.currentValue));
  const hasIncoming = Boolean(toText(field.incomingValue));

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex gap-1">
        {hasIncoming && (
          <button
            type="button"
            onClick={() => setText(toText(field.incomingValue))}
            className="rounded bg-gray-100 px-2 py-0.5 text-gray-700 text-xs hover:bg-gray-200"
          >
            From J-DS
          </button>
        )}
        {hasCurrent && (
          <button
            type="button"
            onClick={() => setText(toText(field.currentValue))}
            className="rounded bg-gray-100 px-2 py-0.5 text-gray-700 text-xs hover:bg-gray-200"
          >
            From current
          </button>
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={5}
        className="w-full rounded border border-blue-300 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <div className="flex items-center gap-2">
        <Button size="default" type="button" onClick={() => onSave(text)}>
          Save
        </Button>
        <Button size="default" type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="text-[10px] text-gray-400">Cmd+Enter to save · Esc to cancel</span>
      </div>
    </div>
  );
}

// ── Inline array editor ───────────────────────────────────────────────────────

function InlineArrayEditor({
  field,
  customValue,
  onSave,
  onCancel,
}: {
  field: MergeFieldDescriptor;
  customValue: unknown;
  onSave: (items: ArrayItem[]) => void;
  onCancel: () => void;
}) {
  const codec = field.dataType !== "scalar" ? arrayCodecs[field.dataType] : null;

  const incomingArr = field.incomingValue as ArrayItem[] | null;
  const currentArr = field.currentValue as ArrayItem[] | null;
  const seed = (
    customValue !== undefined ? customValue : incomingArr?.length ? incomingArr : currentArr
  ) as ArrayItem[];

  const [cards, setCards] = useState<EditableCard[]>(() =>
    codec ? (seed ?? []).map((item) => codec.fromItem(item)) : [],
  );

  if (!codec) return null;

  function setCard(index: number, card: EditableCard) {
    setCards((prev) => prev.map((c, i) => (i === index ? card : c)));
  }

  function removeCard(index: number) {
    setCards((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    onSave(cards.map((c) => codec!.toItem(c)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-3">
        {cards.map((card, i) => (
          <div key={i} className="rounded border border-gray-300 bg-white">
            <div className="flex items-center gap-2 border-gray-400 border-b bg-gray-300 px-3 py-2">
              <span className="flex-1 font-medium text-sm">
                #{i + 1} {codec.title(card.fields)}
              </span>
              <button
                type="button"
                onClick={() => removeCard(i)}
                className="text-gray-400 hover:text-red-500"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <codec.EditBody
              card={card}
              onChange={(key, val) =>
                setCard(i, { ...card, fields: { ...card.fields, [key]: val } })
              }
              onChangeCard={(updated) => setCard(i, updated)}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setCards((prev) => [...prev, codec.blank()])}
        className="flex items-center gap-1 self-start text-blue-600 text-xs hover:underline"
      >
        <PlusCircle className="size-3.5" /> Add item
      </button>
      <div className="flex items-center gap-2">
        <Button size="default" type="button" onClick={handleSave}>
          Save
        </Button>
        <Button size="default" type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Compare area (center) ─────────────────────────────────────────────────────

function decisionLabel(decision: FieldDecision, status: FieldStatus): string {
  if (decision === "accepted") return "Using J-DS value";
  if (decision === "rejected") return status === "conflict" ? "Keeping current" : "Leaving empty";
  if (decision === "custom") return "Custom value";
  return "No decision yet — will keep current on apply";
}

function decisionBadgeClass(decision: FieldDecision): string {
  if (decision === "accepted") return "bg-pink-50 text-pink-700";
  if (decision === "rejected") return "bg-blue-50 text-blue-700";
  if (decision === "custom") return "bg-green-50 text-green-700";
  return "bg-amber-50 text-amber-600";
}

function CompareArea({
  field,
  decision,
  customValue,
  editing,
  hasNext,
  onAccept,
  onReject,
  onSkip,
  onUndo,
  onNext,
  onEditStart,
  onSaveCustom,
  onCancelEdit,
}: {
  field: MergeFieldDescriptor;
  decision: FieldDecision;
  customValue: unknown;
  editing: boolean;
  hasNext: boolean;
  onAccept: () => void;
  onReject: () => void;
  onSkip: () => void;
  onUndo: () => void;
  onNext: () => void;
  onEditStart: () => void;
  onSaveCustom: (value: unknown) => void;
  onCancelEdit: () => void;
}) {
  const isScalar = field.dataType === "scalar";
  const isNa = field.status === "na";
  const isSame = field.status === "same";
  const isActionable = !isNa && !isSame;
  const isEditable = !isSame;
  const isDecided = decision !== "pending";

  function resolveResultValue(): unknown {
    if (customValue !== undefined) return customValue;
    if (decision === "accepted") return field.incomingValue;
    // rejected or pending → current
    return field.currentValue;
  }

  const resultValue = resolveResultValue();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Top: two source columns — clickable when actionable */}
      <div className="grid grid-cols-2">
        {/* Current value */}
        <div
          role={isActionable ? "button" : undefined}
          tabIndex={isActionable ? 0 : undefined}
          onClick={isActionable ? onReject : undefined}
          onKeyDown={
            isActionable ? (e) => (e.key === "Enter" || e.key === " ") && onReject() : undefined
          }
          className={cn(
            "group flex flex-col gap-2 border-gray-200 border-r border-b p-4",
            isActionable && "cursor-pointer transition-colors hover:bg-blue-50",
            decision === "rejected" && "bg-blue-50",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="font-semibold text-gray-500 text-xs">Current value</div>
            {isActionable && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-medium text-[10px] opacity-0 transition-opacity group-hover:opacity-100",
                  decision === "rejected" && "opacity-100",
                  "bg-blue-100 text-blue-700",
                )}
              >
                {field.status === "conflict" ? "Use this" : "Leave empty"}
              </span>
            )}
          </div>
          {isScalar ? (
            <ScalarValue value={field.currentValue} placeholder="(empty)" />
          ) : (
            <ArrayCards
              items={(field.currentValue as ArrayItem[]) ?? []}
              dataType={field.dataType}
            />
          )}
        </div>

        {/* Value from J-DS */}
        <div
          role={isActionable ? "button" : undefined}
          tabIndex={isActionable ? 0 : undefined}
          onClick={isActionable ? onAccept : undefined}
          onKeyDown={
            isActionable ? (e) => (e.key === "Enter" || e.key === " ") && onAccept() : undefined
          }
          className={cn(
            "group flex flex-col gap-2 border-gray-200 border-b p-4",
            isActionable && "cursor-pointer transition-colors hover:bg-pink-50",
            decision === "accepted" && "bg-pink-50",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="font-semibold text-gray-500 text-xs">Value from J-DS</div>
            {isActionable && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-medium text-[10px] opacity-0 transition-opacity group-hover:opacity-100",
                  decision === "accepted" && "opacity-100",
                  "bg-pink-100 text-pink-700",
                )}
              >
                Use this
              </span>
            )}
          </div>
          {isScalar ? (
            <ScalarValue value={field.incomingValue} placeholder="(none)" />
          ) : (
            <ArrayCards
              items={(field.incomingValue as ArrayItem[]) ?? []}
              dataType={field.dataType}
            />
          )}
        </div>
      </div>

      {/* Bottom: New value — full width */}
      <div className="p-4">
        {/* New value header */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-gray-700 text-xs">New value</div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-medium text-[10px]",
                decisionBadgeClass(decision),
              )}
            >
              {decisionLabel(decision, field.status)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {isActionable && !editing && !isDecided && (
              <button
                type="button"
                onClick={onSkip}
                className="text-gray-400 text-xs hover:text-gray-600"
              >
                Skip for now
              </button>
            )}
            {isDecided && !editing && (
              <button
                type="button"
                onClick={onUndo}
                className="text-[10px] text-blue-600 hover:underline"
              >
                Undo
              </button>
            )}
            {isDecided && !editing && hasNext && (
              <Button type="button" size="default" variant="accent" onClick={onNext}>
                Next →
              </Button>
            )}
          </div>
        </div>

        {/* New value body — click to edit */}
        {editing ? (
          isScalar ? (
            <InlineScalarEditor
              field={field}
              decision={decision}
              customValue={customValue}
              onSave={(val) => {
                if (
                  field.incomingValue != null &&
                  typeof field.incomingValue === "object" &&
                  "text" in field.incomingValue
                ) {
                  onSaveCustom({ text: val });
                } else {
                  onSaveCustom(val);
                }
              }}
              onCancel={onCancelEdit}
            />
          ) : (
            <InlineArrayEditor
              field={field}
              customValue={customValue}
              onSave={(items) => onSaveCustom(items)}
              onCancel={onCancelEdit}
            />
          )
        ) : (
          <div
            className={cn(
              "flex flex-col gap-1",
              isEditable && "group cursor-pointer",
              !isEditable && "opacity-50",
            )}
            onClick={() => isEditable && onEditStart()}
          >
            {isScalar ? (
              <ScalarValue value={resultValue} placeholder="(empty)" />
            ) : (
              <ArrayCards items={(resultValue as ArrayItem[]) ?? []} dataType={field.dataType} />
            )}
            {isEditable && (
              <div className="text-[10px] text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
                Click to edit custom value
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Field header (center top) ─────────────────────────────────────────────────

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

function FieldHeader({
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

// ── Merge summary (footer) ────────────────────────────────────────────────────

function MergeSummary({
  fields,
  decisions,
}: {
  fields: MergeFieldDescriptor[];
  decisions: Record<string, FieldDecision>;
}) {
  const overwritten = fields.filter((f) => {
    const d = decisions[f.key] ?? "pending";
    return d === "accepted" || d === "custom";
  });

  if (overwritten.length === 0) {
    return <span className="text-gray-400 text-xs">No fields will be changed yet.</span>;
  }

  return (
    <div className="flex min-w-0 items-baseline gap-1.5 text-xs">
      <span className="shrink-0 text-gray-500">Will overwrite:</span>
      <span className="truncate text-gray-700">{overwritten.map((f) => f.label).join(", ")}</span>
      <span className="shrink-0 text-gray-400">({overwritten.length})</span>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function MergeJDSResearchDialog({
  currentValues,
  disabled,
  onMerge,
  className,
}: {
  currentValues: ResearchValues | ResearchTemplateData;
  disabled?: boolean;
  onMerge: (values: MergeResearchResult["values"], relatedAccessions: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [jdsId, setJdsId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const store = useMergeWizardStore();

  const { mutate: getJDSResearch, isPending } = useMutation({
    mutationFn: (id: string) => $getJDSResearch({ data: { id } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const fields = computeMergeFields(currentValues, result.data);
      store.setFetchedResearch(result.data, fields);
      setError(null);
      const firstActionable = fields.find((f) => f.status !== "same");
      if (firstActionable) store.setActiveField(firstActionable.key);
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to get J-DS research.");
    },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setJdsId("");
      setError(null);
      store.reset();
    }
  }

  function handleGet() {
    const trimmedId = jdsId.trim();
    if (!trimmedId) {
      setError("Enter a J-DS ID.");
      return;
    }
    getJDSResearch(trimmedId);
  }

  const { fields, decisions, customValues, activeFieldKey, editing } = store;

  const actionable = fields.filter((f) => f.status !== "same");
  const activeField = activeFieldKey ? fields.find((f) => f.key === activeFieldKey) : null;
  const activeDecision: FieldDecision = activeFieldKey
    ? (decisions[activeFieldKey] ?? "pending")
    : "pending";
  const activeCustomValue = activeFieldKey ? customValues[activeFieldKey] : undefined;

  const decidedCount = actionable.filter(
    (f) => (decisions[f.key] ?? "pending") !== "pending",
  ).length;
  const actionableIndex = activeFieldKey
    ? actionable.findIndex((f) => f.key === activeFieldKey)
    : -1;

  const canApply = Object.values(decisions).some((d) => d === "accepted" || d === "custom");

  function handleAccept() {
    if (!activeFieldKey || !activeField) return;
    store.setCustomValue(activeFieldKey, activeField.incomingValue);
    store.setDecision(activeFieldKey, "accepted");
  }

  function handleReject() {
    if (!activeFieldKey || !activeField) return;
    store.setCustomValue(activeFieldKey, activeField.currentValue);
    store.setDecision(activeFieldKey, "rejected");
  }

  function handleSkip() {
    handleNext();
  }

  function handleUndo() {
    if (!activeFieldKey) return;
    store.clearCustomValue(activeFieldKey);
    store.setDecision(activeFieldKey, "pending");
  }

  function handlePrev() {
    if (actionableIndex > 0) store.setActiveField(actionable[actionableIndex - 1].key);
  }

  function handleNext() {
    if (actionableIndex < actionable.length - 1)
      store.setActiveField(actionable[actionableIndex + 1].key);
  }

  function handleSaveCustom(value: unknown) {
    if (!activeFieldKey) return;
    store.setCustomValue(activeFieldKey, value);
    store.setDecision(activeFieldKey, "custom");
    store.setEditing(false);
  }

  function handleApply() {
    const values = applyMergeDecisions(fields, decisions, customValues);
    onMerge(values, store.fetchedResearch?.relatedAccessions?.jgad ?? []);
    handleOpenChange(false);
  }

  // Arrow key navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!open || editing) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        handlePrev();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className={className} size="lg" disabled={disabled}>
          Merge data from J-DS
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] min-h-[min(85vh,700px)] min-w-[min(95vw,1100px)] flex-col gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-4 border-gray-200 border-b px-4 py-3">
          <DialogTitle className="font-semibold text-base">Merge data from J-DS</DialogTitle>
          {fields.length > 0 && <StatPills fields={fields} decisions={decisions} />}
        </div>

        <DialogDescription className="sr-only">
          Review and merge J-DS research data into this draft field by field.
        </DialogDescription>

        {/* ID input */}
        <div className="flex shrink-0 items-end gap-2 border-gray-100 border-b px-4 py-3">
          <Label className="flex-col items-stretch gap-1">
            <span className="text-xs">J-DS ID</span>
            <div className="flex gap-2">
              <Input
                value={jdsId}
                placeholder="e.g. JDS000001"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleGet();
                  }
                }}
                onChange={(e) => {
                  setJdsId(e.target.value);
                  setError(null);
                }}
                className="h-8 w-48 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="default"
                disabled={isPending}
                onClick={handleGet}
              >
                {isPending ? "Getting…" : "Get"}
              </Button>
            </div>
          </Label>
          {error && <AdminStatusMessage>{error}</AdminStatusMessage>}
        </div>

        {/* Three-panel body */}
        {fields.length > 0 && (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Left panel */}
            <div className="w-fit shrink-0">
              <FieldList
                fields={fields}
                decisions={decisions}
                activeKey={activeFieldKey}
                onSelect={(key) => store.setActiveField(key)}
              />
            </div>

            {/* Center */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {activeField ? (
                <>
                  <FieldHeader
                    field={activeField}
                    currentIndex={actionableIndex}
                    totalActionable={actionable.length}
                    decidedCount={decidedCount}
                    onPrev={handlePrev}
                    onNext={handleNext}
                  />
                  <CompareArea
                    field={activeField}
                    decision={activeDecision}
                    customValue={activeCustomValue}
                    editing={editing}
                    hasNext={actionableIndex < actionable.length - 1}
                    onAccept={handleAccept}
                    onReject={handleReject}
                    onSkip={handleSkip}
                    onUndo={handleUndo}
                    onNext={handleNext}
                    onEditStart={() => store.setEditing(true)}
                    onSaveCustom={handleSaveCustom}
                    onCancelEdit={() => store.setEditing(false)}
                  />
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
                  Select a field from the left panel
                </div>
              )}
            </div>
          </div>
        )}

        {fields.length === 0 && !isPending && store.fetchedResearch === null && (
          <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
            Enter a J-DS ID and click Get to start
          </div>
        )}

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-4 border-gray-200 border-t px-4 py-3">
          <MergeSummary fields={fields} decisions={decisions} />
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" size="lg" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="lg" disabled={!canApply} onClick={handleApply}>
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
