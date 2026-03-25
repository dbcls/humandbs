import {
  DatasetForm,
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
import { $createDatasetForResearch } from "@/serverFunctions/datasets";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

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

  const { mutateAsync: create, isPending: isSaving } = useMutation({
    mutationFn: async (values: DatasetFormValues) => {
      return $createDatasetForResearch({
        data: {
          humId,
          body: {
            datasetId: undefined,
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
      <div className="shrink-0 px-5 pt-5">
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
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5">
        <DatasetForm
          defaultValues={defaultValues}
          readOnly={false}
          onSubmit={async (values) => { await create(values); }}
          isSaving={isSaving}
          error={error}
          saveLabel="Create dataset"
        />
      </div>
    </div>
  );
}
