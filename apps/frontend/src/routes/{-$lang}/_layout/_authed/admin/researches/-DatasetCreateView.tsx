import {
  DatasetForm,
  datasetFormValuesToPreviewDataset,
  getDefaultDatasetFormValues,
  type DatasetFormValues,
} from "@/components/form-context/datasetFields/DatasetForm";
import { entriesToExperimentData } from "@/components/form-context/datasetFields/ExperimentsArrayField";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/Breadcrumb";
import { LangSwitcherPill } from "@/components/LanguageSwitcher";
import { Switch } from "@/components/ui/switch";
import { DatasetVersionCard } from "@/routes/{-$lang}/_layout/_main/_other/data-usage/datasets/$datasetId/-DatasetVersionCard";
import { $createDatasetForResearch } from "@/serverFunctions/datasets";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { IntlProvider } from "use-intl";
import enMessages from "../../../../../../../localization/messages/en.json";
import jaMessages from "../../../../../../../localization/messages/ja.json";

interface DatasetCreateViewProps {
  humId: string;
  onBack: () => void;
  onCreated: (datasetId: string) => void;
}

export function DatasetCreateView({
  humId,
  onBack,
  onCreated,
}: DatasetCreateViewProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const defaultValues = getDefaultDatasetFormValues(humId);
  const [preview, setPreview] = useState(false);
  const [previewLang, setPreviewLang] = useState<"ja" | "en">("ja");
  const [previewValues, setPreviewValues] = useState(defaultValues);

  const { mutateAsync: create, isPending: isSaving } = useMutation({
    mutationFn: async (values: DatasetFormValues) => {
      return $createDatasetForResearch({
        data: {
          humId,
          body: {
            datasetId: values.datasetId || undefined,
            releaseDate: values.releaseDate || undefined,
            criteria: values.criteria as any || undefined,
            typeOfData: values.typeOfData.ja || values.typeOfData.en
              ? { ja: values.typeOfData.ja ?? null, en: values.typeOfData.en ?? null }
              : undefined,
            experiments: values.experiments.length > 0
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
              <BreadcrumbPage>New Dataset</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-normal text-gray-500">
          Preview
          <Switch
            checked={preview}
            onCheckedChange={setPreview}
            className="data-[state=checked]:bg-secondary"
          />
        </label>
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
              versionData={datasetFormValuesToPreviewDataset(previewValues)}
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
          readOnly={false}
          onSubmit={async (values) => {
            await create(values);
          }}
          isSaving={isSaving}
          error={error}
          saveLabel="Create dataset"
          showDatasetIdField
          onValuesChange={setPreviewValues}
        />
      </div>
    </div>
  );
}
