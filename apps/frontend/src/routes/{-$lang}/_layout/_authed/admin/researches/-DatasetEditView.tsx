import {
  DatasetForm,
  datasetFormValuesToPreviewDataset,
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
import { LangSwitcherPill } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { $getDataset, $updateDataset } from "@/serverFunctions/datasets";
import type { ResearchDetailResponse } from "@humandbs/backend/types";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  queryOptions,
} from "@tanstack/react-query";
import { useState, Suspense } from "react";
import { DatasetVersionCard } from "@/routes/{-$lang}/_layout/_main/_other/data-usage/datasets/$datasetId/-DatasetVersionCard";
import { cn } from "@/lib/utils";
import { IntlProvider } from "use-intl";
import enMessages from "../../../../../../../localization/messages/en.json";
import jaMessages from "../../../../../../../localization/messages/ja.json";

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
  const [preview, setPreview] = useState(false);
  const [previewLang, setPreviewLang] = useState<"ja" | "en">(lang);
  const [previewValues, setPreviewValues] = useState(defaultValues);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className=" px-5 pt-5 flex flex-col">
        <div className="shrink-0 flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <button type="button" onClick={onBack}>
                    Datasets
                  </button>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-mono">
                  {datasetId}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-normal text-gray-500">
              Preview
              <Switch
                checked={preview}
                onCheckedChange={setPreview}
                className="data-[state=checked]:bg-secondary"
              />
            </label>
          </div>
        </div>
        {isDraft && (
          <Button
            type="button"
            disabled={isSaving}
            className="self-end"
            onClick={() => {
              document
                .getElementById("dataset-edit-form")
                ?.dispatchEvent(
                  new Event("submit", { bubbles: true, cancelable: true }),
                );
            }}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 flex-col overflow-hidden",
          preview ? "flex" : "hidden",
        )}
      >
        <div className="px-5 pt-3 pb-2 shrink-0 flex items-center gap-2">
          <LangSwitcherPill value={previewLang} onChange={setPreviewLang} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <IntlProvider
            locale={previewLang}
            messages={previewLang === "ja" ? jaMessages : enMessages}
          >
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
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5",
          preview && "hidden",
        )}
      >
        <DatasetForm
          defaultValues={defaultValues}
          readOnly={!isDraft}
          onSubmit={async (values) => {
            await save(values);
          }}
          isSaving={isSaving}
          error={error}
          conflictError={conflictError}
          onReload={handleReload}
          onDirtyChange={onDirtyChange}
          onValuesChange={setPreviewValues}
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
