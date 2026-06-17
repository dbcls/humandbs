import { useMutation } from "@tanstack/react-query";

import { useEffect, useState } from "react";

import type { ResearchDetailResponse } from "@humandbs/backend/types";

import { LoadingSpinner } from "@/components/LoadingSpinner";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { $getJDSResearch, $getResearchForMerge } from "@/serverFunctions/researches";
import useMergeWizardStore from "@/stores/mergeWizardStore";

import type { ResearchTemplateData } from "../../../../../../../../../../backend/src/api/types/templates";
import { AdminStatusMessage } from "../../../-components/AdminStatusMessage";
import { applyMergeDecisions } from "../utils/applyMergeDecisions";
import type { FieldDecision } from "../utils/computeMergeFields";
import { computeMergeFields } from "../utils/computeMergeFields";
import { researchDetailToTemplate } from "../utils/researchDetailToTemplate";
import type { MergeResearchResult } from "../utils/researchValues";
import { CompareArea } from "./CompareArea";
import { FieldHeader } from "./FieldHeader";
import { FieldList, StatPills } from "./FieldList";
import { MergeSummary } from "./MergeSummary";

type ResearchValues = ResearchDetailResponse["data"];

type MergeSource = "jds" | "research";

const MERGE_COPY: Record<
  MergeSource,
  { label: string; placeholder: string; emptyState: string; notFound: string; fallback: string }
> = {
  jds: {
    label: "J-DS ID",
    placeholder: "J-DS000001",
    emptyState: "Enter a J-DS ID and click Get to start",
    notFound: "No J-DS research found with this ID.",
    fallback: "Failed to get J-DS research.",
  },
  research: {
    label: "Research ID (humId)",
    placeholder: "hum0001",
    emptyState: "Enter a humId and click Get to start",
    notFound: "No research found with this humId.",
    fallback: "Failed to get research.",
  },
};

/**
 * Merge research data from a selectable source: J-DS or an existing research by
 * humId. Both sources flow through the same source-agnostic merge wizard.
 */
export function MergeResearchDialog({
  currentValues,
  currentHumId,
  disabled,
  onMerge,
  className,
}: {
  currentValues: ResearchValues | ResearchTemplateData;
  /** When set (edit screen), merging this humId into itself is blocked in research mode. */
  currentHumId?: string;
  disabled?: boolean;
  onMerge: (values: MergeResearchResult["values"], relatedAccessions: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<MergeSource>("jds");
  // Per-mode raw input survives mode toggles.
  const [inputs, setInputs] = useState<Record<MergeSource, string>>({ jds: "", research: "" });
  const [error, setError] = useState<string | null>(null);

  const store = useMergeWizardStore();

  const currentInput = inputs[mode];
  const copy = MERGE_COPY[mode];

  function loadFields(incoming: ResearchTemplateData) {
    const fields = computeMergeFields(currentValues, incoming);
    store.setFetchedResearch(incoming, fields);
    setError(null);
    const firstActionable = fields.find((f) => f.status !== "same");
    if (firstActionable) store.setActiveField(firstActionable.key);
  }

  const { mutate: getJDSResearch, isPending: isJdsPending } = useMutation({
    mutationFn: (id: string) => $getJDSResearch({ data: { id } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.code === "NOT_FOUND" ? MERGE_COPY.jds.notFound : result.error);
        return;
      }
      loadFields(result.data);
    },
    onError: (err: Error) => {
      setError(err.message || MERGE_COPY.jds.fallback);
    },
  });

  const { mutate: getResearch, isPending: isResearchPending } = useMutation({
    mutationFn: (humId: string) => $getResearchForMerge({ data: { humId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.code === "NOT_FOUND" ? MERGE_COPY.research.notFound : result.error);
        return;
      }
      loadFields(researchDetailToTemplate(result.data));
    },
    onError: (err: Error) => {
      setError(err.message || MERGE_COPY.research.fallback);
    },
  });

  const isPending = mode === "jds" ? isJdsPending : isResearchPending;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setMode("jds");
      setInputs({ jds: "", research: "" });
      setError(null);
      store.reset();
    }
  }

  function handleModeChange(next: MergeSource) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    // Clear fetched fields and pending decisions; the typed identifiers are kept.
    store.reset();
  }

  function handleInputChange(value: string) {
    setInputs((prev) => ({ ...prev, [mode]: value }));
    setError(null);
  }

  function handleGet() {
    const trimmedId = currentInput.trim();
    if (!trimmedId) {
      setError(`Enter a ${copy.label}.`);
      return;
    }
    if (mode === "research") {
      if (currentHumId && trimmedId === currentHumId) {
        setError("Cannot merge a research with itself.");
        return;
      }
      getResearch(trimmedId);
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

  const overwritten = fields.filter((f) => {
    const d = decisions[f.key] ?? "pending";
    return d === "accepted" || d === "custom";
  });
  const canApply = overwritten.length > 0;

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
    // Datasets are out of scope for research-source merges, so they never carry
    // related accessions; the J-DS source supplies them from the fetched template.
    const relatedAccessions =
      mode === "research" ? [] : (store.fetchedResearch?.relatedAccessions?.jgad ?? []);
    onMerge(values, relatedAccessions);
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
          Merge data
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] min-h-[min(85vh,700px)] min-w-[min(95vw,1100px)] flex-col gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-4 border-gray-200 border-b px-4 py-3">
          <DialogTitle className="font-semibold text-base">Merge data</DialogTitle>
          {fields.length > 0 && <StatPills fields={fields} decisions={decisions} />}
        </div>

        <DialogDescription className="sr-only">
          Review and merge research data into this draft field by field.
        </DialogDescription>

        {/* Source toggle + ID input */}
        <div className="flex shrink-0 items-end gap-4 border-gray-100 border-b px-4 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs">Source</span>
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(value: MergeSource) => {
                if (value) handleModeChange(value);
              }}
            >
              <ToggleGroupItem value="jds">J-DS</ToggleGroupItem>
              <ToggleGroupItem value="research">Existing research</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <Label className="flex-col items-stretch gap-1">
            <span className="text-xs">{copy.label}</span>
            <div className="flex items-center gap-2">
              <Input
                value={currentInput}
                placeholder={copy.placeholder}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleGet();
                  }
                }}
                onChange={(e) => handleInputChange(e.target.value)}
                className="block w-48 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="default"
                disabled={isPending}
                onClick={handleGet}
              >
                {isPending ? <LoadingSpinner variant={"outline"} /> : "Get"}
              </Button>
            </div>
          </Label>
          {error && <AdminStatusMessage>{error}</AdminStatusMessage>}
        </div>

        {/* Three-panel body */}
        {fields.length > 0 && (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="w-fit shrink-0">
              <FieldList
                fields={fields}
                decisions={decisions}
                activeKey={activeFieldKey}
                onSelect={(key) => store.setActiveField(key)}
              />
            </div>
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
                    onSkip={handleNext}
                    onUndo={() => {
                      if (!activeFieldKey) return;
                      store.clearCustomValue(activeFieldKey);
                      store.setDecision(activeFieldKey, "pending");
                    }}
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
            {copy.emptyState}
          </div>
        )}

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-4 border-gray-200 border-t px-4 py-3">
          <MergeSummary overwritten={overwritten} />
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
