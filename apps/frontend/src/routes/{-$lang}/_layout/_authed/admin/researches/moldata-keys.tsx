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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, GripVertical, Trash2 } from "lucide-react";
import { useTranslations } from "use-intl";
import { z } from "zod";

import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import { ResetFieldButton } from "@/components/form-context/fields/ResetFieldButton";
import { InfoBadge } from "@/components/InfoBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MoldataKeyCatalog, MoldataKeyCatalogEntry } from "@/repositories/moldataKeyCatalog";
import {
  $createMoldataKeyCatalogEntry,
  $deleteMoldataKeyCatalogEntry,
  $reorderMoldataKeyCatalogEntries,
  $updateMoldataKeyCatalogEntries,
  getMoldataKeyCatalogQueryOptions,
} from "@/serverFunctions/moldataKeyCatalog";
import useConfirmationStore from "@/stores/confirmationStore";

import { AdminStatusMessage } from "../-components/AdminStatusMessage";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/researches/moldata-keys")({
  component: RouteComponent,
});

// TanStack's form API is heavily generic; `any` keeps the row components
// readable, matching the convention in the other form-context consumers.
// biome-ignore lint/suspicious/noExplicitAny: The shared form hook intentionally exposes generic field APIs.
type AnyForm = any;

type CatalogFormValues = { entries: MoldataKeyCatalogEntry[] };

const emptyCatalogFormValues: CatalogFormValues = { entries: [] };

const requiredEnglish = z.string().trim().min(1, "English is required.");
const requiredJapanese = z.string().trim().min(1, "Japanese is required.");

function sameEntries(left: MoldataKeyCatalogEntry[], right: MoldataKeyCatalogEntry[]) {
  return (
    left.length === right.length &&
    left.every(
      (entry, index) =>
        entry.id === right[index]?.id &&
        entry.english === right[index]?.english &&
        entry.japanese === right[index]?.japanese,
    )
  );
}

/**
 * Uniqueness spans rows, so no single field can validate it — it lives on the
 * array as a whole and is mapped back onto the offending rows' `english`
 * fields, which is what the table actually renders.
 */
const catalogEntriesSchema = z
  .array(z.object({ id: z.string(), english: requiredEnglish, japanese: requiredJapanese }))
  .superRefine((entries, ctx) => {
    const indicesByEnglish = new Map<string, number[]>();
    for (const [index, entry] of entries.entries()) {
      const english = entry.english.trim().toLowerCase();
      if (!english) continue;
      indicesByEnglish.set(english, [...(indicesByEnglish.get(english) ?? []), index]);
    }

    for (const indices of indicesByEnglish.values()) {
      if (indices.length < 2) continue;
      for (const index of indices) {
        ctx.addIssue({
          code: "custom",
          path: [index, "english"],
          message: "English values must be unique.",
        });
      }
    }
  });

function RouteComponent() {
  const tMoldataKeys = useTranslations("admin.moldata-keys");
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery(getMoldataKeyCatalogQueryOptions());
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [revision, setRevision] = useState(0);
  const [savedEntries, setSavedEntries] = useState<MoldataKeyCatalogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const hasInitializedSavedEntries = useRef(false);
  const { openConfirmation } = useConfirmationStore();

  const { mutateAsync: createEntry, isPending: isCreating } = useMutation({
    mutationFn: $createMoldataKeyCatalogEntry,
  });
  const { mutateAsync: saveEntries } = useMutation({
    mutationFn: $updateMoldataKeyCatalogEntries,
  });
  const { mutateAsync: reorderEntries, isPending: isReordering } = useMutation({
    mutationFn: $reorderMoldataKeyCatalogEntries,
  });
  const { mutateAsync: deleteEntry } = useMutation({ mutationFn: $deleteMoldataKeyCatalogEntry });

  // Query data hydrates the form. Displayed modified state uses the separate
  // saved-entry snapshot below, keyed by ID, so it remains stable through form
  // option updates and reordering.
  const form = useAppForm({
    defaultValues: data ? { entries: data.entries } : emptyCatalogFormValues,
    onSubmit: async ({ value, formApi }) => {
      // Validated here rather than via `validators.onSubmit` so the array-level
      // uniqueness issues can be mapped onto the individual rows that the table
      // renders; a form-level validator would only surface them at the root.
      const parsed = catalogEntriesSchema.safeParse(value.entries);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const [index, field] = issue.path;
          if (typeof index !== "number" || typeof field !== "string") continue;
          formApi.setFieldMeta(`entries[${index}].${field}` as never, (previous: AnyForm) => ({
            ...previous,
            errorMap: { ...previous.errorMap, onSubmit: issue.message },
          }));
        }
        return;
      }

      setError(null);
      const result = await saveEntries({
        data: {
          entries: value.entries.map(({ id, english, japanese }) => ({ id, english, japanese })),
          expectedRevision: revision,
        },
      });
      if (!result.ok) return setError(result.error);
      resetCatalog(result.data);
      setMessage("Changes saved.");
    },
  });

  const newEntryForm = useAppForm({
    defaultValues: { english: "", japanese: "" },
    onSubmit: async ({ value, formApi }) => {
      const english = value.english.trim();
      const entries = form.state.values.entries;

      if (entries.some((entry) => entry.english.trim().toLowerCase() === english.toLowerCase())) {
        return formApi.setFieldMeta("english", (previous) => ({
          ...previous,
          errorMap: { ...previous.errorMap, onSubmit: "English values must be unique." },
        }));
      }

      setError(null);
      const result = await createEntry({
        data: { english, japanese: value.japanese.trim(), expectedRevision: revision },
      });
      if (!result.ok) {
        if (result.code === "DUPLICATE") {
          return formApi.setFieldMeta("english", (previous) => ({
            ...previous,
            errorMap: { ...previous.errorMap, onSubmit: result.error },
          }));
        }
        return setError(result.error);
      }

      if (!data) return;
      preserveDraftEntries(
        {
          revision: result.data.revision,
          entries: [...data.entries, result.data.entry],
        },
        [...entries, result.data.entry],
      );
      formApi.reset();
      setMessage("Moldata key added.");
    },
  });

  const entries = useStore(form.store, (state) => state.values.entries);
  const isDirty = useStore(form.store, (state) => state.isDirty);
  const isSaving = useStore(form.store, (state) => state.isSubmitting);
  const canAdd = useStore(
    newEntryForm.store,
    (state) => !!state.values.english.trim() && !!state.values.japanese.trim(),
  );

  const hasLoaded = entries.length > 0 || !!data;
  const savedEntryById = new Map(savedEntries.map((entry) => [entry.id, entry]));

  useEffect(() => {
    if (!data || hasInitializedSavedEntries.current) return;
    setSavedEntries(data.entries);
    setRevision(data.revision);
    hasInitializedSavedEntries.current = true;
  }, [data]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (!error || error.includes("updated by another user")) return;
    const timeout = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [error]);

  function resetCatalog(next: MoldataKeyCatalog) {
    queryClient.setQueryData(["moldata-key-catalog"], next);
    form.reset({ entries: next.entries });
    setSavedEntries(next.entries);
    setRevision(next.revision);
  }

  function preserveDraftEntries(next: MoldataKeyCatalog, currentEntries: MoldataKeyCatalogEntry[]) {
    const currentById = new Map(currentEntries.map((entry) => [entry.id, entry]));
    const entries = next.entries.map((entry) => {
      const current = currentById.get(entry.id);
      return current ? { ...entry, english: current.english, japanese: current.japanese } : entry;
    });

    queryClient.setQueryData(["moldata-key-catalog"], next);
    form.reset({ entries: next.entries });
    // Reordering is already persisted by its dedicated mutation. Avoid writing
    // the identical order back into the form because TanStack marks every
    // setFieldValue call dirty, even when it matches the reset baseline.
    if (!sameEntries(entries, next.entries)) form.setFieldValue("entries", entries);
    setSavedEntries(next.entries);
    setRevision(next.revision);
  }

  if (isPending || !hasLoaded) {
    return (
      <Card className="flex h-full flex-1 flex-col" caption="Moldata keys">
        Loading catalog…
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card className="flex h-full flex-1 flex-col" caption="Moldata keys">
        <AdminStatusMessage>Could not load the moldata key catalog.</AdminStatusMessage>
        <Button className="mt-3" onClick={() => refetch()}>
          Retry
        </Button>
      </Card>
    );
  }

  async function reorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || isReordering) return;

    const currentEntries = form.state.values.entries;
    const oldIndex = currentEntries.findIndex((entry) => entry.id === active.id);
    const newIndex = currentEntries.findIndex((entry) => entry.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(currentEntries, oldIndex, newIndex);
    form.setFieldValue("entries", reordered);
    setError(null);

    const result = await reorderEntries({
      data: { orderedIds: reordered.map((entry) => entry.id), expectedRevision: revision },
    });
    if (!result.ok) return setError(result.error);

    // Keep in-flight label edits, while resetting the order baseline to the
    // server's persisted positions so a successful drop does not leave the
    // form dirty on its own.
    preserveDraftEntries(result.data, reordered);
  }

  function remove(entry: MoldataKeyCatalogEntry) {
    openConfirmation({
      title: tMoldataKeys("delete-title"),
      description: tMoldataKeys("delete-description", { name: entry.english }),
      actionLabel: tMoldataKeys("delete-action"),
      onAction: async () => {
        setError(null);
        const result = await deleteEntry({ data: { id: entry.id, expectedRevision: revision } });
        if (!result.ok) return setError(result.error);
        preserveDraftEntries(
          result.data,
          form.state.values.entries.filter((current) => current.id !== entry.id),
        );
        setMessage("Moldata key deleted.");
      },
    });
  }

  async function reload() {
    setError(null);
    setMessage(null);
    const result = await refetch();
    if (result.data) {
      resetCatalog(result.data);
      newEntryForm.reset();
    }
  }

  return (
    <Card
      className="flex h-full flex-1 flex-col overflow-hidden"
      containerClassName="flex min-h-0 flex-1 flex-col"
      caption="Moldata keys"
    >
      <form
        className="flex min-h-0 flex-1 flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          form.handleSubmit();
        }}
      >
        {error && <AdminStatusMessage>{error}</AdminStatusMessage>}
        {message && <AdminStatusMessage variant="success">{message}</AdminStatusMessage>}

        <div className="flex items-center justify-end gap-2">
          <InfoBadge className="flex-1">{tMoldataKeys("manage-info-badge")}</InfoBadge>
          {error?.includes("updated by another user") && (
            <Button type="button" variant="outline" onClick={reload}>
              Reload catalog
            </Button>
          )}
          <Button type="submit" disabled={!isDirty || isSaving || isReordering}>
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="text-left">
                  <th className="w-10 p-2" />
                  <th className="p-2">English</th>
                  <th className="p-2">Japanese</th>
                  <th />
                </tr>
                <tr>
                  <th className="h-px bg-black p-0" colSpan={4} />
                </tr>
              </thead>
              <tbody>
                <form.Field name="entries" mode="array">
                  {(field: AnyForm) => (
                    <SortableContext
                      items={entries.map((entry) => entry.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {(field.state.value as MoldataKeyCatalogEntry[]).map((entry, index) => (
                        <SortableCatalogRow
                          key={entry.id}
                          form={form}
                          entry={entry}
                          savedEntry={savedEntryById.get(entry.id)}
                          index={index}
                          isReordering={isReordering}
                          onDelete={() => remove(entry)}
                        />
                      ))}
                    </SortableContext>
                  )}
                </form.Field>
              </tbody>
              <tfoot className="sticky -bottom-px z-10 bg-white">
                <tr>
                  <td className="h-px bg-black p-0" colSpan={4} />
                </tr>
                <NewCatalogRow
                  form={newEntryForm}
                  disabled={isCreating || isReordering}
                  canAdd={canAdd && !isCreating && !isReordering}
                />
              </tfoot>
            </table>
          </DndContext>
        </div>
      </form>
    </Card>
  );
}

function CatalogCell({
  form,
  index,
  field,
  initialValue,
  isReordering,
  placeholder,
}: {
  form: AnyForm;
  index: number;
  field: "english" | "japanese";
  initialValue: string | undefined;
  isReordering: boolean;
  placeholder: string;
}) {
  return (
    <form.AppField name={`entries[${index}].${field}`}>
      {(f: AnyForm) => {
        const isModified = f.state.value !== initialValue && initialValue !== undefined;
        const errors: unknown[] = f.state.meta.errors ?? [];
        const errorMessage = errors
          .map((e) =>
            e && typeof e === "object" && "message" in e ? (e as { message: string }).message : e,
          )
          .find((m): m is string => typeof m === "string" && m.length > 0);

        return (
          <div className="relative">
            <Input
              value={f.state.value ?? ""}
              disabled={isReordering}
              aria-invalid={!!errorMessage}
              placeholder={placeholder}
              className={cn({ "modified-field": isModified })}
              onChange={(event) => {
                f.handleChange(event.target.value);
                // Submit-time errors are stale the moment the row is edited.
                if (errorMessage) {
                  f.setMeta((previous: AnyForm) => ({
                    ...previous,
                    errorMap: { ...previous.errorMap, onSubmit: undefined },
                  }));
                }
              }}
              onBlur={() => f.handleBlur()}
            />
            {isModified && initialValue !== undefined && (
              <ResetFieldButton onClick={() => f.handleChange(initialValue)} />
            )}
            {errorMessage && (
              <p role="alert" className="mt-1 text-danger text-xs">
                {errorMessage}
              </p>
            )}
          </div>
        );
      }}
    </form.AppField>
  );
}

function SortableCatalogRow({
  form,
  entry,
  savedEntry,
  index,
  isReordering,
  onDelete,
}: {
  form: AnyForm;
  entry: MoldataKeyCatalogEntry;
  savedEntry: MoldataKeyCatalogEntry | undefined;
  index: number;
  isReordering: boolean;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isModified =
    !!savedEntry &&
    (savedEntry.english !== entry.english || savedEntry.japanese !== entry.japanese);

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn("hover:bg-hover", { "bg-amber-50/50": isModified })}
    >
      <td className="p-2">
        <button
          type="button"
          aria-label={`Move ${entry.english}`}
          className="cursor-grab touch-none text-form-icon-btn hover:text-form-icon-btn-hover"
          disabled={isReordering}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </td>
      <td className="p-2">
        <CatalogCell
          form={form}
          index={index}
          field="english"
          initialValue={savedEntry?.english}
          isReordering={isReordering}
          placeholder="English"
        />
      </td>
      <td className="p-2">
        <CatalogCell
          form={form}
          index={index}
          field="japanese"
          initialValue={savedEntry?.japanese}
          isReordering={isReordering}
          placeholder="Japanese"
        />
      </td>
      <td className="p-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={isReordering}
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      </td>
    </tr>
  );
}

function NewCatalogRow({
  form,
  disabled,
  canAdd,
}: {
  form: AnyForm;
  disabled: boolean;
  canAdd: boolean;
}) {
  // The add row lives inside the save form's <form>, so it submits on Enter
  // rather than through a nested form element.
  function addOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (
      event.key !== "Enter" ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229 ||
      !canAdd
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void form.handleSubmit();
  }

  return (
    <tr>
      <td className="p-2" />
      <td className="p-2">
        <form.AppField name="english" validators={{ onSubmit: requiredEnglish }}>
          {(f: AnyForm) => (
            <NewEntryInput
              field={f}
              disabled={disabled}
              placeholder="English"
              onEnter={addOnEnter}
            />
          )}
        </form.AppField>
      </td>
      <td className="p-2">
        <form.AppField name="japanese" validators={{ onSubmit: requiredJapanese }}>
          {(f: AnyForm) => (
            <NewEntryInput
              field={f}
              disabled={disabled}
              placeholder="Japanese"
              onEnter={addOnEnter}
            />
          )}
        </form.AppField>
      </td>
      <td className="p-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Add moldata key"
          disabled={!canAdd}
          onClick={() => void form.handleSubmit()}
        >
          <Check className="size-4" />
        </Button>
      </td>
    </tr>
  );
}

function NewEntryInput({
  field,
  disabled,
  placeholder,
  onEnter,
}: {
  field: AnyForm;
  disabled: boolean;
  placeholder: string;
  onEnter: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const errors: unknown[] = field.state.meta.errors ?? [];
  const errorMessage = errors
    .map((e) =>
      e && typeof e === "object" && "message" in e ? (e as { message: string }).message : e,
    )
    .find((m): m is string => typeof m === "string" && m.length > 0);

  return (
    <>
      <Input
        value={field.state.value ?? ""}
        disabled={disabled}
        aria-invalid={!!errorMessage}
        placeholder={placeholder}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={() => field.handleBlur()}
        onKeyDown={onEnter}
      />
      {errorMessage && (
        <p role="alert" className="mt-1 text-danger text-xs">
          {errorMessage}
        </p>
      )}
    </>
  );
}
