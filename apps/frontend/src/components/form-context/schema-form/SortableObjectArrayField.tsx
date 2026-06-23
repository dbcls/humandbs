import type { DragEndEvent } from "@dnd-kit/core";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { evaluate } from "@tanstack/react-form";

import type { ReactNode } from "react";
import { useId, useRef } from "react";

import { useStableSortableIds } from "@/components/form-context/fields/useStableSortableIds";
import { SortableItem } from "@/components/form-context/research-fields/SortableItem";
import { Button } from "@/components/ui/button";

import { buildEmpty } from "./buildEmpty";
import type { FieldOverride } from "./SchemaObjectFields";
import { SchemaObjectFields } from "./SchemaObjectFields";

// TanStack's `form` API is heavily generic; `any` here keeps the component
// schema-agnostic.
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Generic drag-sortable array-of-objects field whose item body is generated
 * from the array's *element schema* (see `SchemaObjectFields`) — no hardcoded
 * field list. New items are built from the schema via `buildEmpty`.
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
  getTitle: (item: TItem) => string;
  /** Optional extra content rendered below an item's body (e.g. read-only chips). */
  renderItemExtra?: (item: TItem) => ReactNode;
  addLabel?: string;
}) {
  return (
    <form.Field name={name} mode="array">
      {(field: any) => (
        <SortableList
          form={form}
          field={field}
          name={name}
          elementSchema={elementSchema}
          overrides={overrides}
          emptyItem={emptyItem}
          getTitle={getTitle}
          renderItemExtra={renderItemExtra}
          addLabel={addLabel}
        />
      )}
    </form.Field>
  );
}

function SortableList<TItem>({
  form,
  field,
  name,
  elementSchema,
  overrides,
  emptyItem,
  getTitle,
  renderItemExtra,
  addLabel,
}: {
  form: any;
  field: any;
  name: string;
  elementSchema: any;
  overrides?: Record<string, FieldOverride>;
  emptyItem?: () => TItem;
  getTitle: (item: TItem) => string;
  renderItemExtra?: (item: TItem) => ReactNode;
  addLabel: string;
}) {
  const dndId = useId();
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const items: TItem[] = field.state.value ?? [];
  const initialItems: TItem[] = (field.form.options.defaultValues as any)?.[name] ?? [];
  const { itemIds, moveItemId, removeItemId } = useStableSortableIds(items.length, dndId);

  function handleDragEnd(event: DragEndEvent) {
    if (fieldsetRef.current?.disabled) return;
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = itemIds.indexOf(String(active.id));
      const newIndex = itemIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      moveItemId(oldIndex, newIndex);
      field.setValue(arrayMove([...items], oldIndex, newIndex));
    }
  }

  function addItem() {
    field.pushValue(emptyItem ? emptyItem() : (buildEmpty(elementSchema) as TItem));
  }

  return (
    <fieldset ref={fieldsetRef} className="flex flex-col gap-3">
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.map((item, i) => (
            <SortableItem
              key={itemIds[i]}
              id={itemIds[i]!}
              index={i}
              title={getTitle(item)}
              isModified={i >= initialItems.length || !evaluate(item, initialItems[i])}
              onRemove={() => {
                removeItemId(i);
                field.removeValue(i);
              }}
            >
              <SchemaObjectFields
                form={form}
                baseName={`${name}[${i}]`}
                schema={elementSchema}
                overrides={overrides}
              />
              {renderItemExtra?.(item)}
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>
      <Button type="button" onClick={addItem} variant={"dashed"}>
        {addLabel}
      </Button>
    </fieldset>
  );
}
