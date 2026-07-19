import { FileText, Link2 } from "lucide-react";

import type { KeyboardEventHandler, ReactNode, Ref } from "react";
import { useEffect, useId, useRef, useState } from "react";

import type { Locale } from "@/config/i18n";
import type { NavigationItem } from "@/config/siteNavigation";
import { cn } from "@/lib/utils";
import type { DocumentsListItemResponse } from "@/repositories/document";

export function getDocumentLabel(doc: DocumentsListItemResponse, lang?: Locale): string {
  if (lang) {
    const currentTranslation = doc.translations.find((t) => t.lang === lang);
    if (currentTranslation?.title) return currentTranslation.title;
  }

  for (const t of doc.translations) {
    if (t.status === "published" && t.title) return t.title;
  }
  for (const t of doc.translations) {
    if (t.status === "draft" && t.title) return t.title;
  }

  return doc.contentId;
}

export function getEditorItemLabel(
  item: NavigationItem,
  lang: Locale,
  documentTitleByContentId: Map<string, string>,
): string {
  if (item.type === "document") {
    const key = item.documentId ?? item.contentId;
    if (key) return documentTitleByContentId.get(key) ?? item.contentId ?? key;
  }

  if (item.type === "link") {
    return item.label[lang] ?? item.label.en ?? item.url ?? item.id;
  }

  return item.id;
}

export function getEditorItemPath(
  item: NavigationItem,
  documentPathById: Map<string, string>,
): string | undefined {
  if (item.type === "document") {
    if (item.documentId) {
      return documentPathById.get(item.documentId) ?? item.contentId;
    }
    return item.contentId;
  }

  return item.url;
}

export function NavigationItemLeadingIcon({ item }: { item: NavigationItem }) {
  if (item.type === "document") {
    return <FileText className="mt-0.5 size-3 shrink-0 text-sky-600" />;
  }

  return <Link2 className="mt-0.5 size-3 shrink-0 text-amber-600" />;
}

export function CardWithPath({
  path,
  children,
}: {
  path: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="font-mono text-2xs text-gray-400 leading-none">{path}</span>
      {children}
    </div>
  );
}

interface EditorTextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  onChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
}

export function EditorTextInput({ className, onChange, ...rest }: EditorTextInputProps) {
  return (
    <input
      {...rest}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      type="text"
      className={cn(
        "w-full rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400",
        className,
      )}
    />
  );
}

export function LabeledInputRow({
  label,
  value,
  onChange,
  placeholder,
  onKeyDown,
  autoFocus = false,
  inputRef,
}: {
  label: "EN" | "JA";
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <label className="w-8 shrink-0 text-gray-500 text-xs" htmlFor={`input-${id}`}>
        {label}
      </label>
      <EditorTextInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        ref={inputRef}
        className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
      />
    </div>
  );
}

export function EditableLinkLabel({
  item,
  lang,
  documentTitleByContentId,
  className,
  onSave,
}: {
  item: NavigationItem;
  lang: Locale;
  documentTitleByContentId: Map<string, string>;
  className?: string;
  onSave: (value: { url: string; label: { en: string; ja: string } }) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editUrl, setEditUrl] = useState("");
  const [editEn, setEditEn] = useState("");
  const [editJa, setEditJa] = useState("");
  const editFormRef = useRef<HTMLDivElement | null>(null);
  const editUrlInputRef = useRef<HTMLInputElement | null>(null);

  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    if (!isEditing) return;
    editUrlInputRef.current?.focus();
    editUrlInputRef.current?.select();
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (editFormRef.current?.contains(target)) return;
      commitRef.current();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isEditing]);

  function startEditing() {
    if (item.type !== "link") return;
    setEditUrl(item.url ?? "");
    setEditEn(item.label?.en ?? "");
    setEditJa(item.label?.ja ?? "");
    setIsEditing(true);
  }

  function commit() {
    const url = editUrl.trim();
    const en = editEn.trim();
    const ja = editJa.trim();
    if (!url || !en) return;
    onSave({ url, label: { en, ja: ja || en } });
    setIsEditing(false);
  }

  function cancel() {
    setIsEditing(false);
  }

  if (item.type !== "link") {
    return (
      <span className={className}>{getEditorItemLabel(item, lang, documentTitleByContentId)}</span>
    );
  }

  if (isEditing) {
    return (
      <div ref={editFormRef} className="flex min-w-0 flex-1 flex-col gap-1.5">
        <EditorTextInput
          ref={editUrlInputRef}
          value={editUrl}
          onChange={setEditUrl}
          placeholder="URL"
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
        />
        <LabeledInputRow
          label="EN"
          value={editEn}
          onChange={setEditEn}
          placeholder="English label"
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
        />
        <LabeledInputRow
          label="JA"
          value={editJa}
          onChange={setEditJa}
          placeholder="Japanese label"
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
        />
      </div>
    );
  }

  return (
    <button type="button" onClick={startEditing} className={className}>
      {getEditorItemLabel(item, lang, documentTitleByContentId)}
    </button>
  );
}

export function FooterDocOverlay({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded bg-white px-2 py-1.5 text-xs shadow-lg ring-2 ring-blue-300">
      <FileText className="size-3 shrink-0 text-sky-600" />
      <span>{label}</span>
    </div>
  );
}
