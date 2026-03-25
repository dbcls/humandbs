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
import { Trash2 } from "lucide-react";
import { useId, useMemo, useRef } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { SortableItem } from "../researchFields/SortableItem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyForm = any;

export const ALLOWED_EXPERIMENT_KEYS = [
  "Materials and Participants",
  "Experimental Method",
  "Platform",
  "Sample Description",
  "Library Construction",
  "Fragmentation",
  "Read Type",
] as const;

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

function newDataEntry(key: string): ExperimentDataEntry {
  return { key, ja: null, en: null };
}

function DataEntriesTable({
  form,
  experimentIndex,
  dataField,
}: {
  form: AnyForm;
  experimentIndex: number;
  dataField: AnyForm;
}) {
  const entries: ExperimentDataEntry[] = dataField.state.value ?? [];
  const usedKeys = new Set(entries.map((e: ExperimentDataEntry) => e.key));
  const availableKeys = ALLOWED_EXPERIMENT_KEYS.filter((k) => !usedKeys.has(k));

  function handleAddKey(key: string) {
    dataField.pushValue(newDataEntry(key));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-gray-500">Data entries</span>

      {entries.length > 0 && (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-1 pr-2 font-medium w-48">Key</th>
              <th className="pb-1 pr-2 font-medium">En</th>
              <th className="pb-1 pr-2 font-medium">Ja</th>
              <th className="pb-1 w-6" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, di) => {
              const isKnown = (ALLOWED_EXPERIMENT_KEYS as readonly string[]).includes(entry.key);
              return (
                <tr key={`${experimentIndex}-${di}`} className="border-b last:border-0">
                  <td className="py-1 pr-2 align-middle">
                    {isKnown ? (
                      <span className="font-medium text-gray-700">{entry.key}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <span className="font-medium text-gray-700">{entry.key}</span>
                        <span className="rounded bg-amber-100 px-1 text-amber-700">unknown</span>
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-2 align-middle">
                    <form.AppField name={`experiments[${experimentIndex}].data[${di}].en.text`}>
                      {(f: AnyForm) => (
                        <input
                          className="h-7 w-full rounded border bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          value={f.state.value ?? ""}
                          onChange={(e) => f.handleChange(e.target.value)}
                          onBlur={() => f.handleBlur()}
                          placeholder="En"
                        />
                      )}
                    </form.AppField>
                  </td>
                  <td className="py-1 pr-2 align-middle">
                    <form.AppField name={`experiments[${experimentIndex}].data[${di}].ja.text`}>
                      {(f: AnyForm) => (
                        <input
                          className="h-7 w-full rounded border bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          value={f.state.value ?? ""}
                          onChange={(e) => f.handleChange(e.target.value)}
                          onBlur={() => f.handleBlur()}
                          placeholder="Ja"
                        />
                      )}
                    </form.AppField>
                  </td>
                  <td className="py-1 align-middle">
                    <button
                      type="button"
                      onClick={() => dataField.removeValue(di)}
                      className="text-gray-400 hover:text-red-500 disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {availableKeys.length > 0 && (
        <Select
          value=""
          onValueChange={(key) => { if (key) handleAddKey(key); }}
        >
          <SelectTrigger className="h-7 w-48 text-xs text-gray-500">
            <SelectValue placeholder="+ Add row…" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {availableKeys.map((key) => (
                <SelectItem key={key} value={key} className="text-xs">
                  {key}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function ExperimentItemForm({
  form,
  index,
}: {
  form: AnyForm;
  index: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Header — bilingual, binding to .text subfields */}
      <Label className="flex flex-col gap-2">
        <span className="text-xs font-medium text-gray-500">Header</span>
        <div className="flex gap-2">
          <form.AppField name={`experiments[${index}].header.en.text`}>
            {(f: AnyForm) => (
              <Input
                value={f.state.value ?? ""}
                onChange={(e) => f.handleChange(e.target.value)}
                onBlur={() => f.handleBlur()}
                placeholder="En"
                className="h-8 flex-1 text-sm"
              />
            )}
          </form.AppField>
          <form.AppField name={`experiments[${index}].header.ja.text`}>
            {(f: AnyForm) => (
              <Input
                value={f.state.value ?? ""}
                onChange={(e) => f.handleChange(e.target.value)}
                onBlur={() => f.handleBlur()}
                placeholder="Ja"
                className="h-8 flex-1 text-sm"
              />
            )}
          </form.AppField>
        </div>
      </Label>

      {/* Data entries table */}
      <form.Field name={`experiments[${index}].data`} mode="array">
        {(dataField: AnyForm) => (
          <DataEntriesTable
            form={form}
            experimentIndex={index}
            dataField={dataField}
          />
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
