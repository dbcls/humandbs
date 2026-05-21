import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface LocaleValue {
  en: string;
  ja: string;
}

interface LocaleInlineEditorProps {
  value: LocaleValue;
  onChange: (value: LocaleValue) => void;
  placeholder?: string;
  className?: string;
  /** If true, EN field is required (won't commit with empty EN) */
  required?: boolean;
  /** @deprecated Both locales are always shown. Kept for API compatibility. */
  displayLocale?: "en" | "ja";
}

export function LocaleInlineEditor({
  value,
  onChange,
  placeholder = "Click to edit",
  className,
  required = false,
}: LocaleInlineEditorProps) {
  const [editingLocale, setEditingLocale] = useState<"en" | "ja" | null>(null);
  const [editEn, setEditEn] = useState("");
  const [editJa, setEditJa] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const enInputRef = useRef<HTMLInputElement | null>(null);
  const jaInputRef = useRef<HTMLInputElement | null>(null);

  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    if (!editingLocale) return;
    const ref = editingLocale === "en" ? enInputRef : jaInputRef;
    ref.current?.focus();
    ref.current?.select();
  }, [editingLocale]);

  useEffect(() => {
    if (!editingLocale) return;
    function handleMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      commitRef.current();
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [editingLocale]);

  function startEditing(locale: "en" | "ja") {
    setEditEn(value.en);
    setEditJa(value.ja);
    setEditingLocale(locale);
  }

  function commit() {
    const en = editEn.trim();
    const ja = editJa.trim();
    if (required && !en) return;
    onChange({ en, ja: ja || en });
    setEditingLocale(null);
  }

  function cancel() {
    setEditingLocale(null);
  }

  const isEditing = editingLocale !== null;

  return (
    <div ref={containerRef} className={cn("flex min-w-0 flex-col", className)}>
      {(["ja", "en"] as const).map((locale) => {
        const isFocused = editingLocale === locale;
        const displayValue = locale === "en" ? value.en : value.ja;
        const editValue = locale === "en" ? editEn : editJa;

        return (
          <div key={locale} className="flex min-w-0 items-baseline gap-2">
            <span className="w-6 shrink-0 font-medium text-gray-400 text-xs uppercase">
              {locale}
            </span>

            {isEditing ? (
              <input
                ref={locale === "en" ? enInputRef : jaInputRef}
                type="text"
                value={editValue}
                onChange={(e) =>
                  locale === "en" ? setEditEn(e.target.value) : setEditJa(e.target.value)
                }
                placeholder={locale === "en" ? "English" : "日本語"}
                className={cn(
                  "min-w-0 flex-1 rounded border px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-blue-400",
                  isFocused ? "border-blue-300" : "border-gray-200",
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") cancel();
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => startEditing(locale)}
                className={cn(
                  "group/btn min-w-0 flex-1 truncate rounded px-2 py-0.5 text-left text-sm hover:bg-gray-100 hover:text-gray-900",
                  !displayValue && "text-gray-400",
                )}
                title="Click to edit"
              >
                {displayValue || placeholder}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
