import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";

import { ModifiedTag } from "./ModifiedTag";
import { useStableSortableIds } from "./useStableSortableIds";
import { deepEqual } from "./useFieldModified";

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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded border bg-white shadow-sm"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <button
          type="button"
          className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="flex-1 text-sm font-medium">
          #{index + 1} {icon} {title}
        </span>
        <ModifiedTag isModified={isModified} />
        <button
          type="button"
          onClick={onRemove}
          className="text-gray-400 hover:text-red-500"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="p-3">{children}</div>
    </div>
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
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <form.AppField name={name} mode="array">
      {(field: AnyForm) => {
        const items: T[] = field.state.value ?? [];
        const { itemIds, moveItemId, removeItemId } = useStableSortableIds(
          items.length,
          dndId,
        );

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
            {label && (
              <legend className="text-sm font-semibold">{label}</legend>
            )}
            <DndContext
              id={dndId}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={itemIds}
                strategy={verticalListSortingStrategy}
              >
                {items.map((_item: T, i: number) => {
                  const isItemModified = initialItems
                    ? i >= initialItems.length ||
                      !deepEqual(_item, initialItems[i])
                    : false;

                  return (
                    <SortableItem
                      key={itemIds[i]}
                      id={itemIds[i]}
                      index={i}
                      icon={icon}
                      title={
                        getItemTitle
                          ? getItemTitle(_item, i)
                          : `Item ${i + 1}`
                      }
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
      }}
    </form.AppField>
  );
}
