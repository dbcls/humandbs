import { Label } from "@/components/ui/label";
import { useAppForm } from "@/components/form-context/FormContext";
import { ExperimentsArrayField, experimentDataToEntries, entriesToExperimentData, type ExperimentItem } from "./ExperimentsArrayField";
import type { UpdateDatasetRequest } from "@humandbs/backend/types";

const CRITERIA_OPTIONS = [
  "Controlled-access (Type I)",
  "Controlled-access (Type II)",
  "Unrestricted-access",
] as const;

export type DatasetFormValues = {
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
    "humId" | "humVersionId" | "releaseDate" | "criteria" | "typeOfData" | "experiments"
  >,
): DatasetFormValues {
  return {
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

export function getDefaultDatasetFormValues(humId: string): DatasetFormValues {
  return {
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
}: DatasetFormProps) {
  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  return (
    <form
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

      <fieldset disabled={readOnly} className="flex flex-col gap-5 disabled:opacity-60">
        {/* Read-only fields */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-gray-500">Research ID</Label>
            <span className="font-mono text-sm">{defaultValues.humId}</span>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-gray-500">Research Version</Label>
            <span className="font-mono text-sm">{defaultValues.humVersionId || "—"}</span>
          </div>
        </div>

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
        <div className="flex flex-col gap-1">
          <Label>Type of Data</Label>
          <div className="nested-form grid grid-cols-2 gap-2">
            <form.AppField name="typeOfData.ja">
              {(field) => <field.TextField label="JA" />}
            </form.AppField>
            <form.AppField name="typeOfData.en">
              {(field) => <field.TextField label="EN" />}
            </form.AppField>
          </div>
        </div>

        {/* Experiments */}
        <div className="flex flex-col gap-2">
          <Label>Experiments</Label>
          <ExperimentsArrayField form={form} />
        </div>
      </fieldset>

      {!readOnly && (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded bg-primary px-4 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : saveLabel}
          </button>
        </div>
      )}
    </form>
  );
}
