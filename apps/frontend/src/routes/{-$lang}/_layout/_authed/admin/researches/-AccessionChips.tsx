import { $getDatasetTemplate } from "@/serverFunctions/researches";
import type { DatasetTemplateData } from "../../../../../../../../backend/src/api/types/templates";
import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
      setInputError("Must be JGAD or DRA followed by digits.");
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

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-foreground-light text-xs">
        Related accessions{accessions.length > 0 ? " — click to apply dataset template" : ""}
      </span>
      <div className="focus-within:ring-ring flex flex-wrap items-start gap-1.5 rounded border border-gray-200 bg-white px-2 py-1.5 focus-within:ring-1">
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
        <div className="flex min-w-[140px] flex-1 flex-col gap-0.5">
          <Input
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); setInputError(null); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (inputValue.trim()) addAccession(inputValue);
              }
            }}
            onBlur={() => { if (inputValue.trim()) addAccession(inputValue); }}
            placeholder="JGAD… or DRA…"
            className="h-6 border-0 p-0 font-mono text-xs shadow-none focus-visible:ring-0"
          />
          {inputError && (
            <span className="text-xs text-red-600">{inputError}</span>
          )}
        </div>
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
      <Badge
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 font-mono text-xs font-normal transition-colors",
          state.status === "idle" && "border-gray-300 bg-gray-100 text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-800",
          state.status === "loading" && "cursor-wait border-gray-200 bg-gray-100 text-gray-500 opacity-70",
          state.status === "done" && "border-green-300 bg-green-100 text-green-800",
          state.status === "error" && "border-red-300 bg-red-100 text-red-800",
        )}
        onClick={isLoading ? undefined : onClick}
        role="button"
        tabIndex={isLoading ? -1 : 0}
        onKeyDown={(e: React.KeyboardEvent) => { if (!isLoading && e.key === "Enter") onClick(); }}
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
          className="ml-0.5 opacity-50 hover:opacity-100"
          tabIndex={-1}
        >
          <X className="size-3" />
        </button>
      </Badge>
      {state.status === "error" && (
        <span className="px-1 text-xs text-red-600">{state.message}</span>
      )}
    </div>
  );
}
