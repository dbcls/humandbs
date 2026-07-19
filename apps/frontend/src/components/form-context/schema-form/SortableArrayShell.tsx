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
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { evaluate, getBy, useStore } from "@tanstack/react-form";

import type { ReactNode } from "react";
import { useId, useRef } from "react";

import { useStableSortableIds } from "@/components/form-context/fields/useStableSortableIds";
import { SortableItem } from "@/components/form-context/research-fields/SortableItem";
import { Button } from "@/components/ui/button";

// TanStack's `form` API is heavily generic; `any` here keeps the shell
// schema-agnostic.
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Reusable scaffolding for a drag-sortable array-of-objects field. Owns the
 * parts every sortable list needs identically — stable item ids, the dnd
 * context, reorder via the field's own `moveValue` (so nested subfields keep
 * their state), the row mapping, and the add button — while leaving the per-row
 * *body*, *title*, and item factories to the caller.
 *
 * Each row subscribes to its *own* item slice via the form store so the title
 * and modified-state recompute on every keystroke in a nested field; the parent
 * array `form.Field` render prop does not re-run on deep child mutations.
 *
 * Consumers (`SortableObjectArrayField`, `ExperimentsArrayField`) mount the
 * array `form.Field` themselves and pass its `field` in, so they can keep their
 * own typed item shape.
 */
export function SortableArrayShell<TItem>({
  form,
  field,
  name,
  initialItems,
  getTitle,
  renderItem,
  newItem,
  duplicateItem,
  addLabel = "+ Add",
}: {
  form: any;
  /** The array-mode `form.Field` instance (mounted by the caller). */
  field: any;
  /** Top-level field path on the form (e.g. "dataProvider", "experiments"). */
  name: string;
  /** Baseline items for the modified comparison, index-aligned with the value. */
  initialItems: TItem[];
  /** Derives the header title shown next to the grip for an item. */
  getTitle: (item: TItem | undefined) => string;
  /** Renders an item's body given its index and (index-aligned) initial value. */
  renderItem: (ctx: {
    index: number;
    item: TItem | undefined;
    initialItem: TItem | undefined;
  }) => ReactNode;
  /** Factory for a blank item appended on "+ Add". */
  newItem: () => TItem;
  /** When provided, each row shows a Duplicate button using this clone factory. */
  duplicateItem?: (item: TItem) => TItem;
  addLabel?: string;
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
  const { itemIds, moveItemId, removeItemId, insertItemId } = useStableSortableIds(
    items.length,
    dndId,
  );

  function handleDragEnd(event: DragEndEvent) {
    if (fieldsetRef.current?.disabled) return;
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = itemIds.indexOf(String(active.id));
      const newIndex = itemIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      moveItemId(oldIndex, newIndex);
      // Use the array field's own `moveValue` so the nested subfields' state and
      // meta travel with their values; `setValue(arrayMove(...))` only swaps the
      // raw array and leaves mounted subfields bound to stale indices.
      field.moveValue(oldIndex, newIndex);
    }
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
          {items.map((_item, i) => (
            <SortableArrayRow
              key={itemIds[i]}
              id={itemIds[i]!}
              form={form}
              name={name}
              index={i}
              initialItem={initialItems[i]}
              isInitial={i < initialItems.length}
              getTitle={getTitle}
              renderItem={renderItem}
              onDuplicate={
                duplicateItem
                  ? () => {
                      insertItemId(i + 1);
                      field.insertValue(i + 1, duplicateItem(field.state.value[i]));
                    }
                  : undefined
              }
              onRemove={() => {
                removeItemId(i);
                field.removeValue(i);
              }}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button type="button" onClick={() => field.pushValue(newItem())} variant={"dashed"}>
        {addLabel}
      </Button>
    </fieldset>
  );
}

function SortableArrayRow<TItem>({
  id,
  form,
  name,
  index,
  initialItem,
  isInitial,
  getTitle,
  renderItem,
  onDuplicate,
  onRemove,
}: {
  id: string;
  form: any;
  name: string;
  index: number;
  initialItem: TItem | undefined;
  isInitial: boolean;
  getTitle: (item: TItem | undefined) => string;
  renderItem: (ctx: {
    index: number;
    item: TItem | undefined;
    initialItem: TItem | undefined;
  }) => ReactNode;
  onDuplicate?: () => void;
  onRemove: () => void;
}) {
  const item: TItem | undefined = useStore(
    form.store,
    (state: any) => getBy(state.values, `${name}[${index}]`) as TItem | undefined,
  );

  return (
    <SortableItem
      id={id}
      index={index}
      title={getTitle(item)}
      isModified={!isInitial || !evaluate(item, initialItem)}
      onDuplicate={onDuplicate}
      onRemove={onRemove}
    >
      {renderItem({ index, item, initialItem })}
    </SortableItem>
  );
}
