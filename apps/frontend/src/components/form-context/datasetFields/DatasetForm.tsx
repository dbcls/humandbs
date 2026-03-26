import { useStore } from "@tanstack/react-form";
import { useEffect } from "react";

import { deepEqual } from "@/components/form-context/fields/useFieldModified";
import { ModifiedTag } from "@/components/form-context/fields/ModifiedTag";
import { useAppForm } from "@/components/form-context/FormContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { DatasetDoc, UpdateDatasetRequest } from "@humandbs/backend/types";

import {
  ExperimentsArrayField,
  experimentDataToEntries,
  entriesToExperimentData,
  type ExperimentItem,
} from "./ExperimentsArrayField";

const CRITERIA_OPTIONS = [
  "Controlled-access (Type I)",
  "Controlled-access (Type II)",
  "Unrestricted-access",
] as const;

export type DatasetFormValues = {
  datasetId: string;
  humId: string;
  humVersionId: string;
  releaseDate: string;
  criteria: string;
  typeOfData: { ja: string | null; en: string | null };
  experiments: ExperimentItem[];
};

export function datasetToFormValues(
  dataset: Pick<
    UpdateDatasetRequest,
    | "humId"
    | "humVersionId"
    | "releaseDate"
    | "criteria"
    | "typeOfData"
    | "experiments"
  >,
): DatasetFormValues {
  return {
    datasetId: "",
    humId: dataset.humId,
    humVersionId: dataset.humVersionId,
    releaseDate: dataset.releaseDate,
    criteria: dataset.criteria,
    typeOfData: {
      ja: dataset.typeOfData.ja ?? null,
      en: dataset.typeOfData.en ?? null,
    },
    experiments: dataset.experiments.map((exp) => ({
      header: exp.header,
      data: experimentDataToEntries(exp.data as any),
    })),
  };
}

export function formValuesToDatasetUpdate(
  values: DatasetFormValues,
  seqNo: number,
  primaryTerm: number,
): UpdateDatasetRequest {
  return {
    humId: values.humId,
    humVersionId: values.humVersionId,
    releaseDate: values.releaseDate,
    criteria: values.criteria as UpdateDatasetRequest["criteria"],
    typeOfData: {
      ja: values.typeOfData.ja ?? null,
      en: values.typeOfData.en ?? null,
    },
    experiments: values.experiments.map((exp) => ({
      header: exp.header,
      data: entriesToExperimentData(exp.data),
    })),
    _seq_no: seqNo,
    _primary_term: primaryTerm,
  };
}

export function datasetFormValuesToPreviewDataset(
  values: DatasetFormValues,
  options?: {
    datasetId?: string;
    version?: string;
  },
): Pick<DatasetDoc, "criteria" | "datasetId" | "releaseDate" | "typeOfData" | "version"> {
  return {
    criteria: values.criteria,
    datasetId: values.datasetId || options?.datasetId || "",
    releaseDate: values.releaseDate,
    typeOfData: {
      ja: values.typeOfData.ja ?? null,
      en: values.typeOfData.en ?? null,
    },
    version: options?.version || "",
  };
}

export function getDefaultDatasetFormValues(humId: string): DatasetFormValues {
  return {
    datasetId: "",
    humId,
    humVersionId: "",
    releaseDate: "",
    criteria: "",
    typeOfData: { ja: null, en: null },
    experiments: [],
  };
}

interface DatasetFormProps {
  defaultValues: DatasetFormValues;
  readOnly: boolean;
  onSubmit: (values: DatasetFormValues) => Promise<void>;
  isSaving: boolean;
  error?: string | null;
  conflictError?: boolean;
  onReload?: () => void;
  saveLabel?: string;
  hideSaveButton?: boolean;
  showDatasetIdField?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onValuesChange?: (values: DatasetFormValues) => void;
}

export function DatasetForm({
  defaultValues,
  readOnly,
  onSubmit,
  isSaving,
  error,
  conflictError,
  onReload,
  saveLabel = "Save",
  hideSaveButton = false,
  showDatasetIdField = false,
  onDirtyChange,
  onValuesChange,
}: DatasetFormProps) {
  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  const values = useStore(form.store, (state) => state.values);

  // Notify parent when dirty state changes
  const isDirty = !deepEqual(values, defaultValues);
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onValuesChange?.(values);
  }, [onValuesChange, values]);

  const isExperimentsModified = useStore(
    form.store,
    (state) => !deepEqual(state.values.experiments, defaultValues.experiments),
  );

  return (
    <form
      id="dataset-edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="flex flex-col gap-5"
    >
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-danger">
          {error}
        </div>
      )}
      {conflictError && (
        <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
          <span>Someone else saved a newer version. Reload to continue.</span>
          {onReload && (
            <button
              type="button"
              onClick={onReload}
              className="underline hover:no-underline"
            >
              Reload
            </button>
          )}
        </div>
      )}

      <fieldset
        disabled={readOnly}
        className="flex flex-col gap-5 disabled:opacity-60"
      >
        {/* Read-only fields */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-gray-500">Research Version</Label>
            <span className="font-mono text-sm">
              {defaultValues.humVersionId || "—"}
            </span>
          </div>
        </div>

        {/* Dataset ID (create only) */}
        {showDatasetIdField && (
          <form.AppField name="datasetId">
            {(field) => <field.TextField type="col" label="Dataset ID (optional)" />}
          </form.AppField>
        )}

        {/* Release Date */}
        <form.AppField name="releaseDate">
          {(field) => <field.DateField label="Release Date" />}
        </form.AppField>

        {/* Criteria */}
        <form.AppField name="criteria">
          {(field) => (
            <field.SelectField
              label="Criteria"
              type="col"
              items={[...CRITERIA_OPTIONS]}
            />
          )}
        </form.AppField>

        {/* Type of Data */}
        <form.AppField name="typeOfData">
          {(field) => <field.BilingualTextField label="Type of Data" />}
        </form.AppField>

        {/* Experiments */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Label>Experiments</Label>
            <ModifiedTag isModified={isExperimentsModified} />
          </div>
          <ExperimentsArrayField form={form} initialItems={defaultValues.experiments} />
        </div>
      </fieldset>

      {!readOnly && !hideSaveButton && (
        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : saveLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
