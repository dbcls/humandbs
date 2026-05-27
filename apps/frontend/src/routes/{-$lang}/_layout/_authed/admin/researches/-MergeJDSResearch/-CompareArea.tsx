import { Trash2 } from "lucide-react";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ArrayItem, EditableCard } from "../-arrayCodecs";
import { arrayCodecs } from "../-arrayCodecs";
import type { FieldDecision, FieldStatus, MergeFieldDescriptor } from "../-computeMergeFields";

// ── Scalar value display ──────────────────────────────────────────────────────

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

// ── Array cards display ───────────────────────────────────────────────────────

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
    return toText(field.currentValue);
  }

  const [text, setText] = useState(getInitial);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); onSave(text); }
  }

  const hasCurrent = Boolean(toText(field.currentValue));
  const hasIncoming = Boolean(toText(field.incomingValue));

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex gap-1">
        {hasIncoming && (
          <button type="button" onClick={() => setText(toText(field.incomingValue))} className="rounded bg-gray-100 px-2 py-0.5 text-gray-700 text-xs hover:bg-gray-200">
            From J-DS
          </button>
        )}
        {hasCurrent && (
          <button type="button" onClick={() => setText(toText(field.currentValue))} className="rounded bg-gray-100 px-2 py-0.5 text-gray-700 text-xs hover:bg-gray-200">
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
        <Button size="default" type="button" onClick={() => onSave(text)}>Save</Button>
        <Button size="default" type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
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

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-3">
        {cards.map((card, i) => (
          <div key={i} className="rounded border border-gray-300 bg-white">
            <div className="flex items-center gap-2 border-gray-400 border-b bg-gray-300 px-3 py-2">
              <span className="flex-1 font-medium text-sm">
                #{i + 1} {codec.title(card.fields)}
              </span>
              <button type="button" onClick={() => removeCard(i)} className="text-gray-400 hover:text-red-500">
                <Trash2 className="size-4" />
              </button>
            </div>
            <codec.EditBody
              card={card}
              onChange={(key, val) => setCard(i, { ...card, fields: { ...card.fields, [key]: val } })}
              onChangeCard={(updated) => setCard(i, updated)}
            />
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="dashed"
        onClick={() => setCards((prev) => [...prev, codec.blank()])}
      >
        + Add
      </Button>
      <div className="flex items-center gap-2">
        <Button size="default" type="button" onClick={() => onSave(cards.map((c) => codec!.toItem(c)))}>Save</Button>
        <Button size="default" type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Compare area ──────────────────────────────────────────────────────────────

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

export function CompareArea({
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

  const resultValue =
    customValue !== undefined ? customValue
    : decision === "accepted" ? field.incomingValue
    : field.currentValue;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="grid grid-cols-2">
        {/* Current value */}
        <div
          role={isActionable ? "button" : undefined}
          tabIndex={isActionable ? 0 : undefined}
          onClick={isActionable ? onReject : undefined}
          onKeyDown={isActionable ? (e) => (e.key === "Enter" || e.key === " ") && onReject() : undefined}
          className={cn(
            "group flex flex-col gap-2 border-gray-200 border-r border-b p-4",
            isActionable && "cursor-pointer transition-colors hover:bg-blue-50",
            decision === "rejected" && "bg-blue-50",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="font-semibold text-gray-500 text-xs">Current value</div>
            {isActionable && (
              <span className={cn(
                "rounded-full px-2 py-0.5 font-medium text-[10px] opacity-0 transition-opacity group-hover:opacity-100",
                decision === "rejected" && "opacity-100",
                "bg-blue-100 text-blue-700",
              )}>
                {field.status === "conflict" ? "Use this" : "Leave empty"}
              </span>
            )}
          </div>
          {isScalar
            ? <ScalarValue value={field.currentValue} placeholder="(empty)" />
            : <ArrayCards items={(field.currentValue as ArrayItem[]) ?? []} dataType={field.dataType} />
          }
        </div>

        {/* Value from J-DS */}
        <div
          role={isActionable ? "button" : undefined}
          tabIndex={isActionable ? 0 : undefined}
          onClick={isActionable ? onAccept : undefined}
          onKeyDown={isActionable ? (e) => (e.key === "Enter" || e.key === " ") && onAccept() : undefined}
          className={cn(
            "group flex flex-col gap-2 border-gray-200 border-b p-4",
            isActionable && "cursor-pointer transition-colors hover:bg-pink-50",
            decision === "accepted" && "bg-pink-50",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="font-semibold text-gray-500 text-xs">Value from J-DS</div>
            {isActionable && (
              <span className={cn(
                "rounded-full px-2 py-0.5 font-medium text-[10px] opacity-0 transition-opacity group-hover:opacity-100",
                decision === "accepted" && "opacity-100",
                "bg-pink-100 text-pink-700",
              )}>
                Use this
              </span>
            )}
          </div>
          {isScalar
            ? <ScalarValue value={field.incomingValue} placeholder="(none)" />
            : <ArrayCards items={(field.incomingValue as ArrayItem[]) ?? []} dataType={field.dataType} />
          }
        </div>
      </div>

      {/* New value */}
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-gray-700 text-xs">New value</div>
            <span className={cn("rounded-full px-2 py-0.5 font-medium text-[10px]", decisionBadgeClass(decision))}>
              {decisionLabel(decision, field.status)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {isActionable && !editing && !isDecided && (
              <button type="button" onClick={onSkip} className="text-gray-400 text-xs hover:text-gray-600">
                Skip for now
              </button>
            )}
            {isDecided && !editing && (
              <button type="button" onClick={onUndo} className="text-[10px] text-blue-600 hover:underline">
                Undo
              </button>
            )}
            {isDecided && !editing && hasNext && (
              <Button type="button" size="default" variant="accent" onClick={onNext}>Next →</Button>
            )}
          </div>
        </div>

        {editing ? (
          isScalar ? (
            <InlineScalarEditor
              field={field}
              decision={decision}
              customValue={customValue}
              onSave={(val) => {
                if (field.incomingValue != null && typeof field.incomingValue === "object" && "text" in field.incomingValue) {
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
            className={cn("flex flex-col gap-1", isEditable && "group cursor-pointer", !isEditable && "opacity-50")}
            onClick={() => isEditable && onEditStart()}
          >
            {isScalar
              ? <ScalarValue value={resultValue} placeholder="(empty)" />
              : <ArrayCards items={(resultValue as ArrayItem[]) ?? []} dataType={field.dataType} />
            }
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
