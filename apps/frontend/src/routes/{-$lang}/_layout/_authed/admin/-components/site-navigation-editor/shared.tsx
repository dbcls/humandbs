import { Check, FileText, Link2, Plus, Search, X } from "lucide-react";

import type { KeyboardEventHandler, ReactNode, Ref } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/config/i18n";
import type { NavigationItem } from "@/config/siteNavigation";
import { cn } from "@/lib/utils";
import type { DocumentsListItemResponse } from "@/repositories/document";
import { getEffectiveDocumentNavigationLabel } from "@/utils/documentNavigationLabel";

export function getDocumentLabel(doc: DocumentsListItemResponse, lang?: Locale): string {
  const labelFor = (translation: DocumentsListItemResponse["translations"][number]) =>
    getEffectiveDocumentNavigationLabel({
      title:
        translation.status === "published" && "editableTitle" in translation
          ? translation.editableTitle
          : translation.title,
      shortTitle:
        translation.status === "published" && "editableShortTitle" in translation
          ? translation.editableShortTitle
          : translation.shortTitle,
    });

  if (lang) {
    const label = doc.translations.find((t) => t.lang === lang);
    const resolved = label && labelFor(label);
    if (resolved) return resolved;
  }

  for (const translation of doc.translations) {
    const resolved = labelFor(translation);
    if (resolved) return resolved;
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

export function matchesUnassignedPoolFilter(
  filter: string,
  values: Array<string | null | undefined>,
): boolean {
  const query = filter.trim().toLowerCase();
  return !query || values.some((value) => value?.toLowerCase().includes(query));
}

export function UnassignedPoolFilter({
  value,
  onChange,
  placeholder,
  clearLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  clearLabel: string;
}) {
  return (
    <div className="relative mb-2 shrink-0">
      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-gray-400" />
      <EditorTextInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="pr-7 pl-7"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label={clearLabel}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function AddNavigationGroup({
  onAdd,
  autoFocus = false,
}: {
  onAdd: (label: { en: string; ja: string }) => void;
  autoFocus?: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [labelEn, setLabelEn] = useState("");
  const [labelJa, setLabelJa] = useState("");

  function reset() {
    setLabelEn("");
    setLabelJa("");
    setShowForm(false);
  }

  function submit() {
    const en = labelEn.trim();
    const ja = labelJa.trim();
    if (!en) return;
    onAdd({ en, ja: ja || en });
    reset();
  }

  return showForm ? (
    <div className="w-80 rounded-md border border-black border-dashed p-3 shadow-sm">
      <p className="mb-2 font-medium text-gray-600 text-xs">New group</p>
      <div className="flex flex-col gap-2">
        <LabeledInputRow
          label="EN"
          value={labelEn}
          onChange={setLabelEn}
          placeholder="English name"
          autoFocus={autoFocus}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
            if (event.key === "Escape") reset();
          }}
        />
        <LabeledInputRow
          label="JA"
          value={labelJa}
          onChange={setLabelJa}
          placeholder="Japanese name"
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
            if (event.key === "Escape") reset();
          }}
        />
        <div className="flex items-center justify-end gap-1 pt-1">
          <Button type="button" onClick={submit} disabled={!labelEn.trim()}>
            <Check className="mr-1 size-3" />
            Add
          </Button>
          <Button type="button" variant="outline" onClick={reset}>
            <X className="mr-1 size-3" />
            Cancel
          </Button>
        </div>
      </div>
    </div>
  ) : (
    <Button
      type="button"
      variant="dashed"
      className="min-h-80 w-80 justify-center"
      onClick={() => setShowForm(true)}
    >
      <Plus className="mr-1 size-3" />
      Add group
    </Button>
  );
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
