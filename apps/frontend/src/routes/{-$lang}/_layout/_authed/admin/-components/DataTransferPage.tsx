import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Database, Download, RefreshCcw, TriangleAlert, Upload } from "lucide-react";

import { useMemo, useRef, useState } from "react";

import { Card } from "@/components/Card";
import { TextWithIcon } from "@/components/TextWithIcon";
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
import type {
  CmsDataArchiveUploadSummary,
  CmsDataTransferCategory,
} from "@/serverFunctions/cmsDataTransfer";
import {
  $downloadCmsDataArchive,
  $restoreCmsDataArchive,
  $validateCmsDataArchiveUpload,
  CMS_DATA_TRANSFER_CATEGORIES,
  CMS_DATA_TRANSFER_CATEGORY_LABELS,
  MAX_CMS_ARCHIVE_SIZE_BYTES,
} from "@/serverFunctions/cmsDataTransfer";
import useConfirmationStore from "@/stores/confirmationStore";

import { AdminStatusMessage } from "./AdminStatusMessage";

type StatusMessage = {
  variant: "error" | "success" | "warning";
  text: string;
} | null;

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

function sortCategories(categories: readonly CmsDataTransferCategory[]): CmsDataTransferCategory[] {
  return [...categories];
}

export function DataTransferPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { openConfirmation } = useConfirmationStore();
  const queryClient = useQueryClient();

  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [selectedExportCategories, setSelectedExportCategories] = useState<
    CmsDataTransferCategory[]
  >([]);
  const [selectedRestoreCategories, setSelectedRestoreCategories] = useState<
    CmsDataTransferCategory[]
  >([]);
  const [selectedArchiveFile, setSelectedArchiveFile] = useState<File | null>(null);
  const [selectedArchive, setSelectedArchive] = useState<CmsDataArchiveUploadSummary | null>(null);
  const [pageStatus, setPageStatus] = useState<StatusMessage>(null);

  const exportCategories = useMemo(() => sortCategories(CMS_DATA_TRANSFER_CATEGORIES), []);

  const { mutate: validateArchive, isPending: isValidatingArchive } = useMutation({
    mutationFn: $validateCmsDataArchiveUpload,
    onSuccess: (result) => {
      if (!result.ok) {
        setSelectedArchiveFile(null);
        setSelectedArchive(null);
        setSelectedRestoreCategories([]);
        setPageStatus({
          variant: "error",
          text: result.message,
        });
        return;
      }

      setSelectedArchive(result.archive);
      setSelectedRestoreCategories([...result.archive.availableCategories]);
      setPageStatus({ variant: "success", text: result.message });
    },
    onError: (error: Error) => {
      setSelectedArchiveFile(null);
      setSelectedArchive(null);
      setSelectedRestoreCategories([]);
      setPageStatus({
        variant: "error",
        text: error.message || "Failed to validate archive upload.",
      });
    },
  });

  const { mutateAsync: downloadArchive, isPending: isDownloadingArchive } = useMutation({
    mutationFn: $downloadCmsDataArchive,
  });

  const { mutateAsync: restoreArchive, isPending: isRestoringArchive } = useMutation({
    mutationFn: $restoreCmsDataArchive,
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
    setSelectedArchiveFile(null);
    setSelectedArchive(null);
    setSelectedRestoreCategories([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleArchiveUpload(file: File | null) {
    if (!file) return;

    setSelectedArchiveFile(file);
    const formData = new FormData();
    formData.set("archive", file);
    validateArchive({ data: formData });
  }

  async function handleDownloadArchive() {
    if (selectedExportCategories.length === 0) return;

    try {
      const response = await downloadArchive({
        data: {
          categories: selectedExportCategories,
        },
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to generate archive.");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const fileNameMatch = contentDisposition?.match(/filename="([^"]+)"/);
      const fileName = fileNameMatch?.[1] ?? "cms-data-export.tar.gz";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setPageStatus({
        variant: "success",
        text: "Archive download started.",
      });
      setDownloadDialogOpen(false);
    } catch (error) {
      setPageStatus({
        variant: "error",
        text: error instanceof Error ? error.message : "Failed to download archive.",
      });
    }
  }

  function handleConfirmRestore() {
    if (!selectedArchive || !selectedArchiveFile || selectedRestoreCategories.length === 0) {
      return;
    }

    const categoryLabels = selectedRestoreCategories
      .map((category) => CMS_DATA_TRANSFER_CATEGORY_LABELS[category])
      .join(", ");

    openConfirmation({
      title: "Restore CMS data from archive?",
      description: (
        <>
          Restore will permanently replace the selected CMS categories in this environment:{" "}
          {categoryLabels}. This cannot be undone.
        </>
      ),
      actionLabel: "Restore",
      onAction: async () => {
        const formData = new FormData();
        formData.set("archive", selectedArchiveFile);
        for (const category of selectedRestoreCategories) {
          formData.append("category", category);
        }

        const result = await restoreArchive({ data: formData });

        if (!result.ok) {
          setPageStatus({
            variant: "error",
            text: result.message,
          });
          return;
        }

        await queryClient.invalidateQueries();
        const restoredLabels = result.result.restoredCategories
          .map((category) => CMS_DATA_TRANSFER_CATEGORY_LABELS[category])
          .join(", ");

        setPageStatus({
          variant: "success",
          text: `Restore completed for ${result.result.archiveName}. Replaced categories: ${restoredLabels}.`,
        });
        resetUploadState();
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
              <TextWithIcon className="font-semibold" icon={<Download className="size-6" />}>
                Download CMS data
              </TextWithIcon>

              <p className="text-foreground-light text-sm">
                Choose which CMS categories to include in a portable archive. Export downloads a
                compressed `.tar.gz` archive built from the current CMS state.
              </p>
            </div>

            <Button type="button" className="gap-2" onClick={() => setDownloadDialogOpen(true)}>
              <Archive className="size-4" />
              Download CMS data
            </Button>

            <div className="rounded-sm border border-slate-300 border-dashed p-3 text-slate-600 text-sm">
              Supported archive categories:{" "}
              {exportCategories
                .map((category) => CMS_DATA_TRANSFER_CATEGORY_LABELS[category])
                .join(", ")}
            </div>
          </section>

          <section className="space-y-4">
            <div className="space-y-2">
              <TextWithIcon className="font-semibold" icon={<Upload className="size-6" />}>
                Restore data from archive
              </TextWithIcon>

              <p className="text-foreground-light text-sm">
                Upload a `.tar.gz` archive, validate its manifest and payloads, review the included
                categories, and confirm the destructive restore intent.
              </p>
            </div>

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
                disabled={(isValidatingArchive && !selectedArchive) || isRestoringArchive}
              >
                <RefreshCcw className="mr-2 size-4" />
                Reset
              </Button>
            </div>

            <div className="rounded-sm border border-slate-300 border-dashed p-3 text-slate-600 text-sm">
              Current archive upload limit: {formatFileSize(MAX_CMS_ARCHIVE_SIZE_BYTES)}.
            </div>

            {selectedArchive ? (
              <div className="space-y-4 rounded-md border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <Database className="mt-0.5 size-4 shrink-0 text-secondary" />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-slate-800">{selectedArchive.name}</p>
                    <p className="text-slate-600">
                      {formatFileSize(selectedArchive.size)} uploaded for restore validation.
                    </p>
                    <p className="text-slate-600">
                      Created {new Date(selectedArchive.createdAt).toLocaleString()}.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 rounded-sm border border-slate-200 bg-slate-50 p-3 text-slate-700 text-sm md:grid-cols-2">
                  <div>
                    <span className="font-medium">Schema:</span> v{selectedArchive.schemaVersion} (
                    {selectedArchive.archiveFormat})
                  </div>
                  <div>
                    <span className="font-medium">Included categories:</span>{" "}
                    {selectedArchive.categories
                      .map((category) => CMS_DATA_TRANSFER_CATEGORY_LABELS[category])
                      .join(", ")}
                  </div>
                  <div>
                    <span className="font-medium">Archive author:</span>{" "}
                    {selectedArchive.createdBy?.email ?? "Unknown"}
                  </div>
                  <div>
                    <span className="font-medium">Asset files:</span>{" "}
                    {selectedArchive.assetFileCount}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="font-medium text-sm">
                    Categories to replace in this environment
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {selectedArchive.availableCategories.map((category) => {
                      const checkboxId = `restore-${category}`;

                      return (
                        <div key={category} className="rounded-sm border border-slate-200 p-3">
                          <Label htmlFor={checkboxId} className="items-start gap-3">
                            <Checkbox
                              id={checkboxId}
                              checked={selectedRestoreCategories.includes(category)}
                              onCheckedChange={() => toggleRestoreCategory(category)}
                              className="mt-0.5 size-5"
                            />
                            <span className="space-y-1">
                              <span className="block font-medium">
                                {CMS_DATA_TRANSFER_CATEGORY_LABELS[category]}
                              </span>
                              <span className="block text-foreground-light text-xs leading-5">
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
                    disabled={selectedRestoreCategories.length === 0 || isRestoringArchive}
                  >
                    <TriangleAlert className="mr-2 size-4" />
                    Restore data from archive
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        {pageStatus ? (
          <AdminStatusMessage variant={pageStatus.variant} className="mx-1" preserveWhitespace>
            {pageStatus.text}
          </AdminStatusMessage>
        ) : null}
      </Card>

      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Download CMS data</DialogTitle>
            <DialogDescription>
              Select which CMS categories should be included in the archive. The export is delivered
              as a compressed `.tar.gz` archive built from the current CMS state.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            {exportCategories.map((category) => {
              const checkboxId = `export-${category}`;

              return (
                <div key={category} className="rounded-sm border border-slate-200 p-3">
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
                      <span className="block text-foreground-light text-xs leading-5">
                        {CATEGORY_DESCRIPTIONS[category]}
                      </span>
                    </span>
                  </Label>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDownloadDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={selectedExportCategories.length === 0 || isDownloadingArchive}
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
