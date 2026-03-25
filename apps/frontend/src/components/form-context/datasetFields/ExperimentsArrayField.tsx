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
import { useId, useMemo, useRef } from "react";

import { SortableItem } from "../researchFields/SortableItem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyForm = any;

/**
 * Experiment data entry: a key-value pair where value is bilingual.
 * Stored as array internally for editability.
 */
export type ExperimentDataEntry = {
  key: string;
  ja: { text: string; rawHtml: string } | null;
  en: { text: string; rawHtml: string } | null;
};

export type ExperimentItem = {
  header: {
    ja: { text: string; rawHtml: string } | null;
    en: { text: string; rawHtml: string } | null;
  };
  data: ExperimentDataEntry[];
};

const EMPTY_EXPERIMENT: ExperimentItem = {
  header: { ja: null, en: null },
  data: [],
};

const EMPTY_DATA_ENTRY: ExperimentDataEntry = { key: "", ja: null, en: null };

function ExperimentItemForm({
  form,
  index,
}: {
  form: AnyForm;
  index: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-500">Header</span>
        <div className="grid grid-cols-2 gap-2">
          <form.AppField name={`experiments[${index}].header.ja.text`}>
            {(f: AnyForm) => <f.TextField label="Header (JA)" />}
          </form.AppField>
          <form.AppField name={`experiments[${index}].header.en.text`}>
            {(f: AnyForm) => <f.TextField label="Header (EN)" />}
          </form.AppField>
        </div>
      </div>

      {/* Data entries */}
      <form.Field name={`experiments[${index}].data`} mode="array">
        {(dataField: AnyForm) => (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-gray-500">
              Data entries
            </span>
            {(dataField.state.value as ExperimentDataEntry[])?.map(
              (_entry, di) => (
                <div
                  key={di}
                  className="flex items-start gap-2 rounded border p-2 text-xs"
                >
                  <div className="flex flex-1 flex-col gap-1">
                    <form.AppField
                      name={`experiments[${index}].data[${di}].key`}
                    >
                      {(f: AnyForm) => <f.TextField label="Key" />}
                    </form.AppField>
                    <div className="grid grid-cols-2 gap-2">
                      <form.AppField
                        name={`experiments[${index}].data[${di}].ja.text`}
                      >
                        {(f: AnyForm) => <f.TextField label="Value (JA)" />}
                      </form.AppField>
                      <form.AppField
                        name={`experiments[${index}].data[${di}].en.text`}
                      >
                        {(f: AnyForm) => <f.TextField label="Value (EN)" />}
                      </form.AppField>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mt-5 text-gray-400 hover:text-red-500"
                    onClick={() => dataField.removeValue(di)}
                  >
                    ✕
                  </button>
                </div>
              ),
            )}
            <button
              type="button"
              onClick={() => dataField.pushValue({ ...EMPTY_DATA_ENTRY })}
              className="w-full rounded border border-dashed py-1.5 text-xs text-gray-500 hover:bg-gray-50"
            >
              + Add data entry
            </button>
          </div>
        )}
      </form.Field>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ExperimentsSortableList({ form, field }: { form: AnyForm; field: AnyForm }) {
  const dndId = useId();
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const items: ExperimentItem[] = field.state.value ?? [];
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
              title={
                item?.header?.en?.text ??
                item?.header?.ja?.text ??
                ""
              }
              onRemove={() => field.removeValue(i)}
            >
              <ExperimentItemForm form={form} index={i} />
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={() => field.pushValue({ ...EMPTY_EXPERIMENT })}
        className="w-full rounded border border-dashed py-2 text-sm text-gray-500 hover:bg-gray-50"
      >
        + Add experiment
      </button>
    </fieldset>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ExperimentsArrayField({ form }: { form: AnyForm }) {
  return (
    <form.Field name="experiments" mode="array">
      {(field: AnyForm) => (
        <ExperimentsSortableList form={form} field={field} />
      )}
    </form.Field>
  );
}

/**
 * Convert the API `data` Record format to an array of ExperimentDataEntry for form editing.
 */
export function experimentDataToEntries(
  data: Record<string, { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null } | null>,
): ExperimentDataEntry[] {
  return Object.entries(data).map(([key, value]) => ({
    key,
    ja: value?.ja ?? null,
    en: value?.en ?? null,
  }));
}

/**
 * Convert an array of ExperimentDataEntry back to the API Record format.
 */
export function entriesToExperimentData(
  entries: ExperimentDataEntry[],
): Record<string, { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null } | null> {
  return Object.fromEntries(
    entries.map((e) => [
      e.key,
      {
        ja: e.ja ?? null,
        en: e.en ?? null,
      },
    ]),
  );
}
