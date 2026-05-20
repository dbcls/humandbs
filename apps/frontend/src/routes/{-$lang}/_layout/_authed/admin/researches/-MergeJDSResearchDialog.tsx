import type { ResearchDetailResponse } from "@humandbs/backend/types";
import type { ResearchTemplateData } from "../../../../../../../../backend/src/api/types/templates";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { $getJDSResearch } from "@/serverFunctions/researches";
import { AdminStatusMessage } from "../-components/AdminStatusMessage";
import {
  mergeEmptyResearchFields,
  type MergeResearchResult,
} from "./-mergeJDSResearch";

type ResearchValues = ResearchDetailResponse["data"];

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
  const [fetchedResearch, setFetchedResearch] =
    useState<ResearchTemplateData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { mutate: getJDSResearch, isPending } = useMutation({
    mutationFn: (id: string) => $getJDSResearch({ data: { id } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setFetchedResearch(null);
        setError(result.error);
        return;
      }

      setFetchedResearch(result.data);
      setError(null);
    },
    onError: (err: Error) => {
      setFetchedResearch(null);
      setError(err.message || "Failed to get J-DS research.");
    },
  });

  const mergeResult = fetchedResearch
    ? mergeEmptyResearchFields(currentValues, fetchedResearch)
    : null;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setJdsId("");
      setFetchedResearch(null);
      setError(null);
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

  function handleMerge() {
    if (!mergeResult || mergeResult.changedFields.length === 0) return;
    onMerge(mergeResult.values, fetchedResearch?.relatedAccessions?.jgad ?? []);
    handleOpenChange(false);
  }

  const displayTitle =
    fetchedResearch?.title?.en || fetchedResearch?.title?.ja || "Untitled";
  const warnings = fetchedResearch?.warnings ?? [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={className}
          size="lg"
          disabled={disabled}
        >
          Merge data from J-DS
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Merge data from J-DS</DialogTitle>
        <DialogDescription>
          Fetch a J-DS record and fill only empty fields in this research draft.
        </DialogDescription>

        <div className="flex flex-col gap-3">
          <Label className="flex-col items-stretch">
            <span>J-DS ID</span>
            <Input
              value={jdsId}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleGet();
                }
              }}
              onChange={(e) => {
                setJdsId(e.target.value);
                setFetchedResearch(null);
                setError(null);
              }}
            />
          </Label>
          <Button
            type="button"
            variant="outline"
            className="self-end"
            disabled={isPending}
            onClick={handleGet}
          >
            {isPending ? "Getting..." : "Get"}
          </Button>
        </div>

        {error ? <AdminStatusMessage>{error}</AdminStatusMessage> : null}

        {fetchedResearch && mergeResult ? (
          <div className="flex flex-col gap-2 rounded border border-gray-200 p-3 text-sm">
            <div>
              <span className="font-semibold">Found:</span> {displayTitle}
            </div>
            <div className="text-foreground-light">
              {mergeResult.changedFields.length > 0
                ? `${mergeResult.changedFields.length} field group(s) can be filled.`
                : "No empty fields can be filled from this J-DS record."}
            </div>
            {warnings.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-1">
                {warnings.map((w, i) => (
                  <li key={i} className="text-warning text-xs">
                    {w}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          {fetchedResearch && mergeResult ? (
            <Button
              type="button"
              onClick={handleMerge}
              disabled={mergeResult.changedFields.length === 0}
            >
              Merge data
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
