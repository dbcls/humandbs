import { evaluate, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2, Upload } from "lucide-react";
import { useTranslations } from "use-intl";
import { z } from "zod";

import { useEffect, useRef, useState } from "react";

import { useAppForm } from "@/components/form-context/FormContext";
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveMoldataKeys } from "@/config/moldataKeyCatalog";
import { shouldOfferCustomMoldataKey } from "@/config/moldataKeyMatching";
import type { MoldataKeyCatalog } from "@/repositories/moldataKeyCatalog";
import {
  $createMoldataKeyCatalogEntry,
  getMoldataKeyCatalogQueryOptions,
} from "@/serverFunctions/moldataKeyCatalog";
import useConfirmationStore from "@/stores/confirmationStore";
import type { LegacyRawHtmlLookup } from "@/utils/renderedHtml/legacyRawHtml";
import { experimentDataFieldKey, getLegacyRawHtml } from "@/utils/renderedHtml/legacyRawHtml";
import type { DeepOmit } from "@/utils/type-utils";

import type { SearchableExperimentFields } from "../../../../../backend/src/crawler/types/structured";
import { MarkdownTextEditor } from "../fields/MarkdownTextEditor";
import { SearchableFields } from "./SearchableFields";

type AnyForm = any;

const CREATE_MOLDATA_KEY = "__create-moldata-key__";
const EMPTY_CATALOG: MoldataKeyCatalog = { revision: 0, entries: [] };

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
  legacyRawHtml,
}: {
  form: AnyForm;
  experimentIndex: number;
  dataField: AnyForm;
  initialEntries: ExperimentDataEntry[];
  legacyRawHtml?: LegacyRawHtmlLookup;
}) {
  const tMoldataKeys = useTranslations("admin.moldata-keys");
  const entries: ExperimentDataEntry[] = dataField.state.value ?? [];
  const queryClient = useQueryClient();
  const { data: catalogData } = useQuery(getMoldataKeyCatalogQueryOptions());
  const catalog = catalogData ?? EMPTY_CATALOG;
  const { mutateAsync: createCatalogEntry } = useMutation({
    mutationFn: $createMoldataKeyCatalogEntry,
  });
  const sortedEntries = resolveMoldataKeys(
    Object.fromEntries(entries.map((entry, index) => [entry.key, { entry, index }])),
    catalog,
    "en",
  ).map(({ value }) => value);
  const usedKeys = new Set(entries.map((e: ExperimentDataEntry) => e.key));

  const availableKeys = catalog.entries.filter((entry) => !usedKeys.has(entry.english));
  const [inputValue, setInputValue] = useState("");
  const [addedKeyToScrollTo, setAddedKeyToScrollTo] = useState<string | null>(null);
  const [customKeyDialogEnglish, setCustomKeyDialogEnglish] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const customKey = inputValue.trim();
  const hasCustomKey = shouldOfferCustomMoldataKey(
    inputValue,
    usedKeys,
    catalog.entries.map((entry) => entry.english),
  );
  const filteredAvailableKeys = availableKeys.filter((entry) =>
    entry.english.toLowerCase().includes(inputValue.toLowerCase()),
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const entryRowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const jaTextareaRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const openConfirmation = useConfirmationStore((s) => s.openConfirmation);

  useEffect(() => {
    if (!addedKeyToScrollTo) return;

    const addedRow = entryRowRefs.current.get(addedKeyToScrollTo);
    if (!addedRow) return;

    addedRow.scrollIntoView({ behavior: "smooth", block: "center" });
    jaTextareaRefs.current.get(addedKeyToScrollTo)?.focus({ preventScroll: true });
    setAddedKeyToScrollTo(null);
  }, [addedKeyToScrollTo]);

  function handleAddKey(key: string) {
    const normalizedKey = key.trim();
    if (!normalizedKey || usedKeys.has(normalizedKey)) return;
    dataField.pushValue(newDataEntry(normalizedKey));
    setAddedKeyToScrollTo(normalizedKey);
    setInputValue("");
  }

  function handleKeySelection(key: string | null) {
    if (!key) return;
    if (key === CREATE_MOLDATA_KEY) {
      setCustomKeyDialogEnglish(customKey);
      return;
    }
    handleAddKey(key);
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

  async function normalizeImportedKeys(keys: string[]) {
    let currentCatalog = catalog;
    const normalizedKeys: string[] = [];

    for (const rawKey of keys) {
      const english = rawKey.trim();
      if (!english) continue;

      const existing = currentCatalog.entries.find(
        (entry) => entry.english.toLowerCase() === english.toLowerCase(),
      );
      if (existing) {
        normalizedKeys.push(existing.english);
        continue;
      }

      const result = await createCatalogEntry({
        data: { english, japanese: english, expectedRevision: currentCatalog.revision },
      });
      if (!result.ok) {
        setImportError(result.error);
        return;
      }

      currentCatalog = {
        revision: result.data.revision,
        entries: [...currentCatalog.entries, result.data.entry],
      };
      normalizedKeys.push(result.data.entry.english);
    }

    queryClient.setQueryData(["moldata-key-catalog"], currentCatalog);
    setImportError(null);
    applyKeys([...new Set(normalizedKeys)]);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = async (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.target?.result as string);
      } catch {
        return;
      }
      if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) {
        return;
      }
      const currentEntries: ExperimentDataEntry[] =
        form.store.state.values?.experiments?.[experimentIndex]?.data ?? [];
      if (currentEntries.length > 0) {
        openConfirmation({
          title: tMoldataKeys("reset-entries-title"),
          description: tMoldataKeys("reset-entries-description"),
          actionLabel: tMoldataKeys("reset-entries-action"),
          onAction: () => normalizeImportedKeys(parsed),
        });
      } else {
        await normalizeImportedKeys(parsed);
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
      {importError && (
        <p role="alert" className="text-danger text-xs">
          {importError}
        </p>
      )}

      {entries.length > 0 && (
        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className="border-form-divider border-b text-left text-form-sublabel">
              <th className="w-48 pr-3 pb-2 font-medium">Key</th>
              <th className="pr-3 pb-2 font-medium">En</th>
              <th className="pr-3 pb-2 font-medium">Ja</th>
              <th className="w-6 pb-2" />
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map(({ entry, index: di }) => {
              const isKnown = catalog.entries.some(
                (catalogEntry) => catalogEntry.english === entry.key,
              );

              return (
                <tr
                  key={`${experimentIndex}-${entry.key}`}
                  ref={(row) => {
                    if (row) entryRowRefs.current.set(entry.key, row);
                    else entryRowRefs.current.delete(entry.key);
                  }}
                  className="border-form-divider border-b last:border-0"
                >
                  <td className="py-2 pr-3 align-middle">
                    {
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <MoldataKeyLabel moldataKey={entry.key} catalog={catalog} />
                        {!isKnown ? (
                          <>
                            <span className="rounded bg-amber-100 px-1 text-amber-700">
                              unknown
                            </span>
                            <Button
                              type="button"
                              variant="plain"
                              className="h-auto px-0 text-xs"
                              onClick={() => setCustomKeyDialogEnglish(entry.key)}
                            >
                              Add to catalog
                            </Button>
                          </>
                        ) : null}
                      </span>
                    }
                  </td>
                  <td className="py-2 pr-3 align-top">
                    <form.AppField name={`experiments[${experimentIndex}].data[${di}].en.text`}>
                      {(f: AnyForm) => (
                        <div className="relative">
                          <MarkdownTextEditor
                            value={(f.state.value as string | undefined) ?? ""}
                            onChange={(next) => f.handleChange(next)}
                            onBlur={() => f.handleBlur()}
                            placeholder="En"
                            fieldLabel={`${entry.key} (en)`}
                            modified={isFieldModified(f)}
                            legacyRawHtml={getLegacyRawHtml(
                              legacyRawHtml,
                              experimentDataFieldKey(experimentIndex, entry.key),
                              "en",
                            )}
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
                  <td className="py-2 pr-3 align-top">
                    <form.AppField name={`experiments[${experimentIndex}].data[${di}].ja.text`}>
                      {(f: AnyForm) => (
                        <div className="relative">
                          <MarkdownTextEditor
                            ref={(textarea) => {
                              if (textarea) jaTextareaRefs.current.set(entry.key, textarea);
                              else jaTextareaRefs.current.delete(entry.key);
                            }}
                            value={(f.state.value as string | undefined) ?? ""}
                            onChange={(next) => f.handleChange(next)}
                            onBlur={() => f.handleBlur()}
                            placeholder="Ja"
                            fieldLabel={`${entry.key} (ja)`}
                            modified={isFieldModified(f)}
                            legacyRawHtml={getLegacyRawHtml(
                              legacyRawHtml,
                              experimentDataFieldKey(experimentIndex, entry.key),
                              "ja",
                            )}
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

      <Combobox
        value={null}
        onValueChange={handleKeySelection}
        onInputValueChange={(value) => setInputValue(value)}
      >
        <ComboboxInput placeholder="Add a moldata key..." />
        <ComboboxContent>
          <ComboboxList>
            {filteredAvailableKeys.map((entry) => (
              <ComboboxItem key={entry.id} value={entry.english}>
                <MoldataKeyLabel moldataKey={entry.english} catalog={catalog} />
              </ComboboxItem>
            ))}
            {hasCustomKey && (
              <ComboboxItem value={CREATE_MOLDATA_KEY}>
                Add custom key: <span className="font-medium">{customKey}</span>
              </ComboboxItem>
            )}
            {filteredAvailableKeys.length === 0 && !hasCustomKey && (
              <ComboboxEmpty>No items found.</ComboboxEmpty>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <CreateMoldataKeyDialog
        open={customKeyDialogEnglish !== null}
        initialEnglish={customKeyDialogEnglish ?? ""}
        onOpenChange={(open) => {
          if (!open) setCustomKeyDialogEnglish(null);
        }}
        onCreate={async ({ english, japanese }) => {
          const result = await createCatalogEntry({
            data: { english, japanese, expectedRevision: catalog.revision },
          });
          if (!result.ok) return result;

          queryClient.setQueryData<MoldataKeyCatalog>(["moldata-key-catalog"], (current) => ({
            revision: result.data.revision,
            entries: [...(current?.entries ?? catalog.entries), result.data.entry],
          }));
          handleAddKey(result.data.entry.english);
          return result;
        }}
      />
    </div>
  );
}

function MoldataKeyLabel({
  moldataKey,
  catalog,
}: {
  moldataKey: string;
  catalog: MoldataKeyCatalog;
}) {
  const label = catalog.entries.find((entry) => entry.english === moldataKey);

  if (!label) return <span className="font-medium text-form-value">{moldataKey}</span>;

  return (
    <span className="font-medium text-form-value">
      {label.english} / <span lang="ja">{label.japanese}</span>
    </span>
  );
}

type CreateMoldataKeyCatalogEntryResult = Awaited<ReturnType<typeof $createMoldataKeyCatalogEntry>>;

function CreateMoldataKeyDialog({
  open,
  initialEnglish,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  initialEnglish: string;
  onOpenChange: (open: boolean) => void;
  onCreate: (values: {
    english: string;
    japanese: string;
  }) => Promise<CreateMoldataKeyCatalogEntryResult>;
}) {
  const tMoldataKeys = useTranslations("admin.moldata-keys");
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { english: initialEnglish, japanese: "" },
    onSubmit: async ({ value }) => {
      setSubmissionError(null);
      const result = await onCreate({
        english: value.english.trim(),
        japanese: value.japanese.trim(),
      });

      if (result.ok) {
        onOpenChange(false);
        return;
      }

      if (result.code === "DUPLICATE") {
        form.setFieldMeta("english", (previous) => ({
          ...previous,
          errorMap: { ...previous.errorMap, onSubmit: result.error },
        }));
      } else {
        setSubmissionError(result.error);
      }
    },
  });

  useEffect(() => {
    if (!open) return;
    setSubmissionError(null);
    form.reset({ english: initialEnglish, japanese: "" });
  }, [form, initialEnglish, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-base">{tMoldataKeys("create-title")}</DialogTitle>
        <DialogDescription>{tMoldataKeys("create-description")}</DialogDescription>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            form.handleSubmit();
          }}
        >
          <form.AppField
            name="english"
            validators={{ onSubmit: z.string().trim().min(1, tMoldataKeys("english-required")) }}
          >
            {(field) => <field.TextField label={tMoldataKeys("english-label")} type="col" />}
          </form.AppField>
          <form.AppField
            name="japanese"
            validators={{ onSubmit: z.string().trim().min(1, tMoldataKeys("japanese-required")) }}
          >
            {(field) => <field.TextField label={tMoldataKeys("japanese-label")} type="col" />}
          </form.AppField>
          {submissionError && (
            <p role="alert" className="text-danger text-sm">
              {submissionError}
            </p>
          )}
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => (
              <Button type="submit" className="self-end" disabled={!canSubmit}>
                {tMoldataKeys("create-action")}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExperimentItemForm({
  form,
  index,
  initialItem,
  legacyRawHtml,
}: {
  form: AnyForm;
  index: number;
  initialItem: ExperimentItem | undefined;
  legacyRawHtml?: LegacyRawHtmlLookup;
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
            legacyRawHtml={legacyRawHtml}
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
  legacyRawHtml,
}: {
  form: AnyForm;
  initialItems: ExperimentItem[];
  legacyRawHtml?: LegacyRawHtmlLookup;
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
            <ExperimentItemForm
              form={form}
              index={index}
              initialItem={initialItem}
              legacyRawHtml={legacyRawHtml}
            />
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
