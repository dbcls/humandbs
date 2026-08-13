import { Download, Upload } from "lucide-react";

import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MarkdownFileActionsProps {
  filename: string;
  content: string;
  title: string;
  shortTitle: string;
  lang: string;
  onUpload: (content: string, title?: string, shortTitle?: string) => void;
  className?: string;
}

export function buildFrontmatter(title: string, shortTitle: string, lang: string): string {
  return `---\ntitle: ${JSON.stringify(title)}\nshortTitle: ${JSON.stringify(shortTitle)}\nlang: ${lang}\n---\n\n`;
}

function parseFrontmatterValue(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.*?)\\s*$`, "m"));
  if (!match) return undefined;

  const value = match[1] ?? "";
  if (!value.startsWith('"')) return value;

  try {
    return JSON.parse(value) as string;
  } catch {
    return value.slice(1, value.endsWith('"') ? -1 : undefined).replace(/\\"/g, '"');
  }
}

export function parseFrontmatter(text: string): {
  content: string;
  title?: string;
  shortTitle?: string;
} {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n){0,2}/);
  if (!match) return { content: text };

  const frontmatter = match[1];
  const rest = text.slice(match[0].length);

  const title = parseFrontmatterValue(frontmatter, "title");
  const shortTitle = parseFrontmatterValue(frontmatter, "shortTitle");

  return { content: rest, title, shortTitle };
}

export function MarkdownFileActions({
  filename,
  content,
  title,
  shortTitle,
  lang,
  onUpload,
  className,
}: MarkdownFileActionsProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDownload() {
    const fullContent = buildFrontmatter(title, shortTitle, lang) + content;
    const blob = new Blob([fullContent], { type: "text/markdown" });
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
        const {
          content: parsedContent,
          title: parsedTitle,
          shortTitle: parsedShortTitle,
        } = parseFrontmatter(text);
        onUpload(parsedContent, parsedTitle, parsedShortTitle);
      }
    };
    reader.readAsText(file);
    // reset so same file can be re-uploaded
    e.target.value = "";
  }

  return (
    <div className={cn("flex items-center justify-end gap-2", className)}>
      <Button variant="outline" onClick={handleDownload}>
        <Download className="size-6" />
        MD
      </Button>
      <Button variant="outline" onClick={() => inputRef.current?.click()}>
        <Upload className="size-6" />
        MD
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
