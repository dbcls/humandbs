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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { evaluate } from "@tanstack/react-form";
import { GripVertical, Trash2 } from "lucide-react";

import { useId } from "react";

import { Button } from "@/components/ui/button";

import { ModifiedTag } from "./ModifiedTag";
import { useStableSortableIds } from "./useStableSortableIds";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyForm = any;

interface ArrayFieldProps<T> {
  form: AnyForm;
  name: string;
  defaultItem: () => T;
  renderItem: (index: number) => React.ReactNode;
  icon?: string;
  getItemTitle?: (item: T, index: number) => string;
  label?: string;
  initialItems?: T[];
}

interface SortableItemProps {
  id: string;
  index: number;
  icon?: string;
  title: string;
  isModified: boolean;
  onRemove: () => void;
  children: React.ReactNode;
}

function SortableItem({
  id,
  index,
  icon,
  title,
  isModified,
  onRemove,
  children,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded border bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <button
          type="button"
          className="cursor-grab touch-none text-form-icon-btn hover:text-form-icon-btn-hover"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="flex-1 font-medium text-sm">
          #{index + 1} {icon} {title}
        </span>
        <ModifiedTag isModified={isModified} />
        <button type="button" onClick={onRemove} className="text-form-icon-btn hover:text-red-500">
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

type ArrayFieldInnerProps<T> = Pick<
  ArrayFieldProps<T>,
  "defaultItem" | "renderItem" | "icon" | "getItemTitle" | "label" | "initialItems"
> & {
  field: AnyForm;
  dndId: string;
};

function ArrayFieldInner<T>({
  field,
  dndId,
  defaultItem,
  renderItem,
  icon,
  getItemTitle,
  label,
  initialItems,
}: ArrayFieldInnerProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const items: T[] = field.state.value ?? [];
  const { itemIds, moveItemId, removeItemId } = useStableSortableIds(items.length, dndId);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = itemIds.indexOf(String(active.id));
      const newIndex = itemIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = arrayMove([...items], oldIndex, newIndex);
      moveItemId(oldIndex, newIndex);
      // Replace entire array with reordered version
      field.setValue(reordered);
    }
  }

  return (
    <fieldset className="flex flex-col gap-3">
      {label && <legend className="font-semibold text-sm">{label}</legend>}
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.map((_item: T, i: number) => {
            const isItemModified = initialItems
              ? i >= initialItems.length || !evaluate(_item, initialItems[i])
              : false;

            return (
              <SortableItem
                key={itemIds[i]}
                id={itemIds[i]}
                index={i}
                icon={icon}
                title={getItemTitle ? getItemTitle(_item, i) : `Item ${i + 1}`}
                isModified={isItemModified}
                onRemove={() => {
                  removeItemId(i);
                  field.removeValue(i);
                }}
              >
                {renderItem(i)}
              </SortableItem>
            );
          })}
        </SortableContext>
      </DndContext>
      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed"
        onClick={() => field.pushValue(defaultItem())}
      >
        + Add
      </Button>
    </fieldset>
  );
}

export function ArrayField<T>({
  form,
  name,
  defaultItem,
  renderItem,
  icon,
  getItemTitle,
  label,
  initialItems,
}: ArrayFieldProps<T>) {
  const dndId = useId();

  return (
    <form.AppField name={name} mode="array">
      {(field: AnyForm) => (
        <ArrayFieldInner<T>
          field={field}
          dndId={dndId}
          defaultItem={defaultItem}
          renderItem={renderItem}
          icon={icon}
          getItemTitle={getItemTitle}
          label={label}
          initialItems={initialItems}
        />
      )}
    </form.AppField>
  );
}
