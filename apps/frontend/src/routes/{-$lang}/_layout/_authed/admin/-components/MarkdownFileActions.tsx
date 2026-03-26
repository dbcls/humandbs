import { Download, Upload } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";

interface MarkdownFileActionsProps {
  filename: string;
  content: string;
  onUpload: (content: string) => void;
}

export function MarkdownFileActions({
  filename,
  content,
  onUpload,
}: MarkdownFileActionsProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDownload() {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") {
        onUpload(text);
      }
    };
    reader.readAsText(file);
    // reset so same file can be re-uploaded
    e.target.value = "";
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={handleDownload}>
        <Download className="size-6" />
        Download
      </Button>
      <Button variant="outline" onClick={() => inputRef.current?.click()}>
        <Upload className="size-6" />
        Upload
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".md,text/markdown,text/plain"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
