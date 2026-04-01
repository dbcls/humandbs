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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ResearchDetailSchema } from "@humandbs/backend/types";
import { useId, useRef } from "react";
import { z } from "zod";

import { withFieldGroup } from "@/components/form-context/FormContext";
import { GrantField } from "@/components/form-context/fields/GrantField";
import { useStableSortableIds } from "@/components/form-context/fields/useStableSortableIds";
import { deepEqual } from "@/components/form-context/fields/useFieldModified";

import { SortableItem } from "./SortableItem";
import { Button } from "@/components/ui/button";

const grantSchema = z.object({
  ...ResearchDetailSchema.shape.grant.element.shape,
});

type Grant = z.infer<typeof grantSchema>;

const GrantItemForm = withFieldGroup({
  defaultValues: {} as Grant,
  render: function Render({ group }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <GrantField form={group as any} baseName="" />;
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GrantSortableList({ form, field }: { form: any; field: any }) {
  const dndId = useId();
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const items: Grant[] = field.state.value ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialItems: Grant[] =
    (field.form.options.defaultValues as any)?.grant ?? [];
  const { itemIds, moveItemId, removeItemId } = useStableSortableIds(
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
      field.setValue(arrayMove([...items], oldIndex, newIndex));
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
          {items.map((item, i) => (
            <SortableItem
              key={itemIds[i]}
              id={itemIds[i]!}
              index={i}
              title={item?.title?.en ?? item?.title?.ja ?? ""}
              isModified={
                i >= initialItems.length || !deepEqual(item, initialItems[i])
              }
              onRemove={() => {
                removeItemId(i);
                field.removeValue(i);
              }}
            >
              <GrantItemForm
                form={form}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                fields={`grant[${i}]` as any}
              />
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>
      <Button
        type="button"
        onClick={() =>
          field.pushValue({
            id: [],
            title: { ja: "", en: "" },
            agency: { name: { ja: "", en: "" } },
          })
        }
        variant={"dashed"}
      >
        + Add
      </Button>
    </fieldset>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function GrantArrayField({ form }: { form: any }) {
  return (
    <form.Field name="grant" mode="array">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(field: any) => <GrantSortableList form={form} field={field} />}
    </form.Field>
  );
}
