import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";

import { useState } from "react";

import { MarkdownTextEditor } from "@/components/form-context/fields/MarkdownTextEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { $createResearchVersion } from "@/serverFunctions/researches";

import { AdminStatusMessage } from "../../-components/AdminStatusMessage";

export function NewVersionDialog({
  humId,
  open,
  onOpenChange,
  onVersionCreated,
}: {
  humId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVersionCreated: (version: string) => void;
}) {
  const queryClient = useQueryClient();
  const tResearches = useTranslations("admin.researches");
  const [enText, setEnText] = useState("");
  const [jaText, setJaText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { mutate: createVersion, isPending } = useMutation({
    mutationFn: () =>
      $createResearchVersion({
        data: {
          humId,
          releaseNote:
            enText.trim() || jaText.trim()
              ? {
                  // Client sends only `text`; `rawHtml` is server-managed legacy data.
                  en: enText.trim() ? { text: enText } : null,
                  ja: jaText.trim() ? { text: jaText } : null,
                }
              : undefined,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const newVersionDoc = result.data.data;
      queryClient.removeQueries({ queryKey: ["researches", "versions"] });
      queryClient.invalidateQueries({ queryKey: ["researches", "byId"] });
      queryClient.invalidateQueries({ queryKey: ["researches", "list"] });
      onVersionCreated(newVersionDoc.version);
      onOpenChange(false);
      setEnText("");
      setJaText("");
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message ?? tResearches("create-version-failed"));
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      setEnText("");
      setJaText("");
      setError(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Add new version</DialogTitle>
        </DialogHeader>

        {error ? <AdminStatusMessage>{error}</AdminStatusMessage> : null}

        <div className="flex flex-col gap-3">
          <p className="text-gray-500 text-sm">
            Optionally add a bilingual release note describing what changed in this version.
          </p>
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-medium text-gray-400 text-xs uppercase">En</span>
              <MarkdownTextEditor
                value={enText}
                onChange={setEnText}
                placeholder="Release note (English)"
                fieldLabel="Release note (en)"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-medium text-gray-400 text-xs uppercase">Ja</span>
              <MarkdownTextEditor
                value={jaText}
                onChange={setJaText}
                placeholder="リリースノート（日本語）"
                fieldLabel="Release note (ja)"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="slim"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button size="slim" onClick={() => createVersion()} disabled={isPending}>
            {isPending ? "Creating…" : "Create version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
