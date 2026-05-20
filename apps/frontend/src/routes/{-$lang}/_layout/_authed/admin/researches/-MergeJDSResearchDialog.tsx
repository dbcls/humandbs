import type { ResearchDetailResponse } from "@humandbs/backend/types";
import type { ResearchTemplateData } from "../../../../../../../../backend/src/api/types/templates";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import {
  $getJDSResearch,
  getDsApplicationsQueryOptions,
} from "@/serverFunctions/researches";
import { AdminStatusMessage } from "../-components/AdminStatusMessage";
import {
  mergeEmptyResearchFields,
  type MergeResearchResult,
} from "./-mergeJDSResearch";
import { getVisiblePages } from "@/components/Pagination";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type ResearchValues = ResearchDetailResponse["data"];

const PAGE_SIZE = 10;

export function MergeJDSResearchDialog({
  currentValues,
  disabled,
  onMerge,
  className,
}: {
  currentValues: ResearchValues | ResearchTemplateData;
  disabled?: boolean;
  onMerge: (
    values: MergeResearchResult["values"],
    relatedAccessions: string[],
  ) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [jdsId, setJdsId] = useState("");
  const [fetchedResearch, setFetchedResearch] =
    useState<ResearchTemplateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const listQuery = useQuery({
    ...getDsApplicationsQueryOptions(page, PAGE_SIZE),
    enabled: open,
  });

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
      setPage(1);
    }
  }

  function handleGet(id?: string) {
    const trimmedId = (id ?? jdsId).trim();
    if (!trimmedId) {
      setError("Enter a J-DS ID.");
      return;
    }
    setJdsId(trimmedId);
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

  const pagination = listQuery.data?.meta.pagination;
  const items = listQuery.data?.data ?? [];

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
      <DialogContent className="sm:w-3xl sm:max-w-3xl">
        <DialogTitle>Merge data from J-DS</DialogTitle>
        <DialogDescription>
          Fetch a J-DS record and fill only empty fields in this research draft.
        </DialogDescription>

        <div className="flex flex-col gap-3">
          <Label className="flex-col items-stretch">
            <span>J-DS ID</span>
            <div className="flex gap-2">
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
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => handleGet()}
              >
                {isPending ? "Getting..." : "Get"}
              </Button>
            </div>
          </Label>
        </div>

        {/* DS applications list */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">J-DS applications</span>
          <div className="overflow-hidden rounded border border-gray-200">
            {listQuery.isPending ? (
              <div className="animate-pulse px-3 py-4 text-xs text-gray-400">
                Loading…
              </div>
            ) : listQuery.isError ? (
              <div className="px-3 py-4 text-xs text-red-500">
                Failed to load applications.
              </div>
            ) : items.length === 0 ? (
              <div className="px-3 py-4 text-xs text-gray-400">
                No applications found.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      JDS ID
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      HUM IDs
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr
                      key={item.jdsId}
                      className="cursor-pointer transition-colors hover:bg-blue-50"
                      onClick={() => handleGet(item.jdsId)}
                    >
                      <td className="px-3 py-2 font-mono">{item.jdsId}</td>
                      <td className="px-3 py-2 font-mono text-gray-500">
                        {item.humIds.length > 0 ? item.humIds.join(", ") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-0.5 pt-1 text-xs">
              <button
                type="button"
                disabled={!pagination.hasPrev}
                onClick={() => setPage((p) => p - 1)}
                className="flex items-center gap-0.5 rounded px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft className="size-3.5" /> Previous
              </button>

              {getVisiblePages(pagination.page, pagination.totalPages).map(
                (p, i) =>
                  p === "ellipsis" ? (
                    <span
                      key={`e-${i}`}
                      className="w-7 text-center text-gray-400"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      className={cn(
                        "w-fit min-w-6 rounded px-0.5 py-1 text-center",
                        p === pagination.page
                          ? "bg-gray-900 font-medium text-white"
                          : "text-gray-600 hover:bg-gray-100",
                      )}
                    >
                      {p}
                    </button>
                  ),
              )}

              <button
                type="button"
                disabled={!pagination.hasNext}
                onClick={() => setPage((p) => p + 1)}
                className="flex items-center gap-0.5 rounded px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                Next <ChevronRight className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        {error ? <AdminStatusMessage>{error}</AdminStatusMessage> : null}

        {fetchedResearch && mergeResult ? (
          <div className="flex flex-col gap-2 rounded border border-gray-200 p-3 text-sm">
            <div>
              <span className="font-semibold">Found:</span>
              <div className="grid grid-cols-[5rem_auto] gap-2">
                <span>JA</span>
                <span>{fetchedResearch?.title?.ja || ""}</span>
                <span>EN</span>
                <span>{fetchedResearch?.title?.en || ""}</span>
              </div>
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
