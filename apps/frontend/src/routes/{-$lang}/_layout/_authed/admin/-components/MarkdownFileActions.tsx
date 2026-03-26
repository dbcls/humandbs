import { Download, Upload } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";

interface MarkdownFileActionsProps {
  filename: string;
  content: string;
  title: string;
  lang: string;
  onUpload: (content: string, title?: string) => void;
}

function buildFrontmatter(title: string, lang: string): string {
  return `---\ntitle: "${title.replace(/"/g, '\\"')}"\nlang: ${lang}\n---\n\n`;
}

function parseFrontmatter(text: string): {
  content: string;
  title?: string;
} {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { content: text };

  const frontmatter = match[1];
  const rest = text.slice(match[0].length);

  const titleMatch = frontmatter.match(/^title:\s*"?(.*?)"?\s*$/m);
  const title = titleMatch ? titleMatch[1].replace(/\\"/g, '"') : undefined;

  return { content: rest, title };
}

export function MarkdownFileActions({
  filename,
  content,
  title,
  lang,
  onUpload,
}: MarkdownFileActionsProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDownload() {
    const fullContent = buildFrontmatter(title, lang) + content;
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
        const { content: parsedContent, title: parsedTitle } =
          parseFrontmatter(text);
        onUpload(parsedContent, parsedTitle);
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
