import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { IntlProvider } from "use-intl";

import { Suspense, useRef, useState } from "react";

import type { ResearchDetailResponse } from "@humandbs/backend/types";

import type {
  DatasetFormHandle,
  DatasetFormValues,
} from "@/components/form-context/dataset-fields/DatasetForm";
import {
  DatasetForm,
  datasetFormValuesToPreviewDataset,
  datasetToFormValues,
  formValuesToDatasetUpdate,
} from "@/components/form-context/dataset-fields/DatasetForm";
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
import { $getDataset, $patchDataset, $updateDataset } from "@/serverFunctions/datasets";

import type { DatasetTemplateData } from "../../../../../../../../../backend/src/api/types/templates";
import { PreviewDialog } from "../../-components/PreviewDialog";
import { AccessionChips } from "./AccessionChips";
import { CopyFromDataset } from "./CopyFromDataset";
import { TabContentLayout } from "./TabContentLayout";
import { mergeDatasetTemplate, templateWouldOverwrite } from "./utils/mergeDatasetTemplate";

type ResearchData = ResearchDetailResponse["data"];

function getDatasetEditQueryOptions(datasetId: string, lang: "ja" | "en") {
  return queryOptions({
    queryKey: ["dataset", "edit", datasetId, lang],
    queryFn: () => $getDataset({ data: { datasetId, lang } }),
    staleTime: 0, // Always fresh for edit
  });
}

interface DatasetEditViewProps {
  datasetId: string;
  lang: "ja" | "en";
  research: ResearchData;
  onBack: () => void;
  onCreated?: (datasetId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  preview?: boolean;
  onPreviewChange?: (open: boolean) => void;
}

function DatasetEditViewInner({
  datasetId,
  lang,
  research,
  onBack,
  onDirtyChange,
  preview = false,
  onPreviewChange,
}: DatasetEditViewProps) {
  const queryClient = useQueryClient();
  const { data: datasetResponse } = useSuspenseQuery(getDatasetEditQueryOptions(datasetId, lang));

  const dataset = datasetResponse.data;
  const [seqNo, setSeqNo] = useState(datasetResponse.meta._seq_no);
  const [primaryTerm, setPrimaryTerm] = useState(datasetResponse.meta._primary_term);
  const [error, setError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState(false);

  const isDraft = research.status === "draft";
  const isPublished = research.status === "published";
  // Editable when the parent is a draft (→ /update) or published (→ /patch).
  const isEditable = isDraft || isPublished;

  const { mutateAsync: save, isPending: isSaving } = useMutation({
    mutationFn: async (values: DatasetFormValues) => {
      const body = formValuesToDatasetUpdate(values, seqNo, primaryTerm);
      // Route by parent status: published parent patches in place; draft updates.
      const writeDataset = isPublished ? $patchDataset : $updateDataset;
      return writeDataset({ data: { datasetId, body } });
    },
    onSuccess: (result, submittedValues) => {
      if (!result.ok) {
        if (result.code === "CONFLICT") {
          setConflictError(true);
          setError(null);
        } else {
          setError(result.error);
        }
        return;
      }
      setSeqNo(result.data.meta._seq_no);
      setPrimaryTerm(result.data.meta._primary_term);
      setError(null);
      setConflictError(false);
      queryClient.invalidateQueries({ queryKey: ["researches", "byId"] });
      queryClient.invalidateQueries({ queryKey: ["dataset"] });
    },
  });

  function handleReload() {
    queryClient.invalidateQueries({
      queryKey: ["dataset", "edit", datasetId, lang],
    });
    setConflictError(false);
  }

  const initialFormValues = datasetToFormValues({
    humId: dataset.humId,
    humVersionId: dataset.humVersionId,
    releaseDate: dataset.releaseDate,
    criteria: dataset.criteria,
    typeOfData: dataset.typeOfData,
    experiments: dataset.experiments,
  });

  const [defaultValues] = useState<DatasetFormValues>(initialFormValues);
  const [accessions, setAccessions] = useState<string[]>([]);
  const [previewLang, setPreviewLang] = useState<"ja" | "en">(lang);
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
      <span className="font-medium font-mono text-sm">{datasetId}</span>
    </div>
  );

  const actions = isEditable ? (
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
      {isSaving ? "Saving…" : "Save"}
    </Button>
  ) : undefined;

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

      <div>
        {isDraft && (
          <div className="mb-4 flex flex-col gap-3 rounded border border-gray-200 bg-gray-50 p-3">
            <span className="font-medium text-foreground-light text-xs uppercase tracking-wide">
              Copy data in
            </span>
            <AccessionChips
              accessions={accessions}
              onAccessionsChange={setAccessions}
              onApply={applyTemplate}
              lastAppliedId={lastAppliedId}
              pendingAccession={pendingTemplate?.accession}
              resetKey={chipsResetKey}
            />
            <CopyFromDataset
              onApply={applyTemplate}
              lastAppliedId={lastAppliedId}
              pendingDatasetId={pendingTemplate?.accession}
              resetKey={chipsResetKey}
            />
          </div>
        )}
        <DatasetForm
          defaultValues={defaultValues}
          readOnly={!isEditable}
          onSubmit={async (values) => {
            await save(values);
          }}
          isSaving={isSaving}
          error={error}
          conflictError={conflictError}
          onReload={handleReload}
          onDirtyChange={onDirtyChange}
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
      <PreviewDialog
        open={preview}
        onOpenChange={(open) => onPreviewChange?.(open)}
        title={`${datasetId} preview`}
        lang={previewLang}
        onLangChange={setPreviewLang}
      >
        <div className="px-5 py-5">
          <IntlProvider locale={previewLang} messages={messages[previewLang]}>
            <DatasetVersionCard
              versionData={datasetFormValuesToPreviewDataset(previewValues, {
                datasetId: dataset.datasetId,
                version: dataset.version,
              })}
              lang={previewLang}
              showPublicActions={false}
            />
          </IntlProvider>
        </div>
      </PreviewDialog>
    </TabContentLayout>
  );
}

export function DatasetEditView(props: DatasetEditViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense
        fallback={
          <div className="animate-pulse px-5 pt-5 text-gray-400 text-sm">Loading dataset…</div>
        }
      >
        <DatasetEditViewInner {...props} />
      </Suspense>
    </div>
  );
}
