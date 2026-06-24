import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "use-intl";

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
import { $getJDSResearch } from "@/serverFunctions/researches";
import useMergeWizardStore from "@/stores/mergeWizardStore";

import type { ResearchTemplateData } from "../../../../../../../../../../backend/src/api/types/templates";
import { AdminStatusMessage } from "../../../-components/AdminStatusMessage";
import { applyMergeDecisions } from "../utils/applyMergeDecisions";
import type { FieldDecision } from "../utils/computeMergeFields";
import { computeMergeFields } from "../utils/computeMergeFields";
import type { MergeResearchResult } from "../utils/researchValues";
import { CompareArea } from "./CompareArea";
import { FieldHeader } from "./FieldHeader";
import { FieldList, StatPills } from "./FieldList";
import { MergeSummary } from "./MergeSummary";

type ResearchValues = ResearchDetailResponse["data"];

/**
 * Merge research data fetched from J-DS into the current draft field by field.
 */
export function MergeResearchDialog({
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
  const t = useTranslations("MergeWizard");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const store = useMergeWizardStore();

  function loadFields(incoming: ResearchTemplateData) {
    const fields = computeMergeFields(currentValues, incoming);
    store.setFetchedResearch(incoming, fields);
    setError(null);
    const firstActionable = fields.find((f) => f.status !== "same");
    if (firstActionable) store.setActiveField(firstActionable.key);
  }

  const { mutate: getJDSResearch, isPending } = useMutation({
    mutationFn: (id: string) => $getJDSResearch({ data: { id } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.code === "NOT_FOUND" ? t("not-found") : result.error);
        return;
      }
      loadFields(result.data);
    },
    onError: (err: Error) => {
      setError(err.message || t("fetch-failed"));
    },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setInput("");
      setError(null);
      store.reset();
    }
  }

  function handleInputChange(value: string) {
    setInput(value);
    setError(null);
  }

  function handleGet() {
    const trimmedId = input.trim();
    if (!trimmedId) {
      setError(t("enter-id"));
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
    const relatedAccessions = store.fetchedResearch?.relatedAccessions?.jgad ?? [];
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
          {t("merge-data")}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] min-h-[min(85vh,700px)] min-w-[min(95vw,1100px)] flex-col gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-4 border-gray-200 border-b px-4 py-3">
          <DialogTitle className="font-semibold text-base">{t("merge-data")}</DialogTitle>
          {fields.length > 0 && <StatPills fields={fields} decisions={decisions} />}
        </div>

        <DialogDescription className="sr-only">{t("merge-data-description")}</DialogDescription>

        {/* J-DS ID input */}
        <div className="flex shrink-0 items-end gap-4 border-gray-100 border-b px-4 py-3">
          <Label className="flex-col items-stretch gap-1">
            <span className="text-xs">{t("jds-id-label")}</span>
            <div className="flex items-center gap-2">
              <Input
                value={input}
                placeholder={t("jds-id-placeholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleGet();
                  }
                }}
                onChange={(e) => handleInputChange(e.target.value)}
                className="block w-96 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="default"
                disabled={isPending}
                onClick={handleGet}
              >
                {isPending ? <LoadingSpinner variant={"outline"} /> : t("get")}
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
                  {t("select-field")}
                </div>
              )}
            </div>
          </div>
        )}

        {fields.length === 0 && !isPending && store.fetchedResearch === null && (
          <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
            {t("empty-state")}
          </div>
        )}

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-4 border-gray-200 border-t px-4 py-3">
          <MergeSummary overwritten={overwritten} />
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" size="lg" onClick={() => handleOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="button" size="lg" disabled={!canApply} onClick={handleApply}>
              {t("apply")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
