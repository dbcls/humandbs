import { useMutation } from "@tanstack/react-query";
import {
  Archive,
  Database,
  Download,
  RefreshCcw,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  CMS_DATA_TRANSFER_CATEGORIES,
  CMS_DATA_TRANSFER_CATEGORY_LABELS,
  MAX_CMS_ARCHIVE_SIZE_BYTES,
  $validateCmsDataArchiveUpload,
  type CmsDataArchiveUploadSummary,
  type CmsDataTransferCategory,
} from "@/serverFunctions/cmsDataTransfer";
import useConfirmationStore from "@/stores/confirmationStore";

import { AdminStatusMessage } from "./AdminStatusMessage";

type StatusMessage =
  | { variant: "error" | "success" | "warning"; text: string }
  | null;

const CATEGORY_DESCRIPTIONS: Record<CmsDataTransferCategory, string> = {
  content: "Static CMS page records and translations.",
  documents: "Document records plus versioned localized content.",
  news: "News items, translations, and related structure.",
  alerts: "Alert state, schedule windows, and translations.",
  assets: "Managed public files under the CMS asset directory.",
  "header-footer": "Active site navigation configuration.",
  flowcharts: "Navigation flowchart definitions and active state.",
};

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function sortCategories(
  categories: readonly CmsDataTransferCategory[],
): CmsDataTransferCategory[] {
  return [...categories];
}

export function DataTransferPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { openConfirmation } = useConfirmationStore();

  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [selectedExportCategories, setSelectedExportCategories] = useState<
    CmsDataTransferCategory[]
  >([]);
  const [selectedRestoreCategories, setSelectedRestoreCategories] = useState<
    CmsDataTransferCategory[]
  >([]);
  const [selectedArchive, setSelectedArchive] =
    useState<CmsDataArchiveUploadSummary | null>(null);
  const [pageStatus, setPageStatus] = useState<StatusMessage>(null);

  const exportCategories = useMemo(
    () => sortCategories(CMS_DATA_TRANSFER_CATEGORIES),
    [],
  );

  const { mutate: validateArchive, isPending: isValidatingArchive } =
    useMutation({
      mutationFn: $validateCmsDataArchiveUpload,
      onSuccess: (result) => {
        if (!result.ok) {
          setSelectedArchive(null);
          setSelectedRestoreCategories([]);
          setPageStatus({
            variant: "error",
            text: result.message,
          });
          return;
        }

        setSelectedArchive(result.archive);
        setSelectedRestoreCategories([...CMS_DATA_TRANSFER_CATEGORIES]);
        setPageStatus({
          variant: "warning",
          text: result.message,
        });
      },
      onError: (error: Error) => {
        setSelectedArchive(null);
        setSelectedRestoreCategories([]);
        setPageStatus({
          variant: "error",
          text: error.message || "Failed to validate archive upload.",
        });
      },
    });

  function toggleExportCategory(category: CmsDataTransferCategory) {
    setSelectedExportCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  }

  function toggleRestoreCategory(category: CmsDataTransferCategory) {
    setSelectedRestoreCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  }

  function resetUploadState() {
    setSelectedArchive(null);
    setSelectedRestoreCategories([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleArchiveUpload(file: File | null) {
    if (!file) return;

    const formData = new FormData();
    formData.set("archive", file);
    validateArchive({ data: formData });
  }

  function handleDownloadArchive() {
    if (selectedExportCategories.length === 0) return;

    const params = new URLSearchParams();
    for (const category of selectedExportCategories) {
      params.append("category", category);
    }

    const downloadUrl = `/admin/data-transfer-download?${params.toString()}`;
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.click();

    setPageStatus({
      variant: "success",
      text: "Archive download started.",
    });
    setDownloadDialogOpen(false);
  }

  function handleConfirmRestore() {
    if (!selectedArchive || selectedRestoreCategories.length === 0) return;

    const categoryLabels = selectedRestoreCategories
      .map((category) => CMS_DATA_TRANSFER_CATEGORY_LABELS[category])
      .join(", ");

    openConfirmation({
      title: "Restore CMS data from archive?",
      description: (
        <>
          Restore will permanently replace the selected CMS categories in this
          environment: {categoryLabels}. This confirmation flow is wired now;
          destructive restore will be implemented in the next slice.
        </>
      ),
      actionLabel: "Acknowledge",
      onAction: () => {
        setPageStatus({
          variant: "warning",
          text: `Restore confirmation captured for ${selectedArchive.name}. Archive application is not implemented yet.`,
        });
      },
    });
  }

  return (
    <>
      <Card
        className="flex h-full flex-1 flex-col"
        containerClassName="flex-1 flex flex-col gap-6"
        caption="Data Transfer"
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <section className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-base font-semibold">
                <Download className="size-4 text-secondary" />
                Download CMS data
              </div>
              <p className="text-foreground-light text-sm">
                Choose which CMS categories to include in a portable archive.
                Export downloads a compressed `.tar.gz` archive built from the
                current CMS state.
              </p>
            </div>

            <Card
              className="border border-slate-200 p-5"
              caption="Export"
              captionSize="sm"
            >
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Categories are selected in a dedicated dialog before archive
                  generation starts.
                </p>

                <Button
                  type="button"
                  className="gap-2"
                  onClick={() => setDownloadDialogOpen(true)}
                >
                  <Archive className="size-4" />
                  Download CMS data
                </Button>

                <div className="rounded-sm border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  Supported archive categories:{" "}
                  {exportCategories
                    .map((category) => CMS_DATA_TRANSFER_CATEGORY_LABELS[category])
                    .join(", ")}
                </div>
              </div>
            </Card>
          </section>

          <section className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-base font-semibold">
                <Upload className="size-4 text-secondary" />
                Restore data from archive
              </div>
              <p className="text-foreground-light text-sm">
                Upload a `.tar.gz` archive, run transport-level checks, review
                the selected categories, and confirm the destructive restore
                intent.
              </p>
            </div>

            <Card
              className="border border-slate-200 p-5"
              caption="Restore"
              captionSize="sm"
            >
              <div className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".tar,.tgz,.tar.gz,application/gzip,application/x-gzip,application/x-tar"
                    className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-2"
                    onChange={(event) => {
                      handleArchiveUpload(event.target.files?.[0] ?? null);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetUploadState}
                    disabled={isValidatingArchive && !selectedArchive}
                  >
                    <RefreshCcw className="mr-2 size-4" />
                    Reset
                  </Button>
                </div>

                <div className="rounded-sm border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  Current archive upload limit:{" "}
                  {formatFileSize(MAX_CMS_ARCHIVE_SIZE_BYTES)}.
                </div>

                {selectedArchive ? (
                  <div className="space-y-4 rounded-md border border-slate-200 p-4">
                    <div className="flex items-start gap-3">
                      <Database className="mt-0.5 size-4 shrink-0 text-secondary" />
                      <div className="space-y-1 text-sm">
                        <p className="font-medium text-slate-800">
                          {selectedArchive.name}
                        </p>
                        <p className="text-slate-600">
                          {formatFileSize(selectedArchive.size)} uploaded for
                          restore validation.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-sm border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      Archive content introspection is not wired yet. Category
                      availability below is UI scaffolding for the destructive
                      restore flow.
                    </div>

                    <div className="space-y-3">
                      <div className="text-sm font-medium">
                        Categories to replace in this environment
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {exportCategories.map((category) => {
                          const checkboxId = `restore-${category}`;

                          return (
                            <div
                              key={category}
                              className="rounded-sm border border-slate-200 p-3"
                            >
                              <Label
                                htmlFor={checkboxId}
                                className="items-start gap-3"
                              >
                                <Checkbox
                                  id={checkboxId}
                                  checked={selectedRestoreCategories.includes(
                                    category,
                                  )}
                                  onCheckedChange={() =>
                                    toggleRestoreCategory(category)
                                  }
                                  className="mt-0.5 size-5"
                                />
                                <span className="space-y-1">
                                  <span className="block font-medium">
                                    {CMS_DATA_TRANSFER_CATEGORY_LABELS[category]}
                                  </span>
                                  <span className="text-foreground-light block text-xs leading-5">
                                    {CATEGORY_DESCRIPTIONS[category]}
                                  </span>
                                </span>
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={handleConfirmRestore}
                        disabled={selectedRestoreCategories.length === 0}
                      >
                        <TriangleAlert className="mr-2 size-4" />
                        Restore data from archive
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          </section>
        </div>

        {pageStatus ? (
          <AdminStatusMessage
            variant={pageStatus.variant}
            className="mx-1"
            preserveWhitespace
          >
            {pageStatus.text}
          </AdminStatusMessage>
        ) : null}
      </Card>

      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Download CMS data</DialogTitle>
            <DialogDescription>
              Select which CMS categories should be included in the archive.
              The export is delivered as a compressed `.tar.gz` archive built
              from the current CMS state.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            {exportCategories.map((category) => {
              const checkboxId = `export-${category}`;

              return (
                <div
                  key={category}
                  className="rounded-sm border border-slate-200 p-3"
                >
                  <Label htmlFor={checkboxId} className="items-start gap-3">
                    <Checkbox
                      id={checkboxId}
                      checked={selectedExportCategories.includes(category)}
                      onCheckedChange={() => toggleExportCategory(category)}
                      className="mt-0.5 size-5"
                    />
                    <span className="space-y-1">
                      <span className="block font-medium">
                        {CMS_DATA_TRANSFER_CATEGORY_LABELS[category]}
                      </span>
                      <span className="text-foreground-light block text-xs leading-5">
                        {CATEGORY_DESCRIPTIONS[category]}
                      </span>
                    </span>
                  </Label>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDownloadDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={selectedExportCategories.length === 0}
              onClick={handleDownloadArchive}
            >
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
