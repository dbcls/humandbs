import { evaluate, useStore } from "@tanstack/react-form";
import { Download, Trash2, Upload } from "lucide-react";

import { useRef } from "react";

import { ResetFieldButton } from "@/components/form-context/fields/ResetFieldButton";
import {
  getFieldDefaultValue,
  isFieldModified,
} from "@/components/form-context/fields/useFieldModified";
import { SortableArrayShell } from "@/components/form-context/schema-form/SortableArrayShell";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ALLOWED_MOLDATA_KEYS from "@/config/moldataKeys.json";
import useConfirmationStore from "@/stores/confirmationStore";
import type { DeepOmit } from "@/utils/type-utils";

import type { SearchableExperimentFields } from "../../../../../backend/src/crawler/types/structured";
import { SearchableFields } from "./SearchableFields";

type AnyForm = any;

/**
 * Experiment data entry: a key-value pair where value is bilingual.
 * Stored as array internally for editability.
 */
export type ExperimentDataEntry = {
  key: string;
  ja: { text: string } | null;
  en: { text: string } | null;
};

export type ExperimentItem = {
  header: {
    ja: { text: string } | null;
    en: { text: string } | null;
  };
  data: DeepOmit<ExperimentDataEntry[], "rawHtml">;
  searchable?: SearchableExperimentFields;
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
  initialEntries,
}: {
  form: AnyForm;
  experimentIndex: number;
  dataField: AnyForm;
  initialEntries: ExperimentDataEntry[];
}) {
  const entries: ExperimentDataEntry[] = dataField.state.value ?? [];
  const usedKeys = new Set(entries.map((e: ExperimentDataEntry) => e.key));

  const availableKeys = ALLOWED_MOLDATA_KEYS.filter((k) => !usedKeys.has(k));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const openConfirmation = useConfirmationStore((s) => s.openConfirmation);

  function handleAddKey(key: string) {
    dataField.pushValue(newDataEntry(key));
  }

  function handleDownload() {
    const keys = entries.map((e: ExperimentDataEntry) => e.key);
    const blob = new Blob([JSON.stringify(keys, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "moldata-keys.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function applyKeys(keys: string[]) {
    form.setFieldValue(`experiments[${experimentIndex}].data`, keys.map(newDataEntry));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.target?.result as string);
      } catch {
        return;
      }
      if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) {
        return;
      }
      const validKeys = parsed.filter((k) =>
        (ALLOWED_MOLDATA_KEYS as readonly string[]).includes(k),
      );

      const currentEntries: ExperimentDataEntry[] =
        form.store.state.values?.experiments?.[experimentIndex]?.data ?? [];
      if (currentEntries.length > 0) {
        openConfirmation({
          title: "Reset moldata entries?",
          description:
            "There are existing entries in this list. Are you sure you want to reset existing entries?",
          actionLabel: "Reset",
          onAction: () => applyKeys(validKeys),
        });
      } else {
        applyKeys(validKeys);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-1">
        <span className="flex-1 font-medium text-form-label text-xs">Moldata entries</span>
        {entries.length > 0 && (
          <Button
            type="button"
            variant={"ghost"}
            size={"icon"}
            onClick={handleDownload}
            className="text-form-icon-btn hover:text-form-icon-btn-hover"
            title="Download keys as JSON"
          >
            <Download className="size-4" />
          </Button>
        )}
        <Button
          type="button"
          variant={"ghost"}
          size={"icon"}
          onClick={() => fileInputRef.current?.click()}
          className="text-form-icon-btn hover:text-form-icon-btn-hover"
          title="Upload keys from JSON"
        >
          <Upload className="size-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {entries.length > 0 && (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-form-divider border-b text-left text-form-sublabel">
              <th className="w-48 pr-3 pb-2 font-medium">Key</th>
              <th className="pr-3 pb-2 font-medium">En</th>
              <th className="pr-3 pb-2 font-medium">Ja</th>
              <th className="w-6 pb-2" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, di) => {
              const isKnown = (ALLOWED_MOLDATA_KEYS as readonly string[]).includes(entry.key);

              return (
                <tr
                  key={`${experimentIndex}-${di}`}
                  className="border-form-divider border-b last:border-0"
                >
                  <td className="py-2 pr-3 align-middle">
                    {isKnown ? (
                      <span className="font-medium text-form-value">{entry.key}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <span className="font-medium text-form-value">{entry.key}</span>
                        <span className="rounded bg-amber-100 px-1 text-amber-700">unknown</span>
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 align-middle">
                    <form.AppField name={`experiments[${experimentIndex}].data[${di}].en.text`}>
                      {(f: AnyForm) => (
                        <div className="relative flex items-center">
                          <Input
                            value={f.state.value ?? ""}
                            onChange={(e) => f.handleChange(e.target.value)}
                            onBlur={() => f.handleBlur()}
                            placeholder="En"
                            className={`h-8 ${isFieldModified(f) ? "modified-field" : ""}`}
                          />
                          {isFieldModified(f) && (
                            <ResetFieldButton
                              onClick={() =>
                                f.handleChange((getFieldDefaultValue(f) as string) ?? null)
                              }
                            />
                          )}
                        </div>
                      )}
                    </form.AppField>
                  </td>
                  <td className="py-2 pr-3 align-middle">
                    <form.AppField name={`experiments[${experimentIndex}].data[${di}].ja.text`}>
                      {(f: AnyForm) => (
                        <div className="relative flex items-center">
                          <Input
                            value={f.state.value ?? ""}
                            onChange={(e) => f.handleChange(e.target.value)}
                            onBlur={() => f.handleBlur()}
                            placeholder="Ja"
                            className={`h-8 ${isFieldModified(f) ? "modified-field" : ""}`}
                          />
                          {isFieldModified(f) && (
                            <ResetFieldButton
                              onClick={() =>
                                f.handleChange((getFieldDefaultValue(f) as string) ?? null)
                              }
                            />
                          )}
                        </div>
                      )}
                    </form.AppField>
                  </td>
                  <td className="py-2 align-middle">
                    <button
                      type="button"
                      onClick={() => dataField.removeValue(di)}
                      className="text-form-icon-btn hover:text-red-500 disabled:pointer-events-none disabled:opacity-50"
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
        <Combobox
          items={availableKeys}
          value={null}
          onValueChange={(key: string | null) => key && handleAddKey(key)}
        >
          <ComboboxInput placeholder="Add a moldata key..." />
          <ComboboxContent>
            <ComboboxEmpty>No items found.</ComboboxEmpty>
            <ComboboxList>
              {(item) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      )}
    </div>
  );
}

function ExperimentItemForm({
  form,
  index,
  initialItem,
}: {
  form: AnyForm;
  index: number;
  initialItem: ExperimentItem | undefined;
}) {
  const initialEntries = initialItem?.data ?? [];

  // Track current header values to highlight modified inputs
  const currentEnText = useStore(
    form.store,
    (state: AnyForm) => state.values?.experiments?.[index]?.header?.en?.text ?? "",
  );
  const currentJaText = useStore(
    form.store,
    (state: AnyForm) => state.values?.experiments?.[index]?.header?.ja?.text ?? "",
  );
  const isHeaderEnModified = !evaluate(
    currentEnText || null,
    initialItem?.header?.en?.text ?? null,
  );
  const isHeaderJaModified = !evaluate(
    currentJaText || null,
    initialItem?.header?.ja?.text ?? null,
  );

  return (
    <div className="flex flex-col items-start gap-3">
      {/* Header — bilingual, binding to .text subfields */}
      <Label className="flex w-full flex-col items-start gap-2">
        <span className="font-medium text-form-label text-xs">Header</span>
        <div className="flex w-full gap-2">
          <form.AppField name={`experiments[${index}].header.en.text`}>
            {(f: AnyForm) => (
              <Input
                value={f.state.value ?? ""}
                onChange={(e) => f.handleChange(e.target.value)}
                onBlur={() => f.handleBlur()}
                placeholder="En"
                className={`h-8 flex-1 text-sm ${isHeaderEnModified ? "bg-yellow-50" : ""}`}
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
                className={`h-8 flex-1 text-sm ${isHeaderJaModified ? "bg-yellow-50" : ""}`}
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
            initialEntries={initialEntries}
          />
        )}
      </form.Field>

      {/* Searchable fields */}
      <SearchableFields form={form} experimentIndex={index} />
    </div>
  );
}

/**
 * Experiments are a sortable array of bespoke item bodies (header + moldata
 * table + searchable fields), so the dnd/list scaffolding comes from the shared
 * `SortableArrayShell` and only the item body (`ExperimentItemForm`) and the
 * header-title accessor are experiment-specific.
 */
export function ExperimentsArrayField({
  form,
  initialItems,
}: {
  form: AnyForm;
  initialItems: ExperimentItem[];
}) {
  return (
    <form.Field name="experiments" mode="array">
      {(field: AnyForm) => (
        <SortableArrayShell<ExperimentItem>
          form={form}
          field={field}
          name="experiments"
          initialItems={initialItems}
          getTitle={(item) => item?.header?.en?.text ?? item?.header?.ja?.text ?? ""}
          newItem={() => ({ ...EMPTY_EXPERIMENT })}
          duplicateItem={(item) => structuredClone(item)}
          addLabel="+ Add experiment"
          renderItem={({ index, initialItem }) => (
            <ExperimentItemForm form={form} index={index} initialItem={initialItem} />
          )}
        />
      )}
    </form.Field>
  );
}

/**
 * Convert the API `data` Record format to an array of ExperimentDataEntry for form editing.
 */
export function experimentDataToEntries(
  data: Record<
    string,
    {
      ja: { text: string; rawHtml: string } | null;
      en: { text: string; rawHtml: string } | null;
    } | null
  >,
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
export function entriesToExperimentData(entries: ExperimentDataEntry[]): Record<
  string,
  {
    ja: { text: string } | null;
    en: { text: string } | null;
  } | null
> {
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
