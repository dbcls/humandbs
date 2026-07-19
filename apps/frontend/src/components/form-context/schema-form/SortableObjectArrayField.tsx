import type { ReactNode } from "react";

import { buildEmpty } from "./buildEmpty";
import type { FieldOverride } from "./SchemaObjectFields";
import { SchemaObjectFields } from "./SchemaObjectFields";
import { SortableArrayShell } from "./SortableArrayShell";

// TanStack's `form` API is heavily generic; `any` here keeps the component
// schema-agnostic.
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Generic drag-sortable array-of-objects field whose item body is generated
 * from the array's *element schema* (see `SchemaObjectFields`) — no hardcoded
 * field list. New items are built from the schema via `buildEmpty`.
 *
 * The sortable scaffolding (ids, dnd, reorder, add/remove, live title) lives in
 * `SortableArrayShell`; this component only supplies the schema-driven body.
 *
 * Per-key overrides and the item header title come through props so each section
 * (data providers, grants, …) is fully described by config + schema.
 */
export function SortableObjectArrayField<TItem = any>({
  form,
  name,
  elementSchema,
  overrides,
  emptyItem,
  getTitle,
  renderItemExtra,
  addLabel = "+ Add",
}: {
  form: any;
  /** Top-level field name on the form (e.g. "dataProvider"). */
  name: string;
  /** Zod schema for a single array element; drives the generated item body. */
  elementSchema: any;
  /** Per-key-path override renderers passed through to `SchemaObjectFields`. */
  overrides?: Record<string, FieldOverride>;
  /** Optional blank-item factory; defaults to `buildEmpty(elementSchema)`. */
  emptyItem?: () => TItem;
  /** Derives the header title shown for an item. */
  getTitle: (item: TItem | undefined) => string;
  /** Optional extra content rendered below an item's body (e.g. read-only chips). */
  renderItemExtra?: (item: TItem | undefined) => ReactNode;
  addLabel?: string;
}) {
  return (
    <form.Field name={name} mode="array">
      {(field: any) => (
        <SortableArrayShell<TItem>
          form={form}
          field={field}
          name={name}
          initialItems={(field.form.options.defaultValues as any)?.[name] ?? []}
          getTitle={getTitle}
          newItem={() => (emptyItem ? emptyItem() : (buildEmpty(elementSchema) as TItem))}
          addLabel={addLabel}
          renderItem={({ index, item }) => (
            <>
              <SchemaObjectFields
                form={form}
                baseName={`${name}[${index}]`}
                schema={elementSchema}
                overrides={overrides}
              />
              {renderItemExtra?.(item)}
            </>
          )}
        />
      )}
    </form.Field>
  );
}
