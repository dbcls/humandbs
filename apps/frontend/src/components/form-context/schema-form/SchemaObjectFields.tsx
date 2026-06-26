import { Label } from "@/components/ui/label";

import { BilingualTextField } from "../fields/BilingualTextField";
import { BilingualTextValueField } from "../fields/BilingualTextValueField";
import URLField from "../research-fields/URLInputPair";
import { detectLeaf } from "./detectLeaf";
import { FieldControl } from "./FieldControl";
import { getFieldKind } from "./getFieldKind";
import { humanize } from "./utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Override for a single key path inside a schema-driven object body. Given the
 * live form, the field's dotted `name`, and a humanized `label`, returns the
 * node to render — bypassing shape detection for that key.
 */
export type FieldOverride = (ctx: { form: any; name: string; label: string }) => React.ReactNode;

/**
 * Renders the fields of a Zod object schema, choosing a widget per key by
 * shape-signature detection (see `detectLeaf`), with a per-key-path override
 * escape hatch. Plain nested objects recurse; primitives and string arrays fall
 * through to the generic `FieldControl`.
 *
 * All widgets bind by field name via `form.AppField`, so field-level
 * modified/reset highlighting (which compares against `form.options.defaultValues`)
 * keeps working automatically.
 *
 * `overrides` keys are paths *relative to* this object (e.g. `"organization.name"`).
 */
export function SchemaObjectFields({
  form,
  baseName,
  schema,
  overrides = {},
  relPath = "",
}: {
  form: any;
  /** Absolute field path of this object on the form (e.g. "dataProvider[0]"). */
  baseName: string;
  /** A Zod object schema (already unwrapped). */
  schema: any;
  /** key-path (relative to this object root) → custom renderer. */
  overrides?: Record<string, FieldOverride>;
  /** Internal: relative path accumulated while recursing into nested objects. */
  relPath?: string;
}) {
  const shape: Record<string, any> = unwrapObject(schema)?._def?.shape ?? {};

  return (
    <div className="flex flex-col gap-3">
      {Object.entries(shape).map(([key, fieldSchema]) => {
        const name = `${baseName}.${key}`;
        const rel = relPath ? `${relPath}.${key}` : key;
        const label = humanize(key);

        const override = overrides[rel];
        if (override) {
          return <div key={key}>{override({ form, name, label })}</div>;
        }

        return (
          <SchemaField
            key={key}
            form={form}
            name={name}
            rel={rel}
            label={label}
            fieldSchema={fieldSchema}
            overrides={overrides}
          />
        );
      })}
    </div>
  );
}

function SchemaField({
  form,
  name,
  rel,
  label,
  fieldSchema,
  overrides,
}: {
  form: any;
  name: string;
  rel: string;
  label: string;
  fieldSchema: any;
  overrides: Record<string, FieldOverride>;
}) {
  const leaf = detectLeaf(fieldSchema);

  if (leaf === "bilingual-text-value") {
    return <BilingualTextValueField form={form} baseName={name} label={label} />;
  }

  if (leaf === "bilingual-text") {
    return <BilingualTextField form={form} baseName={name} label={label} />;
  }

  if (leaf === "bilingual-url-array") {
    return (
      <form.AppField name={name as any}>
        {(f: any) => <f.BilingualURLArrayField label={label} />}
      </form.AppField>
    );
  }

  if (leaf === "bilingual-url-value") {
    return <BilingualUrlValuePair form={form} baseName={name} label={label} />;
  }

  if (leaf === "period") {
    return <PeriodPair form={form} baseName={name} label={label} />;
  }

  // Not a domain leaf — inspect the generic kind.
  const kind = getFieldKind(fieldSchema);

  // Nested plain object → recurse, producing nested field paths.
  if (kind.kind === "object") {
    return (
      <fieldset className="flex flex-col gap-2">
        <Label className="font-medium text-sm">{label}</Label>
        <div className="rounded border border-form-border p-3">
          <SchemaObjectFields
            form={form}
            baseName={name}
            schema={unwrapObject(fieldSchema)}
            overrides={overrides}
            relPath={rel}
          />
        </div>
      </fieldset>
    );
  }

  // Primitive / enum / string-array → generic FieldControl, bound by name.
  return (
    <form.AppField name={name as any}>
      {(f: any) => (
        <div className="flex flex-col gap-1">
          <Label className="text-sm">{label}</Label>
          <FieldControl
            fieldKey={name}
            kind={kind}
            value={f.state.value}
            defaultValue={getDefault(form, name)}
            onChange={(v: any) => f.handleChange(v)}
          />
        </div>
      )}
    </form.AppField>
  );
}

/** Render a `{ ja, en }` pair of single URL items (BilingualUrlValue). */
function BilingualUrlValuePair({
  form,
  baseName,
  label,
}: {
  form: any;
  baseName: string;
  label: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-2">
        <div className="flex-1 font-medium text-form-label text-xs uppercase">En</div>
        <div className="flex-1 font-medium text-form-label text-xs uppercase">Ja</div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <form.AppField name={`${baseName}.en` as any}>{() => <URLField />}</form.AppField>
        </div>
        <div className="flex-1">
          <form.AppField name={`${baseName}.ja` as any}>{() => <URLField />}</form.AppField>
        </div>
      </div>
    </fieldset>
  );
}

/** Render a `{ startDate, endDate }` period as two date fields. */
function PeriodPair({ form, baseName, label }: { form: any; baseName: string; label: string }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-2">
        <div className="flex-1">
          <form.AppField name={`${baseName}.startDate` as any}>
            {(f: any) => <f.DateField label="Start Date" />}
          </form.AppField>
        </div>
        <div className="flex-1">
          <form.AppField name={`${baseName}.endDate` as any}>
            {(f: any) => <f.DateField label="End Date" />}
          </form.AppField>
        </div>
      </div>
    </fieldset>
  );
}

function getDefault(form: any, name: string): unknown {
  // Mirror getFieldDefaultValue without the field instance.
  const parts = name.replace(/\[(\d+)\]/g, ".$1").split(".");
  let v: any = form.options?.defaultValues;
  for (const p of parts) {
    if (v == null) return undefined;
    v = v[p];
  }
  return v;
}

/** Unwrap nullable/optional/default to reach the inner object schema. */
function unwrapObject(schema: any): any {
  let s = schema;
  for (let i = 0; i < 10; i++) {
    const t = s?._def?.type;
    if (t === "nullable" || t === "optional" || t === "default") s = s._def.innerType;
    else break;
  }
  return s;
}
