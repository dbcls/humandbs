import {
  DatasetForm,
  datasetToFormValues,
  formValuesToDatasetUpdate,
  type DatasetFormValues,
} from "@/components/form-context/datasetFields/DatasetForm";
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
    <>
      <Breadcrumb datasetId={datasetId} onBack={onBack} />
      <div className="mt-4">
        <DatasetForm
          defaultValues={defaultValues}
          readOnly={!isDraft}
          onSubmit={async (values) => { await save(values); }}
          isSaving={isSaving}
          error={error}
          conflictError={conflictError}
          onReload={handleReload}
          onDirtyChange={onDirtyChange}
        />
      </div>
    </>
  );
}

export function DatasetEditView(props: DatasetEditViewProps) {
  return (
    <Suspense
      fallback={
        <div className="text-sm text-gray-400 animate-pulse">
          Loading dataset…
        </div>
      }
    >
      <DatasetEditViewInner {...props} />
    </Suspense>
  );
}

function Breadcrumb({
  datasetId,
  onBack,
}: {
  datasetId: string;
  onBack: () => void;
}) {
  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500">
      <button
        type="button"
        onClick={onBack}
        className="hover:text-gray-800 hover:underline"
      >
        Datasets
      </button>
      <span>/</span>
      <span className="font-mono font-medium text-gray-800">{datasetId}</span>
    </nav>
  );
}
