import { Eye, EyeOff } from "lucide-react";

import { useState } from "react";

import MarkdownClientPreview from "@/components/markdown/MarkdownClientPreview";
import { Button } from "@/components/ui/button";
import { TextareaAutosize } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { LegacyHtmlDialog } from "./LegacyHtmlDialog";

/**
 * Controlled Markdown editor for a single `text` value: a textarea editing the
 * Markdown source, a toggleable live client-rendered preview (reusing the same
 * Markdown pipeline the public page uses, so preview ≡ public output), and an
 * on-demand legacy `rawHtml` reference popup.
 *
 * Edits only `text`; legacy `rawHtml` is a read-only side-channel passed in and
 * never written back.
 */
export function MarkdownTextEditor({
  value,
  onChange,
  onBlur,
  legacyRawHtml,
  placeholder,
  fieldLabel,
  modified = false,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  legacyRawHtml?: string;
  placeholder?: string;
  fieldLabel?: string;
  modified?: boolean;
  className?: string;
}) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="slim"
          className="gap-1 text-xs"
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {showPreview ? "Hide preview" : "Preview"}
        </Button>
        <LegacyHtmlDialog rawHtml={legacyRawHtml} fieldLabel={fieldLabel} />
      </div>

      <TextareaAutosize
        minRows={3}
        maxRows={16}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={cn(
          "w-full resize-none rounded-lg px-3 py-2 font-mono text-sm disabled:opacity-100",
          "group-disabled/fieldset:disabled-text-field",
          { "modified-field": modified },
        )}
      />

      {showPreview && (
        <div className="rounded-lg border border-form-divider bg-muted/40 p-3">
          <MarkdownClientPreview source={value} />
        </div>
      )}
    </div>
  );
}
