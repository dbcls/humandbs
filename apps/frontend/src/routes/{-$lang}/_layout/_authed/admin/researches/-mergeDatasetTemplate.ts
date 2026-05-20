import type { DatasetTemplateData } from "../../../../../../../../backend/src/api/types/templates";
import type { DatasetFormValues } from "@/components/form-context/datasetFields/DatasetForm";
import { experimentDataToEntries } from "@/components/form-context/datasetFields/ExperimentsArrayField";

function isEmpty(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

export function mergeDatasetTemplate(
  current: DatasetFormValues,
  incoming: DatasetTemplateData,
): DatasetFormValues {
  return {
    datasetId: isEmpty(current.datasetId) && incoming.datasetId
      ? incoming.datasetId
      : current.datasetId,
    humId: current.humId,
    humVersionId: current.humVersionId,
    releaseDate: isEmpty(current.releaseDate) && incoming.releaseDate
      ? incoming.releaseDate
      : current.releaseDate,
    criteria: isEmpty(current.criteria) && incoming.criteria
      ? incoming.criteria
      : current.criteria,
    typeOfData: {
      ja: isEmpty(current.typeOfData.ja) && incoming.typeOfData?.ja
        ? incoming.typeOfData.ja
        : current.typeOfData.ja,
      en: isEmpty(current.typeOfData.en) && incoming.typeOfData?.en
        ? incoming.typeOfData.en
        : current.typeOfData.en,
    },
    experiments:
      current.experiments.length === 0 && incoming.experiments && incoming.experiments.length > 0
        ? incoming.experiments.map((exp) => ({
            header: exp.header,
            data: experimentDataToEntries(exp.data as any),
          }))
        : current.experiments,
  };
}
