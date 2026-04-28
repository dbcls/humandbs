import { createFileRoute } from "@tanstack/react-router";

import { useAutoAddToCart } from "@/hooks/useCart";
import { getDatasetQueryOptions } from "@/serverFunctions/datasets";

import { DatasetVersionCard } from "./-DatasetVersionCard";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/dataset/$datasetId/$version",
)({
  component: RouteComponent,
  loader: async ({ params, context }) => {
    const { data } = await context.queryClient.ensureQueryData(
      getDatasetQueryOptions({
        datasetId: params.datasetId,
        lang: context.lang,
        version: params.version,
        includeRawHtml: false,
      }),
    );

    return { data, crumb: params.version };
  },
});

function RouteComponent() {
  const { data } = Route.useLoaderData();

  useAutoAddToCart(data);

  return <DatasetVersionCard versionData={data} />;
}
