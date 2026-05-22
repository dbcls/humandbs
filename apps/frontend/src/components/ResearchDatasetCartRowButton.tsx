import { useQuery } from "@tanstack/react-query";

import { isCartableDatasetId } from "@/hooks/useCart";
import { getDatasetsOfResearchQueryOptions } from "@/serverFunctions/datasets";

import { AddToCartToggle } from "./AddToCartToggle";
import { DatasetCartRowButton } from "./DatasetCartRowButton";

export function ResearchDatasetCartRowButton({
  datasetId,
  humId,
}: {
  datasetId: string;
  humId: string;
}) {
  const isCartable = isCartableDatasetId(datasetId);

  const { data } = useQuery({
    ...getDatasetsOfResearchQueryOptions(humId),
    enabled: isCartable,
  });

  if (!isCartable) {
    return <span className="inline-block w-8 shrink-0" aria-hidden="true" />;
  }

  const dataset = data?.data.find((item) => item.datasetId === datasetId);

  if (!dataset) {
    return <AddToCartToggle state={false} disabled />;
  }

  return <DatasetCartRowButton dataset={dataset} />;
}
