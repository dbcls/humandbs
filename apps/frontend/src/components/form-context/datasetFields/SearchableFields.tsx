import { evaluate, getBy, useStore } from "@tanstack/react-form";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useTranslations } from "use-intl";

import { useState } from "react";

import { ResetFieldButton } from "@/components/form-context/fields/ResetFieldButton";
import { TagInput } from "@/components/form-context/fields/TagInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FACET_CATEGORY } from "@/config/facet-config";
import POLICY_DEFAULTS from "@/config/policyDefaults.json";
import { cn } from "@/lib/utils";

import type { NormalizedPolicy } from "../../../../../backend/src/crawler/types/common";
import { PolicyCanonicalSchema } from "../../../../../backend/src/crawler/types/common";
import type { SearchableExperimentFields } from "../../../../../backend/src/crawler/types/structured";
import { SearchableExperimentFieldsSchema } from "../../../../../backend/src/crawler/types/structured";
import { ModifiedTag } from "../fields";
import type { FieldKind } from "./getFieldKind";
import { getFieldKind } from "./getFieldKind";
import type { RendererProps } from "./searchableFieldsConfig";
import { searchableFieldsConfig } from "./searchableFieldsConfig";

type AnyForm = any;

const NULL_VALUE = "__null__";

function nullableSelectValue(v: string | null | undefined): string {
  return v ?? NULL_VALUE;
}

function selectValueToNullable(v: string): string | null {
  return v === NULL_VALUE ? null : v;
}

function modified(current: unknown, def: unknown) {
  return !evaluate(current, def);
}

function humanize(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

function NullableSelect({
  value,
  defaultValue,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string | null | undefined;
  defaultValue: string | null | undefined;
  onChange: (v: string | null) => void;
  options: readonly string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const isModified = modified(value, defaultValue);
  return (
    <div className="relative flex items-center data-[type=reset]:right-4">
      <Select
        value={nullableSelectValue(value)}
        onValueChange={(v) => onChange(selectValueToNullable(v))}
        disabled={disabled}
      >
        <SelectTrigger className={`h-8 w-full text-xs ${isModified ? "!bg-yellow-50" : ""}`}>
          <SelectValue placeholder={placeholder ?? "—"} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={NULL_VALUE}>—</SelectItem>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {isModified && !disabled && (
        <ResetFieldButton onClick={() => onChange(defaultValue ?? null)} />
      )}
    </div>
  );
}

function NullableBoolSelect({
  value,
  defaultValue,
  onChange,
  disabled,
}: {
  value: boolean | null | undefined;
  defaultValue: boolean | null | undefined;
  onChange: (v: boolean | null) => void;
  disabled?: boolean;
}) {
  const strVal = value === null || value === undefined ? NULL_VALUE : String(value);
  const isModified = modified(value, defaultValue);
  return (
    <div className="relative flex items-center **:data-[type=reset]:right-6">
      <Select
        value={strVal}
        onValueChange={(v) => {
          if (v === NULL_VALUE) onChange(null);
          else onChange(v === "true");
        }}
        disabled={disabled}
      >
        <SelectTrigger className={`h-8 w-full text-xs ${isModified ? "!bg-yellow-50" : ""}`}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={NULL_VALUE}>—</SelectItem>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {isModified && !disabled && (
        <ResetFieldButton onClick={() => onChange(defaultValue ?? null)} />
      )}
    </div>
  );
}

function NullableNumberInput({
  value,
  defaultValue,
  onChange,
  placeholder,
  disabled,
  className,
}: {
  value: number | null | undefined;
  defaultValue: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const isModified = modified(value, defaultValue);
  return (
    <div className="relative flex items-center">
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? null : Number(raw));
        }}
        placeholder={placeholder ?? "—"}
        className={`h-8 text-xs ${isModified ? "modified-field" : ""}${className ? ` ${className}` : ""}`}
        disabled={disabled}
      />
      {isModified && !disabled && (
        <ResetFieldButton onClick={() => onChange(defaultValue ?? null)} />
      )}
    </div>
  );
}

function NullableTextInput({
  value,
  defaultValue,
  onChange,
  placeholder,
  disabled,
}: {
  value: string | null | undefined;
  defaultValue: string | null | undefined;
  onChange: (v: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const isModified = modified(value, defaultValue);
  return (
    <div className="relative flex items-center">
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        placeholder={placeholder ?? "—"}
        className={`h-8 text-xs ${isModified ? "modified-field" : ""}`}
        disabled={disabled}
      />
      {isModified && !disabled && (
        <ResetFieldButton onClick={() => onChange(defaultValue ?? null)} />
      )}
    </div>
  );
}

function TagInputField({
  value,
  defaultValue,
  onChange,
  placeholder,
}: {
  value: string[];
  defaultValue: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const isModified = modified(value, defaultValue);
  return (
    <div className="relative flex items-center gap-1">
      <TagInput
        className="flex-1"
        inputClassName={cn({ "modified-field": isModified })}
        isModified={isModified}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />

      {isModified && (
        <ResetFieldButton className="relative right-auto" onClick={() => onChange(defaultValue)} />
      )}
    </div>
  );
}

function PoliciesField({
  value,
  defaultValue,
  onChange,
  disabled,
}: {
  fieldKey?: string;
  value: NormalizedPolicy[];
  defaultValue: NormalizedPolicy[];
  onChange: (v: NormalizedPolicy[]) => void;
  disabled?: boolean;
}) {
  const isModified = modified(value, defaultValue);
  const usedIds = new Set(value.map((p) => p.id));
  const availableIds = PolicyCanonicalSchema.options.filter((id) => !usedIds.has(id));

  function updateItem(i: number, patch: Partial<NormalizedPolicy>) {
    const next = [...value];
    next[i] = { ...next[i]!, ...patch };
    onChange(next);
  }

  function updateName(i: number, lang: "ja" | "en", text: string) {
    const next = [...value];
    next[i] = { ...next[i]!, name: { ...next[i]!.name, [lang]: text } };
    onChange(next);
  }

  function handleAdd(id: string) {
    const defaults = POLICY_DEFAULTS.find((p) => p.id === id);
    onChange([
      ...value,
      {
        id: id as NormalizedPolicy["id"],
        name: {
          ja: defaults?.defaultNameJa ?? "",
          en: defaults?.defaultNameEn ?? "",
        },
        url: defaults?.defaultUrl ?? null,
      },
    ]);
  }

  return (
    <div
      className={cn("flex flex-col gap-2 rounded border border-form-border px-2 py-1.5", {
        "modified-field": isModified,
      })}
    >
      {value.length > 0 && (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-form-divider border-b text-left text-form-sublabel">
              <th className="w-36 pr-2 pb-2 font-medium">Type</th>
              <th className="pr-2 pb-2 font-medium">Name (En)</th>
              <th className="pr-2 pb-2 font-medium">Name (Ja)</th>
              <th className="pr-2 pb-2 font-medium">URL</th>
              <th className="w-6 pb-2" />
            </tr>
          </thead>
          <tbody>
            {value.map((policy, i) => (
              <tr key={i} className="border-form-divider border-b last:border-0">
                <td className="py-1.5 pr-2 align-middle">
                  <Select
                    value={policy.id}
                    onValueChange={(newId) => {
                      const defaults = POLICY_DEFAULTS.find((p) => p.id === newId);
                      updateItem(i, {
                        id: newId as NormalizedPolicy["id"],
                        name: {
                          ja: defaults?.defaultNameJa ?? policy.name.ja,
                          en: defaults?.defaultNameEn ?? policy.name.en,
                        },
                        url: defaults?.defaultUrl !== undefined ? defaults.defaultUrl : policy.url,
                      });
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {PolicyCanonicalSchema.options.map((id) => (
                          <SelectItem
                            key={id}
                            value={id}
                            disabled={usedIds.has(id) && id !== policy.id}
                          >
                            {id}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-1.5 pr-2 align-middle">
                  <Input
                    value={policy.name.en}
                    onChange={(e) => updateName(i, "en", e.target.value)}
                    placeholder="Name (En)"
                    className="h-7 text-xs"
                    disabled={disabled}
                  />
                </td>
                <td className="py-1.5 pr-2 align-middle">
                  <Input
                    value={policy.name.ja}
                    onChange={(e) => updateName(i, "ja", e.target.value)}
                    placeholder="Name (Ja)"
                    className="h-7 text-xs"
                    disabled={disabled}
                  />
                </td>
                <td className="py-1.5 pr-2 align-middle">
                  <Input
                    value={policy.url ?? ""}
                    onChange={(e) =>
                      updateItem(i, { url: e.target.value === "" ? null : e.target.value })
                    }
                    placeholder="URL"
                    className="h-7 text-xs"
                    disabled={disabled}
                  />
                </td>
                <td className="py-1.5 align-middle">
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((_, j) => j !== i))}
                    disabled={disabled}
                    className="text-form-icon-btn hover:text-red-500 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex items-center gap-1">
        {!disabled && availableIds.length > 0 && (
          <Select value="" onValueChange={handleAdd}>
            <SelectTrigger className="h-8 w-fit text-xs">
              <SelectValue placeholder="+ Add policy" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {availableIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    {id}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
        {isModified && !disabled && (
          <ResetFieldButton
            className="relative right-auto"
            onClick={() => onChange(defaultValue)}
          />
        )}
      </div>
    </div>
  );
}

function FieldControl({
  fieldKey,
  kind,
  value,
  defaultValue,
  onChange,
  disabled,
}: {
  fieldKey: string;
  kind: FieldKind;
  value: any;
  defaultValue: any;
  onChange: (v: any) => void;
  disabled?: boolean;
}) {
  if (kind.kind === "enum") {
    return (
      <NullableSelect
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        options={kind.options}
        disabled={disabled}
      />
    );
  }

  if (kind.kind === "number") {
    return (
      <NullableNumberInput
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (kind.kind === "boolean") {
    return (
      <NullableBoolSelect
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (kind.kind === "string") {
    return (
      <NullableTextInput
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (kind.kind === "array" && kind.itemKind.kind === "string") {
    return (
      <TagInputField value={value ?? []} defaultValue={defaultValue ?? []} onChange={onChange} />
    );
  }

  if (kind.kind === "array" && kind.itemKind.kind === "object") {
    return (
      <ArrayOfObjectsField
        fieldKey={fieldKey}
        itemShape={kind.itemKind.shape}
        value={value ?? []}
        defaultValue={defaultValue ?? []}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (kind.kind === "object") {
    return (
      <ObjectField
        shape={kind.shape}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  return null;
}

function ArrayOfObjectsField({
  fieldKey,
  itemShape,
  value,
  defaultValue,
  onChange,
  disabled,
}: {
  fieldKey: string;
  itemShape: Record<string, FieldKind>;
  value: Record<string, any>[];
  defaultValue: Record<string, any>[];
  onChange: (v: Record<string, any>[]) => void;
  disabled?: boolean;
}) {
  const isModified = modified(value, defaultValue);
  const subKeys = Object.keys(itemShape);

  function updateItem(i: number, key: string, v: any) {
    const next = [...value];
    next[i] = { ...next[i]!, [key]: v };
    onChange(next);
  }

  function emptyItem(): Record<string, any> {
    const item: Record<string, any> = {};
    for (const key of subKeys) {
      const k = itemShape[key]!;
      item[key] = k.kind === "array" ? [] : null;
    }
    return item;
  }

  return (
    <div
      className={cn("flex flex-col gap-1 rounded border border-form-border px-2 py-1.5", {
        "modified-field": isModified,
      })}
    >
      {value.length > 0 && (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-form-divider border-b text-left text-form-sublabel">
              {subKeys.map((k) => (
                <th key={k} className="pr-2 pb-1 font-medium capitalize">
                  {humanize(k)}
                </th>
              ))}
              <th className="w-6 pb-1" />
            </tr>
          </thead>
          <tbody>
            {value.map((row, i) => (
              <tr key={i} className="border-form-divider border-b last:border-0">
                {subKeys.map((k) => (
                  <td key={k} className="py-1 pr-2">
                    <FieldControl
                      fieldKey={`${fieldKey}.${k}`}
                      kind={itemShape[k]!}
                      value={row[k]}
                      defaultValue={null}
                      onChange={(v) => updateItem(i, k, v)}
                      disabled={disabled}
                    />
                  </td>
                ))}
                <td className="py-1">
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((_, j) => j !== i))}
                    disabled={disabled}
                    className="text-form-icon-btn hover:text-red-500 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex items-center gap-1">
        {!disabled && (
          <Button
            type="button"
            variant="dashed"
            size="slim"
            onClick={() => onChange([...value, emptyItem()])}
          >
            + Add {humanize(fieldKey).toLowerCase()}
          </Button>
        )}
        {isModified && !disabled && (
          <ResetFieldButton
            className="relative right-auto"
            onClick={() => onChange(defaultValue)}
          />
        )}
      </div>
    </div>
  );
}

function ObjectField({
  shape,
  value,
  defaultValue,
  onChange,
  disabled,
}: {
  shape: Record<string, FieldKind>;
  value: Record<string, any> | null | undefined;
  defaultValue: Record<string, any> | null | undefined;
  onChange: (v: Record<string, any> | null) => void;
  disabled?: boolean;
}) {
  const current = value ?? {};
  const def = defaultValue ?? {};
  const isModified = modified(value, defaultValue);

  function patchKey(key: string, v: any) {
    onChange({ ...current, [key]: v });
  }

  const colCount = Object.keys(shape).length;
  return (
    <div
      className={`grid gap-1 rounded ${isModified ? "bg-yellow-50 p-1" : ""}`}
      style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
    >
      {Object.entries(shape).map(([key, kind]) => (
        <div key={key} className="flex flex-col gap-0.5">
          <span className="text-form-sublabel text-xs uppercase">{key}</span>
          <FieldControl
            fieldKey={key}
            kind={kind}
            value={current[key] ?? null}
            defaultValue={def[key] ?? null}
            onChange={(v) => patchKey(key, v)}
            disabled={disabled}
          />
        </div>
      ))}
      {isModified && !disabled && (
        <div className="flex justify-end" style={{ gridColumn: `1 / -1` }}>
          <ResetFieldButton
            className="relative right-auto"
            onClick={() => onChange(defaultValue ?? null)}
          />
        </div>
      )}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-start gap-2">
      <Label className="justify-self-end text-form-label text-xs">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="border-form-divider py-3 font-medium text-form-sublabel text-xs uppercase tracking-wide">
      {title}
    </p>
  );
}

function hasAnyValue(s: SearchableExperimentFields | undefined): boolean {
  if (!s) return false;
  return Object.values(s).some((v) => {
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
}

export const EMPTY_SEARCHABLE: SearchableExperimentFields = SearchableExperimentFieldsSchema.parse(
  Object.fromEntries(
    Object.entries(SearchableExperimentFieldsSchema.shape).map(([key, schema]) => {
      const kind = getFieldKind(schema);
      return [key, kind.kind === "array" ? [] : null];
    }),
  ),
);

// Ordered list of section categories, matching FACET_CATEGORY declaration order
const SECTION_ORDER = [
  FACET_CATEGORY.SUBJECTS,
  FACET_CATEGORY.PLATFORM_METHOD,
  FACET_CATEGORY.SEQUENCING_QUALITY,
  FACET_CATEGORY.DATA_FORMAT,
  FACET_CATEGORY.POLICY,
] as const;

export function SearchableFields({
  form,
  experimentIndex,
  disabled,
}: {
  form: AnyForm;
  experimentIndex: number;
  disabled?: boolean;
}) {
  const t = useTranslations("Filters");

  const searchable: SearchableExperimentFields | undefined = useStore(
    form.store,
    (state: any) => state.values?.experiments?.[experimentIndex]?.searchable,
  );

  const defaultSearchable: SearchableExperimentFields | undefined = getBy(
    form.options.defaultValues,
    `experiments[${experimentIndex}].searchable`,
  ) as SearchableExperimentFields | undefined;

  const [open, setOpen] = useState(() => hasAnyValue(searchable));

  const s = searchable ?? EMPTY_SEARCHABLE;
  const d = defaultSearchable ?? EMPTY_SEARCHABLE;

  const isModified = modified(s, d);

  function patch(updates: Partial<SearchableExperimentFields>) {
    form.setFieldValue(`experiments[${experimentIndex}].searchable`, {
      ...s,
      ...updates,
    });
  }

  function handleToggle() {
    if (!open && !searchable) {
      form.setFieldValue(`experiments[${experimentIndex}].searchable`, { ...EMPTY_SEARCHABLE });
    }
    setOpen((v) => !v);
  }

  // Build sorted field list from schema shape
  const schemaEntries = Object.entries(SearchableExperimentFieldsSchema.shape) as [
    keyof SearchableExperimentFields,
    any,
  ][];

  type FieldEntry = {
    key: keyof SearchableExperimentFields;
    kind: FieldKind;
    label: string;
    section: string | undefined;
    order: number;
    renderer?: React.ComponentType<RendererProps<any>>;
  };

  const fields: FieldEntry[] = schemaEntries
    .map(([key, schema], schemaIndex) => {
      const config = searchableFieldsConfig[key];
      if (config?.hidden) return null;
      const kind = getFieldKind(schema);
      const label = t.has(`${key}.title` as any)
        ? t(`${key}.title` as any)
        : humanize(key as string);
      return {
        key,
        kind,
        label,
        section: config?.section,
        order: config?.order ?? schemaIndex + 1000,
        renderer: config?.renderer ?? (key === "policies" ? PoliciesField : undefined),
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null) as FieldEntry[];

  // Group by section
  const bySection = new Map<string | undefined, FieldEntry[]>();
  for (const field of fields) {
    const bucket = bySection.get(field.section) ?? [];
    bucket.push(field);
    bySection.set(field.section, bucket);
  }

  // Sort within each section by order
  for (const bucket of bySection.values()) {
    bucket.sort((a, b) => a.order - b.order);
  }

  function renderField(field: FieldEntry) {
    const value = s[field.key];
    const defaultValue = d[field.key];
    const onChange = (v: any) => patch({ [field.key]: v });

    const control = field.renderer ? (
      <field.renderer
        fieldKey={field.key}
        value={value as any}
        defaultValue={defaultValue as any}
        onChange={onChange}
        disabled={disabled}
      />
    ) : (
      <FieldControl
        fieldKey={field.key as string}
        kind={field.kind}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
      />
    );

    return (
      <FieldRow key={field.key as string} label={field.label}>
        {control}
      </FieldRow>
    );
  }

  function renderSection(sectionKey: string) {
    const sectionFields = bySection.get(sectionKey);
    if (!sectionFields || sectionFields.length === 0) return null;
    const sectionLabel = t.has(sectionKey as any) ? t(sectionKey as any) : humanize(sectionKey);
    return (
      <div key={sectionKey} className="not-first:border-form-border not-first:border-t">
        <SectionHeader title={sectionLabel} />
        <section className="space-y-2">{sectionFields.map(renderField)}</section>
      </div>
    );
  }

  const unsectionedFields = bySection.get(undefined) ?? [];

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1 text-form-label text-xs hover:text-form-value"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span className="font-medium">Searchable fields</span>
        {hasAnyValue(searchable) && (
          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-blue-700 text-xs">
            filled
          </span>
        )}
        <ModifiedTag isModified={isModified} />
      </button>

      {open && (
        <div className="mt-1 flex flex-col gap-2 rounded border border-form-border p-3">
          {SECTION_ORDER.map(renderSection)}
          {unsectionedFields.map(renderField)}
        </div>
      )}
    </div>
  );
}
