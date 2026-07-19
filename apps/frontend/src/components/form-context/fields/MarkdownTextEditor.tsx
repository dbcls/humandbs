import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "use-intl";

import type { Ref } from "react";
import { useState } from "react";

import MarkdownClientPreview from "@/components/markdown/MarkdownClientPreview";
import { Button } from "@/components/ui/button";
import { TextareaAutosize } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  ref,
}: {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  legacyRawHtml?: string;
  placeholder?: string;
  fieldLabel?: string;
  modified?: boolean;
  className?: string;
  ref?: Ref<HTMLTextAreaElement>;
}) {
  const tMarkdown = useTranslations("admin.markdown");
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="slim"
          className="gap-1 text-xs"
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {showPreview ? tMarkdown("hide-preview") : tMarkdown("preview")}
        </Button>
      </div>

      <TextareaAutosize
        ref={ref}
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
        <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-form-divider bg-muted/40 p-3">
          <MarkdownClientPreview source={value} />
        </div>
      )}
    </div>
  );
}
