import { $getDatasetTemplate } from "@/serverFunctions/researches";
import type { DatasetTemplateData } from "../../../../../../../../backend/src/api/types/templates";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Check, X, RotateCcw } from "lucide-react";

const ACCESSION_REGEX = /^(JGAD|DRA)\d+$/;

type ChipState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done" }
  | { status: "error"; message: string };

interface AccessionChipsProps {
  accessions: string[];
  onAccessionsChange: (accessions: string[]) => void;
  onApply: (data: DatasetTemplateData) => void;
}

export function AccessionChips({
  accessions,
  onAccessionsChange,
  onApply,
}: AccessionChipsProps) {
  const [chipStates, setChipStates] = useState<Record<string, ChipState>>({});
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  function setChipState(accession: string, state: ChipState) {
    setChipStates((prev) => ({ ...prev, [accession]: state }));
  }

  async function fetchAndApply(accession: string) {
    setChipState(accession, { status: "loading" });
    try {
      const result = await $getDatasetTemplate({ data: { externalId: accession } });
      if (!result.ok) {
        setChipState(accession, { status: "error", message: result.error });
        return;
      }
      onApply(result.data);
      setChipState(accession, { status: "done" });
    } catch (e) {
      setChipState(accession, {
        status: "error",
        message: e instanceof Error ? e.message : "Failed to fetch template.",
      });
    }
  }

  function addAccession(raw: string) {
    const trimmed = raw.trim().toUpperCase();
    if (!ACCESSION_REGEX.test(trimmed)) {
      setInputError("Must start with JGAD or DRA followed by digits.");
      return;
    }
    if (accessions.includes(trimmed)) {
      setInputError("Already in list.");
      return;
    }
    setInputError(null);
    onAccessionsChange([...accessions, trimmed]);
    setInputValue("");
  }

  function removeAccession(accession: string) {
    onAccessionsChange(accessions.filter((a) => a !== accession));
    setChipStates((prev) => {
      const next = { ...prev };
      delete next[accession];
      return next;
    });
  }

  if (accessions.length === 0 && !inputValue) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-foreground-light text-xs">Related accessions</span>
        <AccessionInput
          value={inputValue}
          error={inputError}
          onChange={(v) => { setInputValue(v); setInputError(null); }}
          onAdd={addAccession}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-foreground-light text-xs">Related accessions — click to apply dataset template</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {accessions.map((accession) => {
          const state = chipStates[accession] ?? { status: "idle" };
          return (
            <AccessionChip
              key={accession}
              accession={accession}
              state={state}
              onClick={() => fetchAndApply(accession)}
              onRemove={() => removeAccession(accession)}
            />
          );
        })}
        <AccessionInput
          value={inputValue}
          error={inputError}
          onChange={(v) => { setInputValue(v); setInputError(null); }}
          onAdd={addAccession}
          compact
        />
      </div>
    </div>
  );
}

function AccessionChip({
  accession,
  state,
  onClick,
  onRemove,
}: {
  accession: string;
  state: ChipState;
  onClick: () => void;
  onRemove: () => void;
}) {
  const isLoading = state.status === "loading";

  return (
    <div className="flex flex-col items-start gap-0.5">
      <div
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-mono transition-colors",
          state.status === "idle" && "cursor-pointer border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50",
          state.status === "loading" && "cursor-wait border-gray-200 bg-gray-50 opacity-70",
          state.status === "done" && "cursor-pointer border-green-300 bg-green-50 text-green-800",
          state.status === "error" && "cursor-pointer border-red-300 bg-red-50 text-red-800",
        )}
        onClick={isLoading ? undefined : onClick}
        role="button"
        tabIndex={isLoading ? -1 : 0}
        onKeyDown={(e) => { if (!isLoading && e.key === "Enter") onClick(); }}
      >
        {state.status === "loading" && (
          <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" />
        )}
        {state.status === "done" && <Check className="size-3" />}
        {state.status === "error" && <RotateCcw className="size-3" />}
        {accession}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 text-current opacity-50 hover:opacity-100"
          tabIndex={-1}
        >
          <X className="size-3" />
        </button>
      </div>
      {state.status === "error" && (
        <span className="px-1 text-xs text-red-600">{state.message}</span>
      )}
    </div>
  );
}

function AccessionInput({
  value,
  error,
  onChange,
  onAdd,
  compact = false,
}: {
  value: string;
  error: string | null;
  onChange: (v: string) => void;
  onAdd: (v: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", compact ? "min-w-[140px]" : "")}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (value.trim()) onAdd(value);
          }
        }}
        onBlur={() => { if (value.trim()) onAdd(value); }}
        placeholder="JGAD… or DRA…"
        className={cn(
          "h-7 text-xs font-mono",
          compact ? "border-0 shadow-none focus-visible:ring-0 bg-transparent p-0" : "",
        )}
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
