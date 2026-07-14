import { Copy } from "lucide-react";
import { useTranslations } from "use-intl";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { DatasetTemplateData } from "../../../../../../../../../backend/src/api/types/templates";
import { AccessionChips } from "./AccessionChips";
import { CopyFromDataset } from "./CopyFromDataset";

interface CopyDataDialogProps {
  accessions: string[];
  onAccessionsChange: (accessions: string[]) => void;
  onApply: (data: DatasetTemplateData, accession: string) => void;
  lastAppliedId?: string | null;
  pendingTemplateId?: string | null;
  resetKey?: number;
}

export function CopyDataDialog({
  accessions,
  onAccessionsChange,
  onApply,
  lastAppliedId,
  pendingTemplateId,
  resetKey,
}: CopyDataDialogProps) {
  const [open, setOpen] = useState(false);
  const tResearches = useTranslations("admin.researches");

  function handleApply(data: DatasetTemplateData, accession: string) {
    onApply(data, accession);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="lg">
          <Copy className="mr-2 size-5" />
          {tResearches("copy-data-in")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl bg-white">
        <DialogHeader>
          <DialogTitle>{tResearches("copy-data-in")}</DialogTitle>
          <DialogDescription>{tResearches("copy-data-in-description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <AccessionChips
            accessions={accessions}
            onAccessionsChange={onAccessionsChange}
            onApply={handleApply}
            lastAppliedId={lastAppliedId}
            pendingAccession={pendingTemplateId}
            resetKey={resetKey}
          />
          <CopyFromDataset
            onApply={handleApply}
            lastAppliedId={lastAppliedId}
            pendingDatasetId={pendingTemplateId}
            resetKey={resetKey}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
