import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { IntlProvider } from "use-intl";

import { useRef, useState } from "react";

import type {
  DatasetFormHandle,
  DatasetFormValues,
} from "@/components/form-context/datasetFields/DatasetForm";
import {
  DatasetForm,
  datasetFormValuesToPreviewDataset,
  getDefaultDatasetFormValues,
} from "@/components/form-context/datasetFields/DatasetForm";
import { entriesToExperimentData } from "@/components/form-context/datasetFields/ExperimentsArrayField";
import { LangSwitcherPill } from "@/components/LanguageSwitcher";
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
import { cn } from "@/lib/utils";
import { DatasetVersionCard } from "@/routes/{-$lang}/_layout/_main/_other/dataset/$datasetId/-DatasetVersionCard";
import { $createDatasetForResearch } from "@/serverFunctions/datasets";

import type { DatasetTemplateData } from "../../../../../../../../backend/src/api/types/templates";
import { AccessionChips } from "./-AccessionChips";
import { mergeDatasetTemplate, templateWouldOverwrite } from "./-mergeDatasetTemplate";
import { TabContentLayout } from "./-TabContentLayout";

interface DatasetCreateViewProps {
  humId: string;
  onBack: () => void;
  onCreated: (datasetId: string) => void;
  preview?: boolean;
  relatedAccessions?: string[];
}

export function DatasetCreateView({
  humId,
  onBack,
  onCreated,
  preview = false,
  relatedAccessions: initialAccessions = [],
}: DatasetCreateViewProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [accessions, setAccessions] = useState<string[]>(initialAccessions);
  const defaultValues = getDefaultDatasetFormValues(humId);
  const [previewLang, setPreviewLang] = useState<"ja" | "en">("ja");
  const [previewValues, setPreviewValues] = useState(defaultValues);
  const [pendingTemplate, setPendingTemplate] = useState<{
    data: DatasetTemplateData;
    accession: string;
  } | null>(null);
  const [lastAppliedId, setLastAppliedId] = useState<string | null>(null);
  const [chipsResetKey, setChipsResetKey] = useState(0);
  const currentValuesRef = useRef<DatasetFormValues>(defaultValues);
  const isApplyingRef = useRef(false);
  const formRef = useRef<DatasetFormHandle>(null);

  function doApplyTemplate(data: DatasetTemplateData, accession: string) {
    const merged = mergeDatasetTemplate(currentValuesRef.current, data);
    isApplyingRef.current = true;
    formRef.current?.applyValues(merged);
    setLastAppliedId(accession);
  }

  function applyTemplate(data: DatasetTemplateData, accession: string) {
    if (templateWouldOverwrite(currentValuesRef.current, data)) {
      setPendingTemplate({ data, accession });
    } else {
      doApplyTemplate(data, accession);
    }
  }

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
                  }))
                : undefined,
          },
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["researches", "byId"] });
      onCreated(result.data.data.datasetId);
    },
  });

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

  const actions = preview ? (
    <LangSwitcherPill value={previewLang} onChange={setPreviewLang} />
  ) : (
    <Button
      type="button"
      size="lg"
      disabled={isSaving}
      onClick={() => {
        document
          .getElementById("dataset-edit-form")
          ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }}
    >
      {isSaving ? "Creating…" : "Create dataset"}
    </Button>
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

      <div
        className={cn({
          hidden: preview,
        })}
      >
        <div className="mb-4">
          <AccessionChips
            accessions={accessions}
            onAccessionsChange={setAccessions}
            onApply={applyTemplate}
            lastAppliedId={lastAppliedId}
            pendingAccession={pendingTemplate?.accession}
            resetKey={chipsResetKey}
          />
        </div>
        <DatasetForm
          defaultValues={defaultValues}
          readOnly={false}
          onSubmit={async (values) => {
            await create(values);
          }}
          isSaving={isSaving}
          error={error}
          showDatasetIdField
          onValuesChange={(values) => {
            if (isApplyingRef.current) {
              isApplyingRef.current = false;
            } else {
              setChipsResetKey((k) => k + 1);
              setLastAppliedId(null);
            }
            currentValuesRef.current = values;
            setPreviewValues(values);
          }}
          hideSaveButton
          imperativeRef={formRef}
        />
      </div>
      <div
        className={cn({
          hidden: !preview,
        })}
      >
        <IntlProvider locale={previewLang} messages={messages[previewLang]}>
          <DatasetVersionCard
            versionData={datasetFormValuesToPreviewDataset(previewValues)}
            lang={previewLang}
            showPublicActions={false}
          />
        </IntlProvider>
      </div>
    </TabContentLayout>
  );
}
