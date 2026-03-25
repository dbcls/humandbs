import {
  DatasetForm,
  datasetToFormValues,
  formValuesToDatasetUpdate,
  type DatasetFormValues,
} from "@/components/form-context/datasetFields/DatasetForm";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/Breadcrumb";
import { Button } from "@/components/ui/button";
import { $getDataset, $updateDataset } from "@/serverFunctions/datasets";
import type { ResearchDetailResponse } from "@humandbs/backend/types";
import { useMutation, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useState, Suspense } from "react";

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
  /** Called with the real datasetId after a new dataset is created */
  onCreated?: (datasetId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function DatasetEditViewInner({
  datasetId,
  lang,
  research,
  onBack,
  onDirtyChange,
}: DatasetEditViewProps) {
  const queryClient = useQueryClient();
  const { data: datasetResponse } = useSuspenseQuery(
    getDatasetEditQueryOptions(datasetId, lang),
  );

  const dataset = datasetResponse.data;
  const [seqNo, setSeqNo] = useState(datasetResponse.meta._seq_no);
  const [primaryTerm, setPrimaryTerm] = useState(
    datasetResponse.meta._primary_term,
  );
  const [error, setError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState(false);

  const isDraft = research.status === "draft";

  const { mutateAsync: save, isPending: isSaving } = useMutation({
    mutationFn: async (values: DatasetFormValues) => {
      const body = formValuesToDatasetUpdate(values, seqNo, primaryTerm);
      return $updateDataset({ data: { datasetId, body } });
    },
    onSuccess: (result) => {
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
    },
  });

  function handleReload() {
    queryClient.invalidateQueries({
      queryKey: ["dataset", "edit", datasetId, lang],
    });
    setConflictError(false);
  }

  const defaultValues = datasetToFormValues({
    humId: dataset.humId,
    humVersionId: dataset.humVersionId,
    releaseDate: dataset.releaseDate,
    criteria: dataset.criteria,
    typeOfData: dataset.typeOfData,
    experiments: dataset.experiments,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-5 pt-5 flex items-center justify-between">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <button type="button" onClick={onBack}>Datasets</button>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-mono">{datasetId}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {isDraft && (
          <Button
            type="button"
            disabled={isSaving}
            onClick={() => {
              document.getElementById("dataset-edit-form")?.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true }),
              );
            }}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5">
        <DatasetForm
          defaultValues={defaultValues}
          readOnly={!isDraft}
          onSubmit={async (values) => { await save(values); }}
          isSaving={isSaving}
          error={error}
          conflictError={conflictError}
          onReload={handleReload}
          onDirtyChange={onDirtyChange}
          hideSaveButton
        />
      </div>
    </div>
  );
}

export function DatasetEditView(props: DatasetEditViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
    <Suspense
      fallback={
        <div className="px-5 pt-5 text-sm text-gray-400 animate-pulse">
          Loading dataset…
        </div>
      }
    >
      <DatasetEditViewInner {...props} />
    </Suspense>
    </div>
  );
}

