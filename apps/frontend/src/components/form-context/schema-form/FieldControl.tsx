import { Trash2 } from "lucide-react";

import { ResetFieldButton } from "@/components/form-context/fields/ResetFieldButton";
import { TagInput } from "@/components/form-context/fields/TagInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { FieldKind } from "./getFieldKind";
import { humanize, modified } from "./utils";

const NULL_VALUE = "__null__";

function nullableSelectValue(v: string | null | undefined): string {
  return v ?? NULL_VALUE;
}

function selectValueToNullable(v: string): string | null {
  return v === NULL_VALUE ? null : v;
}

export function NullableSelect({
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

export function NullableBoolSelect({
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

export function NullableNumberInput({
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

export function NullableTextInput({
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

export function TagInputField({
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

/**
 * Generic control for a single schema field, dispatched by its `FieldKind`.
 * Handles enums, primitives, string arrays (tags), object arrays (tables),
 * and nested objects. Returns null for unknown kinds.
 */
export function FieldControl({
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

export function ArrayOfObjectsField({
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
                      defaultValue={defaultValue[i]?.[k] ?? null}
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

export function ObjectField({
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

  return (
    // <div
    //   className={`grid gap-1 rounded ${isModified ? "bg-yellow-50 p-1" : ""}`}
    //   style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
    // >
    <div className={cn("flex flex-col gap-4")}>
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
