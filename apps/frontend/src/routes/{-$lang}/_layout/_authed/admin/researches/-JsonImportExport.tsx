import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import useConfirmationStore from "@/stores/confirmationStore";

interface JsonImportExportProps {
  filename: string;
  getValues: () => unknown;
  onImport: (values: unknown) => void;
  hasData: () => boolean;
}

export function JsonImportExport({
  filename,
  getValues,
  onImport,
  hasData,
}: JsonImportExportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const { openConfirmation } = useConfirmationStore();

  function handleDownload() {
    const json = JSON.stringify(getValues(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-uploaded
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (hasData()) {
          openConfirmation({
            title: "Overwrite form data?",
            description:
              "This will overwrite all current form data with the contents of the uploaded file. Continue?",
            actionLabel: "Overwrite",
            onAction: () => {
              setImportError(null);
              onImport(parsed);
            },
          });
        } else {
          setImportError(null);
          onImport(parsed);
        }
      } catch {
        setImportError("Invalid JSON file. Please upload a valid .json file.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="slim" onClick={handleDownload}>
          Download JSON
        </Button>
        <Button
          type="button"
          variant="outline"
          size="slim"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload JSON
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      {importError && (
        <p className="text-danger text-xs">{importError}</p>
      )}
    </div>
  );
}
