import MDEditor from "@uiw/react-md-editor";
import { PaperclipIcon } from "lucide-react";
import { Suspense, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AssetsBrowser,
  AssetsBrowserFallback,
} from "@/routes/{-$lang}/_layout/_authed/admin/-components/AssetsBrowser";
import type { AssetHierarchyFile } from "@/serverFunctions/assets";

import { MarkdownClientPreview } from "../markdown/MarkdownClientPreview";
import { buildAssetMarkdown } from "./content-area-asset-utils";

import { useFieldContext } from "./FormContext";

export default function ContentAreaField({
  label,
  assetFolder,
  isLoading,
}: {
  label: React.ReactNode;
  assetFolder?: string;
  isLoading?: boolean;
}) {
  const field = useFieldContext<string>();
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetHierarchyFile | null>(
    null,
  );

  function insertAssetMarkdown(asset: AssetHierarchyFile) {
    const markdown = buildAssetMarkdown(asset);
    const currentValue = field.state.value ?? "";
    const textarea =
      editorContainerRef.current?.querySelector("textarea") ?? null;

    if (!textarea) {
      field.handleChange(
        currentValue ? `${currentValue}\n${markdown}` : markdown,
      );
      return;
    }

    const start = textarea.selectionStart ?? currentValue.length;
    const end = textarea.selectionEnd ?? currentValue.length;
    const nextValue =
      currentValue.slice(0, start) + markdown + currentValue.slice(end);

    field.handleChange(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + markdown.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-2 text-sm font-medium">
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <Button
          variant="outline"
          type="button"
          onClick={() => setDialogOpen(true)}
        >
          <PaperclipIcon className="mr-2 size-4" />
          Attach asset
        </Button>
      </div>
      <div ref={editorContainerRef} data-color-mode="light" className="min-h-0 flex-1">
        <MDEditor
          highlightEnable={true}
          value={field.state.value ?? ""}
          onChange={(value) => {
            field.handleChange(value || "");
          }}
          height="100%"
          className="md-editor flex-1"
          components={{
            preview: (source) => {
              return <MarkdownClientPreview source={source} />;
            },
          }}
        />
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelectedAsset(null);
          }
        }}
      >
        <DialogContent className="flex h-[90vh] max-h-[90vh] w-[calc(100vw-2rem)] max-w-[1400px] flex-col overflow-hidden p-4 sm:w-[calc(100vw-4rem)] sm:max-w-[1400px] sm:p-6">
          <DialogHeader>
            <DialogTitle>Attach asset</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={<AssetsBrowserFallback />}>
              <AssetsBrowser
                mode="pick"
                initialFolderPath={assetFolder}
                onSelectedFileChange={setSelectedAsset}
              />
            </Suspense>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!selectedAsset}
              onClick={() => {
                if (!selectedAsset) return;
                insertAssetMarkdown(selectedAsset);
                setDialogOpen(false);
                setSelectedAsset(null);
              }}
            >
              Insert asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
