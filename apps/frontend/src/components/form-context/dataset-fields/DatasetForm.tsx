import { evaluate, useStore } from "@tanstack/react-form";
import { useTranslations } from "use-intl";

import type { UpdateDatasetRequest } from "@humandbs/backend/types";

import { useAppForm } from "@/components/form-context/FormContext";
import { ModifiedTag } from "@/components/form-context/fields/ModifiedTag";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { DatasetDoc } from "@/lib/types";
import type { LegacyRawHtmlLookup } from "@/utils/renderedHtml/legacyRawHtml";
import type { DeepOmit } from "@/utils/type-utils";

import { CriteriaCanonicalSchema } from "../../../../../backend/src/crawler/types";
import type { ExperimentItem } from "./ExperimentsArrayField";
import {
  ExperimentsArrayField,
  entriesToExperimentData,
  experimentDataToEntries,
} from "./ExperimentsArrayField";

const CRITERIA_OPTIONS = CriteriaCanonicalSchema.options;

export type DatasetFormValues = {
  datasetId: string;
  humId: string;
  humVersionId: string;
  releaseDate: string;
  criteria: string;
  typeOfData: { ja: string | null; en: string | null };
  experiments: DeepOmit<ExperimentItem[], "rawHtml">;
};

export function datasetToFormValues(
  dataset: {
    humId: string;
    humVersionId: string;
  } & Pick<UpdateDatasetRequest, "releaseDate" | "criteria" | "typeOfData" | "experiments">,
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
      searchable: (exp as any).searchable,
    })),
  };
}

export function formValuesToDatasetUpdate(
  values: DatasetFormValues,
  seqNo: number,
  primaryTerm: number,
): UpdateDatasetRequest {
  return {
    releaseDate: values.releaseDate,
    criteria: values.criteria as UpdateDatasetRequest["criteria"],
    typeOfData: {
      ja: values.typeOfData.ja ?? null,
      en: values.typeOfData.en ?? null,
    },
    experiments: values.experiments.map((exp) => ({
      header: exp.header,
      data: entriesToExperimentData(exp.data),
      ...(exp.searchable !== undefined ? { searchable: exp.searchable } : {}),
    })),
    _seq_no: seqNo,
    _primary_term: primaryTerm,
  };
}

/**
 * Convert form experiment entries into the `DatasetDoc` experiments shape so the
 * preview can run the same `addDatasetRenderedHtml` transform the public read path
 * uses. The form only stores `text`; `rawHtml` is set to `null` (no legacy in the
 * preview). The transform then derives `renderedHtml` from `text`.
 */
function formExperimentsToPreview(
  experiments: DatasetFormValues["experiments"],
): DatasetDoc["experiments"] {
  return experiments.map((exp) => ({
    header: exp.header,
    data: Object.fromEntries(
      Object.entries(entriesToExperimentData(exp.data)).map(([key, value]) => [
        key,
        {
          ja: value?.ja ? { ...value.ja, rawHtml: null } : null,
          en: value?.en ? { ...value.en, rawHtml: null } : null,
        },
      ]),
    ),
  })) as DatasetDoc["experiments"];
}

export function datasetFormValuesToPreviewDataset(
  values: DatasetFormValues,
  options?: {
    datasetId?: string;
    version?: string;
  },
): Pick<
  DatasetDoc,
  | "criteria"
  | "datasetId"
  | "releaseDate"
  | "typeOfData"
  | "version"
  | "experiments"
  | "humId"
  | "humVersionId"
  | "versionReleaseDate"
> {
  return {
    criteria: values.criteria as DatasetDoc["criteria"],
    datasetId: values.datasetId || options?.datasetId || "",
    releaseDate: values.releaseDate,
    typeOfData: {
      ja: values.typeOfData.ja ?? null,
      en: values.typeOfData.en ?? null,
    },
    version: options?.version || "",
    experiments: formExperimentsToPreview(values.experiments),
    humId: values.humId,
    humVersionId: values.humVersionId,
    versionReleaseDate: values.releaseDate,
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

export function useDatasetForm(
  defaultValues: DatasetFormValues,
  onSubmit: (values: DatasetFormValues) => Promise<boolean>,
) {
  return useAppForm({
    defaultValues,
    onSubmit: async ({ value, formApi }) => {
      if (!(await onSubmit(value))) return;
      formApi.options.defaultValues = value;
      formApi.reset(value);
    },
  });
}

type DatasetFormInstance = ReturnType<typeof useDatasetForm>;

interface DatasetFormProps {
  form: DatasetFormInstance;
  formId: string;
  defaultValues: DatasetFormValues;
  /** Read-only legacy rawHtml side-channel for the experiment data editors. */
  legacyRawHtml?: LegacyRawHtmlLookup;
  readOnly: boolean;
  isSaving: boolean;
  error?: string | null;
  conflictError?: boolean;
  onReload?: () => void;
  saveLabel?: string;
  hideSaveButton?: boolean;
  showDatasetIdField?: boolean;
}

export function DatasetForm({
  form,
  formId,
  defaultValues,
  legacyRawHtml,
  readOnly,
  isSaving,
  error,
  conflictError,
  onReload,
  saveLabel = "Save",
  hideSaveButton = false,
  showDatasetIdField = false,
}: DatasetFormProps) {
  const t = useTranslations("Dataset");
  const tCommon = useTranslations("admin.common");

  const experiments = useStore(form.store, (state) => state.values.experiments);
  const isExperimentsModified = !evaluate(experiments, defaultValues.experiments);

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="flex flex-col gap-5"
    >
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-danger text-sm">
          {error}
        </div>
      )}
      {conflictError && (
        <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-amber-800 text-sm">
          <span>{tCommon("conflict-reload")}</span>
          {onReload && (
            <button type="button" onClick={onReload} className="underline hover:no-underline">
              Reload
            </button>
          )}
        </div>
      )}

      <fieldset disabled={readOnly} className="flex flex-col gap-5 disabled:opacity-60">
        {/* Read-only fields */}
        <div className="flex items-start gap-4">
          <div className="flex flex-col gap-1">
            <Label className="text-form-label text-xs">{t("research-version")}</Label>
            <span className="font-mono text-sm">{defaultValues.humVersionId || "—"}</span>
          </div>
          {/* Dataset ID (create only) */}
          {showDatasetIdField && (
            <form.AppField name="datasetId">
              {(field) => <field.TextField type="col" label="Dataset ID (optional)" />}
            </form.AppField>
          )}
          {/* Release Date */}
          <form.AppField name="releaseDate">
            {(field) => <field.DateField label={t("releaseDate")} />}
          </form.AppField>
          {/* Criteria */}
          <form.AppField name="criteria">
            {(field) => (
              <field.SelectField
                label={t("criteria")}
                type="col"
                items={CRITERIA_OPTIONS.map((option) => ({
                  label: t(option),
                  value: option,
                }))}
              />
            )}
          </form.AppField>
        </div>

        {/* Type of Data */}
        <form.AppField name="typeOfData">
          {(field) => <field.BilingualTextField label={t("typeOfData")} />}
        </form.AppField>

        {/* Experiments */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Label>{t("experiments")}</Label>
            <ModifiedTag isModified={isExperimentsModified} />
          </div>
          <ExperimentsArrayField
            form={form}
            initialItems={defaultValues.experiments}
            legacyRawHtml={legacyRawHtml}
          />
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
