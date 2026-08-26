// biome-ignore-all lint/suspicious/noExplicitAny: "form is any"

import { useTranslations } from "use-intl";

import type { ReactNode } from "react";

import { BilingualTextField } from "@/components/form-context/fields/BilingualTextField";
import { BilingualTextValueField } from "@/components/form-context/fields/BilingualTextValueField";
import { detectLeaf } from "@/components/form-context/schema-form/detectLeaf";
import { FieldControl } from "@/components/form-context/schema-form/FieldControl";
import { getFieldKind } from "@/components/form-context/schema-form/getFieldKind";
import { SchemaObjectFields } from "@/components/form-context/schema-form/SchemaObjectFields";
import { SortableObjectArrayField } from "@/components/form-context/schema-form/SortableObjectArrayField";
import { humanize } from "@/components/form-context/schema-form/utils";
import { TabLabel } from "@/components/form-context/TabLabel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* eslint-disable @typescript-eslint/no-explicit-any */

type SchemaShape = Record<string, unknown>;

export const RESEARCH_METADATA_ORDER = [
  "title",
  "summary",
  "summaryShort",
  "dataProvider",
  "researchProject",
  "grant",
  "relatedPublication",
] as const;

type MetadataField = {
  key: string;
  schema: unknown;
  label: string;
  kind: ReturnType<typeof getFieldKind>;
};

type RenderOverride = (field: {
  form: any;
  name: string;
  schema: unknown;
  label: string;
}) => ReactNode;

/**
 * Schema-driven tabs for research metadata. It deliberately receives a Zod
 * shape rather than importing either request schema, so the create and edit
 * forms share the exact same default rendering path.
 */
export function ResearchMetadataTabs({
  form,
  shape,
  excludedFields,
  renderOverride = {},
  fieldOrder = [],
  dirtyFields = {},
  disabled = false,
  className = "mt-4 flex min-h-0 flex-1 flex-col",
  contentClassName = "min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-5",
}: {
  form: any;
  shape: SchemaShape;
  excludedFields: ReadonlySet<string>;
  renderOverride?: Record<string, RenderOverride>;
  /** Preferred order for known fields; all other schema fields follow in schema order. */
  fieldOrder?: readonly string[];
  dirtyFields?: Record<string, boolean | undefined>;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
}) {
  const tFields = useTranslations("Research.fields");

  const fieldOrderIndex = new Map(fieldOrder.map((key, index) => [key, index]));

  const fields: MetadataField[] = Object.entries(shape)
    .filter(([key]) => !excludedFields.has(key))
    .map(([key, schema], schemaIndex) => ({
      key,
      schema,
      label: translateFieldLabel(tFields, key),
      kind: getFieldKind(schema as { _def: any }),
      order: fieldOrderIndex.get(key) ?? fieldOrder.length + schemaIndex,
    }))
    .sort((a, b) => a.order - b.order);

  return (
    <Tabs defaultValue={fields[0]?.key} className={className}>
      <div className="shrink-0 overflow-x-auto px-5">
        <TabsList variant="line">
          {fields.map((field) => (
            <TabsTrigger key={field.key} variant="line" value={field.key}>
              <TabLabel dirty={Boolean(dirtyFields[field.key])}>{field.label}</TabLabel>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className={contentClassName}>
        <fieldset disabled={disabled} className="group/fieldset">
          {fields.map((field) => (
            <TabsContent key={field.key} value={field.key}>
              {renderOverride[field.key]?.({
                form,
                name: field.key,
                schema: field.schema,
                label: field.label,
              }) ?? <MetadataFieldEditor form={form} field={field} />}
            </TabsContent>
          ))}
        </fieldset>
      </div>
    </Tabs>
  );
}

function MetadataFieldEditor({ form, field }: { form: any; field: MetadataField }) {
  const leaf = detectLeaf(field.schema);

  if (leaf === "bilingual-text") {
    return <BilingualTextField form={form} baseName={field.key} label={field.label} />;
  }

  if (leaf === "bilingual-text-value") {
    return <BilingualTextValueField form={form} baseName={field.key} label={field.label} />;
  }

  if (field.kind.kind === "array" && field.kind.itemKind.kind === "object") {
    return (
      <SortableObjectArrayField
        form={form}
        name={field.key}
        elementSchema={arrayElementSchema(field.schema)}
        getTitle={defaultObjectArrayTitle}
      />
    );
  }

  if (field.kind.kind === "object") {
    return <SchemaObjectFields form={form} baseName={field.key} schema={field.schema} />;
  }

  return (
    <form.AppField name={field.key}>
      {(input: any) => (
        <FieldControl
          fieldKey={field.key}
          kind={field.kind}
          value={input.state.value}
          defaultValue={getDefaultValue(form, field.key)}
          onChange={(value: any) => input.handleChange(value)}
        />
      )}
    </form.AppField>
  );
}

function translateFieldLabel(t: ReturnType<typeof useTranslations>, key: string) {
  const messageKey = `${key}.label` as never;
  return t.has(messageKey) ? t(messageKey) : humanize(key);
}

function arrayElementSchema(schema: unknown): unknown {
  let current = schema as { _def?: { type?: string; innerType?: unknown; element?: unknown } };

  while (["optional", "nullable", "default"].includes(current._def?.type ?? "")) {
    current = current._def?.innerType as typeof current;
  }

  return current._def?.element;
}

function defaultObjectArrayTitle(item: Record<string, any> | undefined): string {
  return item?.name?.en?.text ?? item?.name?.ja?.text ?? item?.title?.en ?? item?.title?.ja ?? "";
}

function getDefaultValue(form: any, name: string): unknown {
  let value = form.options?.defaultValues;
  for (const segment of name.split(".")) {
    if (value == null) return undefined;
    value = value[segment];
  }
  return value;
}
