import type { DatasetFormValues } from "@/components/form-context/dataset-fields/DatasetForm";
import { experimentDataToEntries } from "@/components/form-context/dataset-fields/ExperimentsArrayField";

import type { DatasetTemplateData } from "../../../../../../../../../../backend/src/api/types/templates";

function isEmpty(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

// Returns true if applying the template would overwrite any field the user has filled in.
export function templateWouldOverwrite(
  current: DatasetFormValues,
  incoming: DatasetTemplateData,
): boolean {
  if (!isEmpty(current.releaseDate) && incoming.releaseDate) return true;
  if (!isEmpty(current.criteria) && incoming.criteria) return true;
  if (!isEmpty(current.typeOfData.ja) && incoming.typeOfData?.ja) return true;
  if (!isEmpty(current.typeOfData.en) && incoming.typeOfData?.en) return true;
  if (current.experiments.length > 0 && incoming.experiments && incoming.experiments.length > 0)
    return true;
  return false;
}

export function mergeDatasetTemplate(
  current: DatasetFormValues,
  incoming: DatasetTemplateData,
): DatasetFormValues {
  return {
    datasetId: incoming.datasetId ?? current.datasetId,
    humId: current.humId,
    humVersionId: current.humVersionId,
    releaseDate: incoming.releaseDate ?? current.releaseDate,
    criteria: incoming.criteria ?? current.criteria,
    typeOfData: {
      ja: incoming.typeOfData?.ja ?? current.typeOfData.ja,
      en: incoming.typeOfData?.en ?? current.typeOfData.en,
    },
    experiments:
      incoming.experiments && incoming.experiments.length > 0
        ? incoming.experiments.map((exp) => ({
            header: exp.header,
            data: experimentDataToEntries(exp.data as any),
          }))
        : current.experiments,
  };
}
