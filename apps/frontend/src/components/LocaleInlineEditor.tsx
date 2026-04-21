import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface LocaleValue {
  en: string;
  ja: string;
}

interface LocaleInlineEditorProps {
  value: LocaleValue;
  onChange: (value: LocaleValue) => void;
  placeholder?: string;
  displayClassName?: string;
  /** If true, EN field is required (won't commit with empty EN) */
  required?: boolean;
}

/**
 * Inline bilingual (EN/JA) text editor.
 *
 * Renders as a clickable label showing the EN value. Clicking switches to a
 * two-field form (EN + JA). Changes are committed on blur (click outside),
 * Enter key, or focus moving to the JA field; Escape cancels. If `required`
 * is set, the form will not commit when the EN field is empty.
 */
export function LocaleInlineEditor({
  value,
  onChange,
  placeholder = "Click to edit",
  displayClassName,
  required = false,
}: LocaleInlineEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editEn, setEditEn] = useState("");
  const [editJa, setEditJa] = useState("");
  const formRef = useRef<HTMLDivElement | null>(null);
  const enInputRef = useRef<HTMLInputElement | null>(null);

  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    if (!isEditing) return;
    enInputRef.current?.focus();
    enInputRef.current?.select();
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    function handleMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (formRef.current?.contains(target)) return;
      commitRef.current();
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isEditing]);

  /** Opens the form, seeding it with the current value. */
  function startEditing() {
    setEditEn(value.en);
    setEditJa(value.ja);
    setIsEditing(true);
  }

  /** Saves trimmed values and closes the form. Falls back JA to EN when JA is blank. */
  function commit() {
    const en = editEn.trim();
    const ja = editJa.trim();
    if (required && !en) return;
    onChange({ en, ja: ja || en });
    setIsEditing(false);
  }

  /** Discards edits and closes the form without firing onChange. */
  function cancel() {
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div ref={formRef} className="flex min-w-0 flex-col gap-1.5">
        {(["en", "ja"] as const).map((locale) => (
          <div key={locale} className="flex min-w-0 items-center gap-2">
            <label className="w-6 shrink-0 text-xs font-medium uppercase text-gray-500">
              {locale}
            </label>
            <input
              ref={locale === "en" ? enInputRef : undefined}
              type="text"
              value={locale === "en" ? editEn : editJa}
              onChange={(e) =>
                locale === "en" ? setEditEn(e.target.value) : setEditJa(e.target.value)
              }
              placeholder={locale === "en" ? "English" : "日本語"}
              className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-blue-400"
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") cancel();
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className={cn(
        "group flex items-center gap-1.5 text-left hover:text-gray-900",
        !value.en && "text-gray-400",
        displayClassName,
      )}
      title="Click to edit"
    >
      <span>{value.en || placeholder}</span>
      <Pencil className="size-3 shrink-0 opacity-0 group-hover:opacity-50" />
    </button>
  );
}
