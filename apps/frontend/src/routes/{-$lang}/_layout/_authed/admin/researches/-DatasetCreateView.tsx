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
import { Button } from "@/components/ui/button";
import { DatasetVersionCard } from "@/routes/{-$lang}/_layout/_main/_other/data-use/datasets/$datasetId/-DatasetVersionCard";
import { $createDatasetForResearch } from "@/serverFunctions/datasets";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { IntlProvider } from "use-intl";
import { messages } from "@/config/messages";
import { TabContentLayout } from "./-TabContentLayout";
import { cn } from "@/lib/utils";

interface DatasetCreateViewProps {
  humId: string;
  onBack: () => void;
  onCreated: (datasetId: string) => void;
  preview?: boolean;
}

export function DatasetCreateView({
  humId,
  onBack,
  onCreated,
  preview = false,
}: DatasetCreateViewProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const defaultValues = useMemo(
    () => getDefaultDatasetFormValues(humId),
    [humId],
  );
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

  const breadcrumb = (
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
          <BreadcrumbPage>New Dataset</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
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
          ?.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
      }}
    >
      {isSaving ? "Creating…" : "Create dataset"}
    </Button>
  );

  return (
    <TabContentLayout header={breadcrumb} actions={actions}>
      <div
        className={cn({
          hidden: preview,
        })}
      >
        <DatasetForm
          defaultValues={defaultValues}
          readOnly={false}
          onSubmit={async (values) => {
            await create(values);
          }}
          isSaving={isSaving}
          error={error}
          showDatasetIdField
          onValuesChange={setPreviewValues}
          hideSaveButton
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
