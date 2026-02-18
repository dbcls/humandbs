import { createFileRoute } from "@tanstack/react-router";

import { getDatasetQueryOptions } from "@/serverFunctions/datasets";

import { DatasetVersionCard } from "./-DatasetVersionCard";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/datasets/$datasetId/$version"
)({
  component: RouteComponent,
  loader: async ({ params, context }) => {
    const data = await context.queryClient.ensureQueryData(
      getDatasetQueryOptions({
        datasetId: params.datasetId,
        lang: context.lang,
        version: params.version,
      })
    );

    return { data, crumb: params.version };
  },
});

function RouteComponent() {
  const { data } = Route.useLoaderData();

  return <DatasetVersionCard versionData={data} />;
}
