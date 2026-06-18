import type { FileContents } from "@pierre/diffs/react";
import { MultiFileDiff } from "@pierre/diffs/react";

export function DiffViewer({ oldText, newText }: { oldText: string; newText: string }) {
  const oldFile: FileContents = {
    name: "text",
    contents: oldText,
  };
  const newFile: FileContents = {
    name: "text",
    contents: newText,
  };

  return (
    <MultiFileDiff
      oldFile={oldFile}
      newFile={newFile}
      options={{ theme: "ayu-light", overflow: "wrap" }}
    />
  );
}
