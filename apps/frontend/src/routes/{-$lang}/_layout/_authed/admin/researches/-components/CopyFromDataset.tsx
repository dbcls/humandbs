import { Check, RotateCcw } from "lucide-react";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { $getDataset } from "@/serverFunctions/datasets";

import type { DatasetTemplateData } from "../../../../../../../../../backend/src/api/types/templates";
import { datasetDocToTemplate } from "./utils/datasetDocToTemplate";

type Status =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done" }
  | { status: "error"; message: string };

interface CopyFromDatasetProps {
  /** Hands the adapted template to the shared apply/overwrite pipeline. */
  onApply: (data: DatasetTemplateData, datasetId: string) => void;
  /**
   * The datasetId currently held in the shared overwrite dialog, if any. Used
   * to reset this control out of its loading state when the dialog is dismissed
   * (mirrors the accession chips' reset effect).
   */
  pendingDatasetId?: string | null;
  /** The id most recently applied through the shared pipeline. */
  lastAppliedId?: string | null;
  /** Bumped when the user edits the form — resets the success indicator. */
  resetKey?: number;
}

export function CopyFromDataset({
  onApply,
  pendingDatasetId,
  lastAppliedId,
  resetKey,
}: CopyFromDatasetProps) {
  const [inputValue, setInputValue] = useState("");
  const [state, setState] = useState<Status>({ status: "idle" });

  // Show the success indicator once an apply through this control lands.
  useEffect(() => {
    if (!lastAppliedId) return;
    if (lastAppliedId === inputValue.trim()) {
      setState({ status: "done" });
    }
    // Only react to lastAppliedId changes — re-running on every keystroke would
    // wrongly flip a freshly-edited input to "done".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAppliedId]);

  // Dialog dismissed → reset a control stuck in loading back to idle.
  useEffect(() => {
    if (pendingDatasetId) return;
    setState((prev) => (prev.status === "loading" ? { status: "idle" } : prev));
  }, [pendingDatasetId]);

  // User edited the form → clear the success indicator (mirrors the chips).
  useEffect(() => {
    if (resetKey === undefined) return;
    setState((prev) => (prev.status === "done" ? { status: "idle" } : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  async function fetchAndApply() {
    const datasetId = inputValue.trim();
    if (!datasetId) {
      setState({ status: "error", message: "Enter a dataset ID." });
      return;
    }
    setState({ status: "loading" });
    try {
      const result = await $getDataset({ data: { datasetId } });
      onApply(datasetDocToTemplate(result.data), datasetId);
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "Failed to fetch dataset.",
      });
    }
  }

  const isLoading = state.status === "loading";

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-foreground-light text-xs">Copy from existing dataset</span>
      <div className="flex items-start gap-1.5">
        <div className="flex flex-1 flex-col gap-0.5">
          <Input
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (state.status !== "loading") setState({ status: "idle" });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!isLoading) fetchAndApply();
              }
            }}
            placeholder="datasetId (e.g. JGAD000001)"
            disabled={isLoading}
            className={cn(
              "font-mono text-xs",
              state.status === "error" && "border-red-400 focus-visible:ring-red-400",
              state.status === "done" && "border-green-400",
            )}
          />
          {state.status === "error" && (
            <span className="text-red-600 text-xs">{state.message}</span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="slim"
          disabled={isLoading}
          onClick={fetchAndApply}
          className="shrink-0 gap-1"
        >
          {isLoading && (
            <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" />
          )}
          {state.status === "done" && <Check className="size-3 text-green-600" />}
          {state.status === "error" && <RotateCcw className="size-3" />}
          {isLoading ? "Applying…" : "Apply"}
        </Button>
      </div>
    </div>
  );
}
