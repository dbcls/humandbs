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
import { PersonField } from "@/components/form-context/fields/PersonField";
import { useStableSortableIds } from "@/components/form-context/fields/useStableSortableIds";
import { deepEqual } from "@/components/form-context/fields/useFieldModified";

import { SortableItem } from "./SortableItem";
import { Button } from "@/components/ui/button";

const controlledAccessUserSchema = z.object({
  ...ResearchDetailSchema.shape.controlledAccessUser.element.shape,
});

type ControlledAccessUser = z.infer<typeof controlledAccessUserSchema>;

const ControlledAccessUserItemForm = withFieldGroup({
  defaultValues: {} as ControlledAccessUser,
  render: function Render({ group }) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <PersonField form={group as any} baseName="" withPeriodOfDataUse />
    );
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ControlledAccessUserSortableList({
  form,
  field,
}: {
  form: any;
  field: any;
}) {
  const dndId = useId();
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const items: ControlledAccessUser[] = field.state.value ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialItems: ControlledAccessUser[] =
    (field.form.options.defaultValues as any)?.controlledAccessUser ?? [];
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
              title={item?.name?.en?.text ?? item?.name?.ja?.text ?? ""}
              isModified={
                i >= initialItems.length || !deepEqual(item, initialItems[i])
              }
              onRemove={() => {
                removeItemId(i);
                field.removeValue(i);
              }}
            >
              <ControlledAccessUserItemForm
                form={form}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                fields={`controlledAccessUser[${i}]` as any}
              />
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>
      <Button
        type="button"
        onClick={() =>
          field.pushValue({
            name: {
              ja: { text: "", rawHtml: "" },
              en: { text: "", rawHtml: "" },
            },
            email: null,
            orcid: null,
            organization: null,
            periodOfDataUse: { startDate: null, endDate: null },
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
export function ControlledAccessUserArrayField({ form }: { form: any }) {
  return (
    <form.Field name="controlledAccessUser" mode="array">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(field: any) => (
        <ControlledAccessUserSortableList form={form} field={field} />
      )}
    </form.Field>
  );
}
