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
import { PublicationField } from "@/components/form-context/fields/PublicationField";
import { useStableSortableIds } from "@/components/form-context/fields/useStableSortableIds";
import { deepEqual } from "@/components/form-context/fields/useFieldModified";

import { SortableItem } from "./SortableItem";
import { Button } from "@/components/ui/button";

const relatedPublicationSchema = z.object({
  ...ResearchDetailSchema.shape.relatedPublication.element.shape,
});

type RelatedPublication = z.infer<typeof relatedPublicationSchema>;

const RelatedPublicationItemForm = withFieldGroup({
  defaultValues: {} as RelatedPublication,
  render: function Render({ group }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <PublicationField form={group as any} baseName="" />;
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RelatedPublicationSortableList({
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

  const items: RelatedPublication[] = field.state.value ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialItems: RelatedPublication[] =
    (field.form.options.defaultValues as any)?.relatedPublication ?? [];
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
              <RelatedPublicationItemForm
                form={form}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                fields={`relatedPublication[${i}]` as any}
              />
              {item?.datasetIds && item.datasetIds.length > 0 && (
                <div className="mt-3 flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-500">
                    Dataset IDs
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {item.datasetIds.map((id) => (
                      <span
                        key={id}
                        className="font-mono text-xs text-gray-700"
                      >
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>
      <Button
        type="button"
        onClick={() =>
          field.pushValue({ title: { ja: null, en: null }, doi: null })
        }
        variant={"dashed"}
      >
        + Add
      </Button>
    </fieldset>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RelatedPublicationArrayField({ form }: { form: any }) {
  return (
    <form.Field name="relatedPublication" mode="array">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(field: any) => (
        <RelatedPublicationSortableList form={form} field={field} />
      )}
    </form.Field>
  );
}
