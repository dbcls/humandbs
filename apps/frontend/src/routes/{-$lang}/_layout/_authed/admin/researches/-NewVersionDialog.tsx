import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TextareaAutosize } from "@/components/ui/textarea";
import { $createResearchVersion } from "@/serverFunctions/researches";
import type { ResearchVersionsListResponse } from "@humandbs/backend/types";

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
                  en: enText.trim() ? { text: enText, rawHtml: "" } : null,
                  ja: jaText.trim() ? { text: jaText, rawHtml: "" } : null,
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
      // Optimistically append the new version to all cached version lists so the
      // selector has it immediately when we call onVersionCreated below.
      queryClient.setQueriesData<ResearchVersionsListResponse>(
        { queryKey: ["researches", "versions"] },
        (old) =>
          old
            ? { ...old, data: [...old.data, newVersionDoc] }
            : old,
      );
      onVersionCreated(newVersionDoc.version);
      // Defer invalidations so they don't race against the optimistic patch above.
      // The selector re-renders with the new version selected first, then the
      // background refetches sync with the server.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["researches", "versions"] });
        queryClient.invalidateQueries({ queryKey: ["researches", "byId"] });
        queryClient.invalidateQueries({ queryKey: ["researches", "list"] });
      }, 0);
      onOpenChange(false);
      setEnText("");
      setJaText("");
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message ?? "Failed to create version.");
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add new version</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-500">
            Optionally add a bilingual release note describing what changed in this version.
          </p>
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs font-medium uppercase text-gray-400">
                En
              </label>
              <TextareaAutosize
                minRows={4}
                maxRows={8}
                className="w-full resize-none rounded-lg bg-primary px-3 py-2 text-sm"
                placeholder="Release note (English)"
                value={enText}
                onChange={(e) => setEnText(e.target.value)}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs font-medium uppercase text-gray-400">
                Ja
              </label>
              <TextareaAutosize
                minRows={4}
                maxRows={8}
                className="w-full resize-none rounded-lg bg-primary px-3 py-2 text-sm"
                placeholder="リリースノート（日本語）"
                value={jaText}
                onChange={(e) => setJaText(e.target.value)}
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
          <Button
            size="slim"
            onClick={() => createVersion()}
            disabled={isPending}
          >
            {isPending ? "Creating…" : "Create version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
