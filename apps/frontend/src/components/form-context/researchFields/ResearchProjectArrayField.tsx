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
import { useId, useMemo, useRef } from "react";
import { z } from "zod";

import { withFieldGroup } from "@/components/form-context/FormContext";
import { ResearchProjectField } from "@/components/form-context/fields/ResearchProjectField";

import { SortableItem } from "./SortableItem";

const researchProjectSchema = z.object({
  ...ResearchDetailSchema.shape.researchProject.element.shape,
});

type ResearchProject = z.infer<typeof researchProjectSchema>;

const ResearchProjectItemForm = withFieldGroup({
  defaultValues: {} as ResearchProject,
  render: function Render({ group }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <ResearchProjectField form={group as any} baseName="" />;
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ResearchProjectSortableList({ form, field }: { form: any; field: any }) {
  const dndId = useId();
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const items: ResearchProject[] = field.state.value ?? [];
  const itemIds = useMemo(
    () => items.map((_: unknown, i: number) => `${dndId}-${i}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.length, dndId],
  );

  function handleDragEnd(event: DragEndEvent) {
    if (fieldsetRef.current?.disabled) return;
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = itemIds.indexOf(String(active.id));
      const newIndex = itemIds.indexOf(String(over.id));
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
              onRemove={() => field.removeValue(i)}
              disabled={fieldsetRef.current?.disabled}
            >
              <ResearchProjectItemForm
                form={form}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                fields={`researchProject[${i}]` as any}
              />
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={() =>
          field.pushValue({
            name: {
              ja: { text: "", rawHtml: "" },
              en: { text: "", rawHtml: "" },
            },
            url: null,
          })
        }
        className="w-full rounded border border-dashed py-2 text-sm text-gray-500 hover:bg-gray-50"
      >
        + Add
      </button>
    </fieldset>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ResearchProjectArrayField({ form }: { form: any }) {
  return (
    <form.Field name="researchProject" mode="array">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(field: any) => (
        <ResearchProjectSortableList form={form} field={field} />
      )}
    </form.Field>
  );
}
