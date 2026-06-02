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
import { z } from "zod";

import { useId, useRef } from "react";

import { ResearchDetailSchema } from "@humandbs/backend/types";

import { withFieldGroup } from "@/components/form-context/FormContext";
import { PersonField } from "@/components/form-context/fields/PersonField";
import { useStableSortableIds } from "@/components/form-context/fields/useStableSortableIds";
import { Button } from "@/components/ui/button";

import { SortableItem } from "./SortableItem";

const dataProviderSchema = z.object({
  ...ResearchDetailSchema.shape.dataProvider.element.shape,
});

type Person = z.infer<typeof dataProviderSchema>;

const DataProviderItemForm = withFieldGroup({
  defaultValues: {} as Person,
  render: function Render({ group }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <PersonField form={group as any} baseName="" />;
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DataProviderSortableList({ form, field }: { form: any; field: any }) {
  const dndId = useId();
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const items: Person[] = field.state.value ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialItems: Person[] = (field.form.options.defaultValues as any)?.dataProvider ?? [];
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
              isModified={i >= initialItems.length || !evaluate(item, initialItems[i])}
              onRemove={() => {
                removeItemId(i);
                field.removeValue(i);
              }}
            >
              <DataProviderItemForm
                form={form}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                fields={`dataProvider[${i}]` as any}
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
export function DataProviderArrayField({ form }: { form: any }) {
  return (
    <form.Field name="dataProvider" mode="array">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(field: any) => <DataProviderSortableList form={form} field={field} />}
    </form.Field>
  );
}
