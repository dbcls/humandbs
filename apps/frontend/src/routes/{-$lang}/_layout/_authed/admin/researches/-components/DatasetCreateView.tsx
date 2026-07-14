import { evaluate, useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, LucidePlus } from "lucide-react";
import { IntlProvider, useTranslations } from "use-intl";
import { z } from "zod";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DatasetFormValues } from "@/components/form-context/dataset-fields/DatasetForm";
import {
  DatasetForm,
  datasetFormValuesToPreviewDataset,
  getDefaultDatasetFormValues,
  useDatasetForm,
} from "@/components/form-context/dataset-fields/DatasetForm";
import { entriesToExperimentData } from "@/components/form-context/dataset-fields/ExperimentsArrayField";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { messages } from "@/config/messages";
import { DatasetVersionCard } from "@/routes/{-$lang}/_layout/_main/_other/dataset/$datasetId/-DatasetVersionCard";
import { $createDatasetForResearch } from "@/serverFunctions/datasets";

import type { DatasetTemplateData } from "../../../../../../../../../backend/src/api/types/templates";
import { PreviewDialog } from "../../-components/PreviewDialog";
import { CopyDataDialog } from "./CopyDataDialog";
import { TabContentLayout } from "./TabContentLayout";
import { mergeDatasetTemplate, templateWouldOverwrite } from "./utils/mergeDatasetTemplate";

interface DatasetCreateViewProps {
  humId: string;
  onBack: () => void;
  onCreated: (datasetId: string) => void;
  preview?: boolean;
  onPreviewChange?: (open: boolean) => void;
  relatedAccessions?: string[];
}

export function DatasetCreateView({
  humId,
  onBack,
  onCreated,
  preview = false,
  onPreviewChange,
  relatedAccessions: initialAccessions = [],
}: DatasetCreateViewProps) {
  const queryClient = useQueryClient();
  const tResearches = useTranslations("admin.researches");
  const [error, setError] = useState<string | null>(null);
  const datasetIdRequiredSchema = useMemo(
    () =>
      z
        .string()
        .trim()
        .min(1, { message: tResearches("dataset-id-required") }),
    [tResearches],
  );
  const [accessions, setAccessions] = useState<string[]>(initialAccessions);
  const [defaultValues] = useState(() => getDefaultDatasetFormValues(humId));
  const [previewLang, setPreviewLang] = useState<"ja" | "en">("ja");
  const [pendingTemplate, setPendingTemplate] = useState<{
    data: DatasetTemplateData;
    accession: string;
  } | null>(null);
  const [lastAppliedId, setLastAppliedId] = useState<string | null>(null);
  const [chipsResetKey, setChipsResetKey] = useState(0);

  const { mutateAsync: create, isPending: isSaving } = useMutation({
    mutationFn: async (values: DatasetFormValues) => {
      return $createDatasetForResearch({
        data: {
          humId,
          body: {
            datasetId: values.datasetId || undefined,
            releaseDate: values.releaseDate || undefined,
            criteria: (values.criteria as any) || undefined,
            typeOfData:
              values.typeOfData.ja || values.typeOfData.en
                ? {
                    ja: values.typeOfData.ja ?? null,
                    en: values.typeOfData.en ?? null,
                  }
                : undefined,
            experiments:
              values.experiments.length > 0
                ? values.experiments.map((exp) => ({
                    header: exp.header,
                    data: entriesToExperimentData(exp.data),
                    ...(exp.searchable !== undefined ? { searchable: exp.searchable } : {}),
                  }))
                : undefined,
          },
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        if (result.code === "CONFLICT") {
          form.setFieldMeta("datasetId", (prev) => ({
            ...prev,
            errorMap: { ...prev.errorMap, onSubmit: result.error },
          }));
        } else {
          setError(result.error);
        }
        return;
      }
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["researches", "byId"] });
      onCreated(result.data.data.datasetId);
    },
  });

  const form = useDatasetForm(defaultValues, async (value) => {
    const datasetId = value.datasetId.trim();
    setError(null);
    return (await create({ ...value, datasetId })).ok;
  });
  const values = useStore(form.store, (state) => state.values);
  const previousValuesRef = useRef(values);
  const isApplyingTemplateRef = useRef(false);

  useEffect(() => {
    if (values === previousValuesRef.current) return;
    const datasetIdChanged = values.datasetId !== previousValuesRef.current.datasetId;
    previousValuesRef.current = values;
    if (datasetIdChanged) {
      form.setFieldMeta("datasetId", (prev) => ({
        ...prev,
        errorMap: { ...prev.errorMap, onSubmit: undefined },
      }));
    }
    if (isApplyingTemplateRef.current) {
      isApplyingTemplateRef.current = false;
      return;
    }
    setChipsResetKey((key) => key + 1);
    setLastAppliedId(null);
  }, [values, form.setFieldMeta]);

  function doApplyTemplate(data: DatasetTemplateData, accession: string) {
    const merged = mergeDatasetTemplate(form.state.values, data);
    isApplyingTemplateRef.current = !evaluate(form.state.values, merged);
    form.setFieldValue("releaseDate", merged.releaseDate);
    form.setFieldValue("criteria", merged.criteria);
    form.setFieldValue("typeOfData", merged.typeOfData);
    form.setFieldValue("datasetId", merged.datasetId);
    form.setFieldValue("experiments", merged.experiments);
    setLastAppliedId(accession);
  }

  function applyTemplate(data: DatasetTemplateData, accession: string) {
    if (templateWouldOverwrite(form.state.values, data)) {
      setPendingTemplate({ data, accession });
    } else {
      doApplyTemplate(data, accession);
    }
  }

  const header = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-gray-500 text-sm hover:text-gray-800"
      >
        <ChevronLeft className="size-4" />
        All datasets
      </button>
      <span className="text-gray-300">/</span>
      <span className="font-medium text-sm">New dataset</span>
    </div>
  );

  const actions = (
    <>
      <CopyDataDialog
        accessions={accessions}
        onAccessionsChange={setAccessions}
        onApply={applyTemplate}
        lastAppliedId={lastAppliedId}
        pendingTemplateId={pendingTemplate?.accession}
        resetKey={chipsResetKey}
      />
      <Button type="submit" size="lg" form="dataset-create-form" disabled={isSaving}>
        <LucidePlus className="mr-2 size-5" />
        {isSaving ? tResearches("creating-dataset") : tResearches("create-dataset")}
      </Button>
    </>
  );

  return (
    <TabContentLayout header={header} actions={actions}>
      <AlertDialog
        open={pendingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTemplate(null);
        }}
      >
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite existing fields?</AlertDialogTitle>
            <AlertDialogDescription>
              Some fields already have values. Applying this template will overwrite them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingTemplate)
                  doApplyTemplate(pendingTemplate.data, pendingTemplate.accession);
                setPendingTemplate(null);
              }}
            >
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DatasetForm
        form={form}
        formId="dataset-create-form"
        defaultValues={defaultValues}
        readOnly={false}
        isSaving={isSaving}
        error={error}
        datasetIdValidator={datasetIdRequiredSchema}
        showDatasetIdField
        hideSaveButton
      />
      <PreviewDialog
        open={preview}
        onOpenChange={(open) => onPreviewChange?.(open)}
        title="New dataset preview"
        lang={previewLang}
        onLangChange={setPreviewLang}
      >
        <div className="px-5 py-5">
          <IntlProvider locale={previewLang} messages={messages[previewLang]}>
            <DatasetVersionCard
              versionData={datasetFormValuesToPreviewDataset(values)}
              lang={previewLang}
              showPublicActions={false}
            />
          </IntlProvider>
        </div>
      </PreviewDialog>
    </TabContentLayout>
  );
}
